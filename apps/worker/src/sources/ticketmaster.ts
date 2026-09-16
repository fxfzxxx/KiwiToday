/**
 * Ticketmaster Discovery API adapter.  https://developer.ticketmaster.com/
 *
 * Covers the big ticketed venues — Spark Arena, Eden Park, the town halls —
 * which Eventfinda carries inconsistently. Overlap with Eventfinda is expected
 * and desirable: two sources agreeing is what drives `source_count`, and the
 * dedup matcher is what stops it becoming two rows.
 *
 * As with Eventfinda, the field mapping is written from the documented shape
 * and should be confirmed against a live response before you trust a full run:
 *     pnpm ingest -- --source ticketmaster --dry-run --limit 1
 */
import { parseNzLocal, resolveCity, type NormalizedListing } from "@kiwi/core";
import { z } from "zod";
import { getJson, type FetchContext, type SourceAdapter } from "./types.js";

const tmEvent = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    url: z.string().nullish(),
    info: z.string().nullish(),
    pleaseNote: z.string().nullish(),
    dates: z
      .object({
        start: z
          .object({
            dateTime: z.string().nullish(),   // absolute UTC instant
            localDate: z.string().nullish(),  // fallback when time is TBA
            localTime: z.string().nullish(),
            dateTBA: z.boolean().nullish(),
            timeTBA: z.boolean().nullish(),
          })
          .partial()
          .nullish(),
        end: z.object({ dateTime: z.string().nullish() }).partial().nullish(),
        // "onsale" | "offsale" | "cancelled" | "postponed" | "rescheduled"
        status: z.object({ code: z.string().nullish() }).partial().nullish(),
      })
      .partial()
      .nullish(),
    classifications: z
      .array(
        z.object({
          segment: z.object({ name: z.string().nullish() }).partial().nullish(),
          genre: z.object({ name: z.string().nullish() }).partial().nullish(),
        }).partial(),
      )
      .nullish(),
    priceRanges: z.array(z.object({ min: z.coerce.number().nullish() }).partial()).nullish(),
    images: z.array(z.object({ url: z.string().nullish(), width: z.coerce.number().nullish() }).partial()).nullish(),
    _embedded: z
      .object({
        venues: z
          .array(
            z.object({
              name: z.string().nullish(),
              address: z.object({ line1: z.string().nullish() }).partial().nullish(),
              city: z.object({ name: z.string().nullish() }).partial().nullish(),
              location: z.object({ latitude: z.coerce.number().nullish(), longitude: z.coerce.number().nullish() }).partial().nullish(),
            }).partial(),
          )
          .nullish(),
      })
      .partial()
      .nullish(),
  })
  .passthrough();

const tmPage = z
  .object({
    _embedded: z.object({ events: z.array(tmEvent).nullish() }).partial().nullish(),
    page: z.object({ totalPages: z.coerce.number().nullish(), number: z.coerce.number().nullish() }).partial().nullish(),
  })
  .passthrough();

type TmEvent = z.infer<typeof tmEvent>;

/** Largest image wins; Ticketmaster ships a dozen crops per event. */
function coverImage(e: TmEvent): string | null {
  const best = [...(e.images ?? [])]
    .filter((i) => i.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return best?.url ?? null;
}

export function normalizeTicketmaster(raw: unknown): NormalizedListing | null {
  const parsed = tmEvent.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;

  const title = e.name?.trim();
  if (!title) return null;

  // Cancelled shows must not be ingested. Dropping them here means the run's
  // tombstone pass retires any event row we created on a previous crawl —
  // which is the whole reason we prefer a source that reports status at all.
  const status = e.dates?.status?.code?.toLowerCase();
  if (status === "cancelled") return null;

  const start = e.dates?.start;
  let startsAt: Date | null = null;
  if (start?.dateTime) {
    const d = new Date(start.dateTime);
    startsAt = Number.isNaN(d.getTime()) ? null : d;
  } else if (start?.localDate) {
    // Time TBA: localDate/localTime are NZ wall-clock, not UTC.
    startsAt = parseNzLocal(start.localTime ? `${start.localDate} ${start.localTime}` : start.localDate);
  }
  if (!startsAt) return null;

  const venue = e._embedded?.venues?.[0];
  const lat = venue?.location?.latitude;
  const lng = venue?.location?.longitude;
  const point = typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0)
    ? { lat, lng }
    : null;

  const prices = (e.priceRanges ?? [])
    .map((p) => p.min)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);

  const classification = e.classifications?.[0];

  return {
    sourceSlug: "ticketmaster",
    externalId: e.id,
    url: e.url ?? `https://www.ticketmaster.co.nz/event/${e.id}`,
    title,
    summary: (e.info ?? e.pleaseNote)?.replace(/\s+/g, " ").trim().slice(0, 600) || null,
    startsAt,
    endsAt: e.dates?.end?.dateTime ? new Date(e.dates.end.dateTime) : null,
    isFree: false, // Ticketmaster is a ticketing platform; free events are not its business
    priceFrom: prices.length ? Math.min(...prices) : null,
    venueName: venue?.name?.trim() || null,
    address: [venue?.address?.line1, venue?.city?.name].filter(Boolean).join(", ") || null,
    point,
    citySlug: resolveCity(point),
    categoryHint: [classification?.segment?.name, classification?.genre?.name].filter(Boolean).join(" ") || null,
    coverImageUrl: coverImage(e),
    // Postponed shows stay listed but should not float to the top of a feed.
    popularity: status === "postponed" ? 0 : 1,
    raw,
  };
}

export const ticketmasterAdapter: SourceAdapter = {
  slug: "ticketmaster",

  async *fetchAll(ctx: FetchContext) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      throw new Error("TICKETMASTER_API_KEY is not set — get a free key at https://developer.ticketmaster.com/");
    }

    const baseUrl = String(ctx.config.baseUrl ?? "https://app.ticketmaster.com/discovery/v2");
    const countryCode = String(ctx.config.countryCode ?? "NZ");
    const size = 200;
    const until = new Date(Date.now() + ctx.horizonDays * 86_400_000);

    let page = 0;
    for (;;) {
      const url = new URL(`${baseUrl}/events.json`);
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("countryCode", countryCode);
      url.searchParams.set("size", String(size));
      url.searchParams.set("page", String(page));
      url.searchParams.set("sort", "date,asc");
      url.searchParams.set("startDateTime", new Date().toISOString().replace(/\.\d{3}/, ""));
      url.searchParams.set("endDateTime", until.toISOString().replace(/\.\d{3}/, ""));

      const parsed = tmPage.safeParse(await getJson(url.toString()));
      if (!parsed.success) {
        ctx.log("ticketmaster: unexpected page shape, stopping", { page, issues: parsed.error.issues.slice(0, 3) });
        return;
      }

      const events = parsed.data._embedded?.events ?? [];
      if (!events.length) return;

      const batch = events
        .map((e) => normalizeTicketmaster(e))
        .filter((l): l is NormalizedListing => l !== null);

      ctx.log(`ticketmaster: page ${page} raw=${events.length} usable=${batch.length}`);
      if (batch.length) yield batch;

      const totalPages = parsed.data.page?.totalPages ?? 0;
      page++;
      if (page >= totalPages) return;
      // Discovery refuses to page beyond 1000 results. NZ never approaches that
      // inside a 120-day horizon; if it ever does, slice the date range instead.
      if (page * size >= 1000) {
        ctx.log("ticketmaster: hit the 1000-result paging ceiling — narrow the horizon to see the rest");
        return;
      }
      await new Promise((r) => setTimeout(r, 250)); // 5 req/s rate limit
    }
  },
};
