/**
 * Source probe — answers "can I ingest this site, and how?" in one command.
 *
 *   pnpm probe https://www.aucklandnz.com/events/all-events
 *
 * Adding a source is mostly a research question: does the page carry
 * schema.org markup (free, deterministic, done), or does it need an LLM
 * extraction pass (costs money, needs guards)? Answering that by reading
 * someone's HTML by hand is miserable, so this does it.
 *
 * Prints the JSON-LD it found, what would be normalised out of it, and a
 * ready-to-paste INSERT for the sources table.
 */
import { parseArgs } from "node:util";
import type { NormalizedListing } from "@kiwi/core";
import { extractJsonLdNodes, normalizeJsonLdEvent } from "./sources/jsonld.js";

const { values, positionals } = parseArgs({
  options: { city: { type: "string" }, slug: { type: "string" }, verbose: { type: "boolean", default: false } },
  allowPositionals: true,
});

if (!positionals[0]) {
  console.error("usage: pnpm probe <url> [--city auckland] [--slug my-source] [--verbose]");
  process.exit(2);
}
const url: string = positionals[0];

function typeOf(node: unknown): string {
  const t = (node as Record<string, unknown>)?.["@type"];
  return Array.isArray(t) ? t.join("/") : typeof t === "string" ? t : "(untyped)";
}

async function main() {
  process.stdout.write(`→ fetching ${url}\n`);
  let html: string;
  let status: number;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "KiwiTodayBot/0.1 (+https://kiwitoday.nz/bot)" },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    status = res.status;
    html = await res.text();
  } catch (err) {
    console.error(`✗ fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("  If this is a 403, the site may be behind Cloudflare — try from a browser-like");
    console.error("  client, or check whether they publish an iCal/RSS feed instead.");
    process.exit(1);
  }

  process.stdout.write(`  HTTP ${status}, ${(html.length / 1024).toFixed(0)}KB\n\n`);

  // A blocked or empty response must never be reported as "this site has no
  // markup" — that conclusion would send you off to build LLM extraction for a
  // source that may well publish perfect JSON-LD.
  if (status < 200 || status >= 300) {
    console.log(`✗ HTTP ${status} — could not read the page, so nothing can be concluded about it.`);
    if (status === 403 || status === 429) {
      console.log("  → Bot protection (Cloudflare/Akamai) or rate limiting.");
      console.log("  → Try a browser user-agent, or run the probe from a residential connection.");
      console.log("  → If it stays blocked, respect it: look for an official feed or API instead.");
    }
    process.exit(1);
  }
  if (html.trim().length < 500) {
    console.log("✗ response body is essentially empty — nothing can be concluded.");
    console.log("  → Likely a JS-rendered page. Try the site's underlying API (check the");
    console.log("    network tab), or render it with Playwright before probing.");
    process.exit(1);
  }

  const nodes = extractJsonLdNodes(html);
  if (!nodes.length) {
    console.log("✗ no JSON-LD found.");
    console.log("  → This site needs LLM extraction (tier 3), not the generic adapter.");
    console.log("  → Before paying for that, check for an easier feed:");
    console.log("      curl -s <site>/events.ics      # iCal");
    console.log("      curl -s <site>/feed            # RSS/Atom");
    console.log("      grep -o 'wp-json[^\"]*' page   # WordPress REST API");
    process.exit(0);
  }

  const byType = new Map<string, number>();
  for (const n of nodes) byType.set(typeOf(n), (byType.get(typeOf(n)) ?? 0) + 1);
  console.log(`✓ ${nodes.length} JSON-LD node(s):`);
  for (const [type, count] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count}× ${type}`);
  }

  const events = nodes.filter((n) => {
    const t = (n as Record<string, unknown>)["@type"];
    return (Array.isArray(t) ? t : [t]).some((x) => typeof x === "string" && /Event$/i.test(x));
  });

  if (!events.length) {
    console.log("\n✗ JSON-LD present, but no Event nodes.");
    console.log("  → Event markup may only exist on individual event pages, not this index.");
    console.log("  → Try probing one event's detail page; if that works, the source needs a");
    console.log("    two-step crawl (index → detail) rather than a single seed URL.");
    process.exit(0);
  }

  const slug = values.slug ?? new URL(url).hostname.replace(/^www\./, "").replace(/\..*$/, "");
  const normalized = events
    .map((n) => normalizeJsonLdEvent(n as Record<string, unknown>, {
      sourceSlug: slug, pageUrl: url, defaultCity: values.city ?? null,
    }))
    .filter((l): l is NormalizedListing => l !== null);

  console.log(`\n✓ ${events.length} Event node(s), ${normalized.length} usable after normalisation.`);
  if (normalized.length < events.length) {
    console.log(`  (${events.length - normalized.length} dropped — missing a title or a parseable startDate)`);
  }

  const withPoint = normalized.filter((l) => l.point).length;
  const withVenue = normalized.filter((l) => l.venueName).length;
  const withImage = normalized.filter((l) => l.coverImageUrl).length;
  console.log(`  coordinates: ${withPoint}/${normalized.length}   venue: ${withVenue}/${normalized.length}   image: ${withImage}/${normalized.length}`);
  if (withPoint === 0) {
    console.log("  ⚠ no coordinates — events will not appear on the map or in city filters");
    console.log("    unless you set --city / defaultCity for this source.");
  }

  console.log("\nsample:");
  for (const l of normalized.slice(0, values.verbose ? 20 : 3)) {
    console.log(`  • ${l.title}`);
    console.log(`    ${l.startsAt.toISOString()}  ${l.venueName ?? "(no venue)"}  ${l.point ? `${l.point.lat},${l.point.lng}` : "(no coords)"}`);
    console.log(`    ${l.url}`);
  }

  console.log(`\nIf that looks right, add the source:\n`);
  console.log(`INSERT INTO sources (slug, name, kind, attribution, config) VALUES (`);
  console.log(`  '${slug}', '${new URL(url).hostname}', 'jsonld',`);
  console.log(`  'Event data from ${new URL(url).hostname}',`);
  console.log(`  '${JSON.stringify({ seeds: [url], ...(values.city ? { defaultCity: values.city } : {}) })}'`);
  console.log(`);`);
}

main().catch((err) => { console.error(err); process.exit(1); });
