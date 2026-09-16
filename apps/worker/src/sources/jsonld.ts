/**
 * Generic schema.org/Event extractor.
 *
 * This is the long tail: councils, venues, promoters. Most of them publish
 * JSON-LD Event markup for Google, which means one extractor plus a row in
 * `sources.config` covers a new site — no new code. That is the difference
 * between adding a source in five minutes and adding one in a day.
 *
 * Configure per source:
 *   { "seeds": ["https://example.nz/whats-on"], "defaultCity": "auckland" }
 */
import { inferCategory, resolveCity, type NormalizedListing } from "@kiwi/core";
import type { FetchContext, SourceAdapter } from "./types";

const LD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Every JSON-LD node on the page, flattened out of @graph and arrays. */
export function extractJsonLdNodes(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(LD_RE)) {
    const body = m[1];
    if (!body) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.trim());
    } catch {
      continue; // malformed JSON-LD is extremely common; skip quietly
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (node && typeof node === "object") {
        const rec = node as Record<string, unknown>;
        if (Array.isArray(rec["@graph"])) stack.push(...(rec["@graph"] as unknown[]));
        out.push(rec);
      }
    }
  }
  return out;
}

function isEventNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const t = (node as Record<string, unknown>)["@type"];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === "string" && /Event$/i.test(x));
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "name" in v) return str((v as Record<string, unknown>).name);
  return null;
}
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function normalizeJsonLdEvent(
  node: Record<string, unknown>,
  ctx: { sourceSlug: string; pageUrl: string; defaultCity?: string | null },
): NormalizedListing | null {
  const title = str(node.name);
  const startRaw = str(node.startDate);
  if (!title || !startRaw) return null;

  // JSON-LD startDate is ISO 8601 and usually carries an offset. When it does
  // not, it is a local NZ time — but we cannot tell those apart here, so trust
  // the string and let Date do it; parseNzLocal is used only for sources we
  // know publish naive local time.
  const startsAt = new Date(startRaw);
  if (Number.isNaN(startsAt.getTime())) return null;

  const endRaw = str(node.endDate);
  const endsAt = endRaw ? new Date(endRaw) : null;

  const location = (node.location ?? null) as Record<string, unknown> | null;
  const geo = (location?.geo ?? null) as Record<string, unknown> | null;
  const lat = num(geo?.latitude);
  const lng = num(geo?.longitude);
  const point = lat !== null && lng !== null ? { lat, lng } : null;

  const addr = location?.address;
  const address =
    typeof addr === "string"
      ? addr
      : addr && typeof addr === "object"
        ? [
            str((addr as Record<string, unknown>).streetAddress),
            str((addr as Record<string, unknown>).addressLocality),
            str((addr as Record<string, unknown>).addressRegion),
          ].filter(Boolean).join(", ") || null
        : null;

  const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
  const prices = offers
    .map((o) => num((o as Record<string, unknown>)?.price))
    .filter((p): p is number => p !== null && p > 0);

  const url = str(node.url) ?? ctx.pageUrl;
  const image = Array.isArray(node.image) ? str(node.image[0]) : str(node.image);

  return {
    sourceSlug: ctx.sourceSlug,
    externalId: str(node["@id"]) ?? url,
    url,
    title,
    summary: str(node.description)?.replace(/\s+/g, " ").slice(0, 600) ?? null,
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
    isFree: offers.some((o) => num((o as Record<string, unknown>)?.price) === 0),
    priceFrom: prices.length ? Math.min(...prices) : null,
    venueName: str(location?.name),
    address,
    point,
    citySlug: resolveCity(point) ?? ctx.defaultCity ?? null,
    categoryHint: str(node.eventAttendanceMode) ?? inferCategory(title, str(node.description)),
    coverImageUrl: image,
    popularity: 0,
    raw: node,
  };
}

export function makeJsonLdAdapter(slug: string): SourceAdapter {
  return {
    slug,
    async *fetchAll(ctx: FetchContext) {
      const seeds = (ctx.config.seeds as string[] | undefined) ?? [];
      const defaultCity = (ctx.config.defaultCity as string | undefined) ?? null;
      if (!seeds.length) {
        ctx.log(`${slug}: no seeds configured, nothing to do`);
        return;
      }

      for (const seed of seeds) {
        let html: string;
        try {
          const res = await fetch(seed, {
            headers: { "user-agent": "KiwiTodayBot/0.1 (+https://kiwitoday.nz/bot)" },
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) { ctx.log(`${slug}: ${res.status} for ${seed}`); continue; }
          html = await res.text();
        } catch (err) {
          ctx.log(`${slug}: fetch failed for ${seed}`, { err: String(err) });
          continue;
        }

        const listings = extractJsonLdNodes(html)
          .filter(isEventNode)
          .map((n) => normalizeJsonLdEvent(n, { sourceSlug: slug, pageUrl: seed, defaultCity }))
          .filter((l): l is NormalizedListing => l !== null);

        ctx.log(`${slug}: ${seed} -> ${listings.length} events`);
        if (listings.length) yield listings;
        await new Promise((r) => setTimeout(r, 800));
      }
    },
  };
}
