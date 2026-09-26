import { createHash } from "node:crypto";
import { load } from "cheerio";
import robotsParser from "robots-parser";
import type { NormalizedListing } from "@kiwi/core";
import { extractJsonLdNodes, normalizeJsonLdEvent } from "../sources/jsonld";
import type { VenueSource } from "./catalog";
import { extractAnnouncements, extractPageMeta } from "./announcements";

const USER_AGENT = "KiwiTodayBot/0.1";
export interface PageEvidence {
  url: string; checkedAt: string; contentHash: string; text: string;
  status: "structured" | "needs-extraction" | "failed";
  error?: string;
}
export interface VenueReport {
  venue: VenueSource; checkedAt: string; days: number;
  coverage: "partial"; truncated: boolean;
  events: NormalizedListing[]; pages: PageEvidence[];
  dateOnlyAnnouncements: { title: string; date: string; endDate?: string; sourceUrl: string; precision: "day"; imageUrl?: string; summary?: string; scheduleText?: string; sessionDates?: string[] }[];
}

export function allowedUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.origin !== new URL(base).origin || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
    }
    return url.href;
  } catch { return null; }
}

export function discoverLinks(html: string, base: string, prefixes: readonly string[]): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  $("a[href]").each((_, el) => {
    const url = allowedUrl($(el).attr("href")!, base);
    if (!url) return;
    const pathname = new URL(url).pathname;
    if (/\.(pdf|jpg|png|zip|mp4|svg|ics)$/i.test(pathname)) return;
    if (prefixes.some((prefix) => pathname.startsWith(prefix))) urls.add(url);
  });
  return [...urls];
}

export function pageText(html: string): string {
  const $ = load(html);
  const title = $("h1").first().text();
  $("script,style,noscript,nav,footer,header").remove();
  $("p,div,li,h1,h2,h3,span,time,br").append(" ");
  return `${title} ${$("main").length ? $("main").text() : $("body").text()}`.replace(/\s+/g, " ").trim().slice(0, 30_000);
}

async function boundedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("response body timed out")), 20_000); });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), timeout]);
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 2_000_000) throw new Error("page exceeds 2 MB limit");
      chunks.push(next.value);
    }
  } finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function crawlVenue(source: VenueSource, options: {
  days?: number; now?: Date; fetcher?: typeof fetch; delayMs?: number;
} = {}): Promise<VenueReport> {
  const now = options.now ?? new Date();
  const days = options.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("days must be 1–366");
  if (!Number.isInteger(source.maxPages) || source.maxPages < 1 || source.maxPages > 100) throw new Error("maxPages must be 1–100");
  const fetcher = options.fetcher ?? fetch;
  const report: VenueReport = { venue: source, checkedAt: now.toISOString(), days, coverage: "partial", truncated: false, events: [], pages: [], dateOnlyAnnouncements: [] };
  const policies = new Map<string, ReturnType<typeof robotsParser>>();
  const seen = new Set<string>();
  const events = new Map<string, NormalizedListing>();
  const queue = [...source.seeds];
  const deadline = Date.now() + 90_000;
  let lastRequest = 0;
  async function request(url: string): Promise<Response> {
    const pause = Math.max(0, (options.delayMs ?? 1000) - (Date.now() - lastRequest));
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    lastRequest = Date.now();
    // Redirects require an explicit source configuration change; never follow off-site.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fetcher(url, { redirect: "manual", signal: controller.signal, headers: { "user-agent": USER_AGENT } }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("request timed out")); }, Math.max(1, Math.min(20_000, deadline - Date.now()))); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
  while (queue.length && seen.size < source.maxPages && Date.now() < deadline) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      if (!source.seeds.some((seed) => allowedUrl(url, seed))) throw new Error("URL outside approved source origin");
      const origin = new URL(url).origin;
      let policy = policies.get(origin);
      if (!policy) {
        const robotsUrl = `${origin}/robots.txt`;
        const robots = await request(robotsUrl);
        if (!robots.ok && robots.status !== 404) throw new Error(`robots.txt HTTP ${robots.status}`);
        policy = robotsParser(robotsUrl, robots.status === 404 ? "" : await boundedBody(robots));
        policies.set(origin, policy);
      }
      if (policy.isAllowed(url, USER_AGENT) === false) throw new Error("disallowed by robots.txt");
      const crawlDelay = policy.getCrawlDelay(USER_AGENT);
      if (crawlDelay && crawlDelay > 1) {
        if (crawlDelay > 60) throw new Error("crawl-delay exceeds pilot limit; schedule this source separately");
        await new Promise((resolve) => setTimeout(resolve, crawlDelay * 1000));
      }
      const response = await request(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!(response.headers.get("content-type") ?? "").includes("text/html")) throw new Error("not an HTML page");
      const html = await boundedBody(response);
      const localDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
      const pageMeta = extractPageMeta(html, url);
      for (const existing of report.dateOnlyAnnouncements) {
        if (existing.sourceUrl === url) Object.assign(existing,
          source.slug === "auckland-art-gallery" ? (pageMeta.imageUrl ? { imageUrl: pageMeta.imageUrl } : {}) : pageMeta,
        );
      }
      for (const extracted of extractAnnouncements(source.slug, html, url)) {
        const item = extracted.sourceUrl === url
          ? source.slug === "auckland-art-gallery"
            ? { ...extracted, ...(extracted.imageUrl ? {} : pageMeta.imageUrl ? { imageUrl: pageMeta.imageUrl } : {}) }
            : { ...extracted, ...pageMeta }
          : extracted;
        if ((item.endDate ?? item.date) >= localDay(now) && item.date < localDay(new Date(now.getTime() + days * 86400_000))) {
          const existing = report.dateOnlyAnnouncements.find((candidate) => candidate.sourceUrl === item.sourceUrl && candidate.date === item.date && candidate.title === item.title);
          if (existing) Object.assign(existing, item);
          else report.dateOnlyAnnouncements.push(item);
          const detail = allowedUrl(item.sourceUrl, url);
          if (detail && source.linkPrefixes.some((prefix) => new URL(detail).pathname.startsWith(prefix)) && !seen.has(detail) && !queue.includes(detail)) queue.push(detail);
        }
      }
      // Spark's visible time element is a calendar date, not a verified show time.
      // Keep this separate from timestamped events to avoid inventing midnight shows.
      if (["spark-arena", "tuning-fork"].includes(source.slug) && /\/(all-events|whats-on)\//.test(new URL(url).pathname)) {
        const $ = load(html);
        const title = $("h1").first().text().trim();
        const nzDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
        const dates = new Set($("time[datetime]").map((_, el) => $(el).attr("datetime")!.slice(0, 10)).get());
        for (const date of dates) {
          if (title && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= nzDate(now) && date < nzDate(new Date(now.getTime() + days * 86400_000))) {
            const existing = report.dateOnlyAnnouncements.find((item) => item.sourceUrl === url && item.date === date && item.title === title);
            if (existing) Object.assign(existing, pageMeta);
            else report.dateOnlyAnnouncements.push({ title, date, sourceUrl: url, precision: "day", ...pageMeta });
          }
        }
      }
      let found = 0;
      for (const node of extractJsonLdNodes(html)) {
        const record = node as Record<string, unknown>;
        const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        if (!types.some((type) => typeof type === "string" && /Event$/.test(type))) continue;
        // This publisher's JSON-LD date can be one calendar day earlier than its visible NZ date.
        if (source.slug === "auckland-art-gallery") continue;
        const listing = normalizeJsonLdEvent(record, { sourceSlug: source.slug, pageUrl: url, defaultCity: source.city });
        if (!listing) continue;
        found++;
        // Do not attribute other venues advertised in shared navigation to this venue.
        if (!listing.venueName || !listing.venueName.toLowerCase().includes(source.name.toLowerCase())) continue;
        if ((listing.endsAt ?? listing.startsAt) < now || listing.startsAt.getTime() >= now.getTime() + days * 86400_000) continue;
        const key = `${listing.url}|${listing.title}|${listing.startsAt.toISOString()}`;
        listing.externalId = createHash("sha256").update(key).digest("hex");
        listing.raw = { data: node, evidence: { url, checkedAt: now.toISOString(), method: "jsonld" } };
        events.set(key, listing);
      }
      const text = pageText(html);
      report.pages.push({ url, checkedAt: now.toISOString(), contentHash: createHash("sha256").update(text).digest("hex"), text, status: found ? "structured" : "needs-extraction" });
      for (const link of discoverLinks(html, url, source.linkPrefixes)) {
        if (!seen.has(link) && !queue.includes(link)) queue.push(link);
      }
    } catch (error) {
      report.pages.push({ url, checkedAt: now.toISOString(), contentHash: "", text: "", status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  report.truncated = queue.some((url) => !seen.has(url));
  report.events = [...events.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  report.dateOnlyAnnouncements.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return report;
}
