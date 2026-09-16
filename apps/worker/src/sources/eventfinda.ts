/**
 * Eventfinda v2 adapter.  https://www.eventfinda.co.nz/api/v2/index
 *
 * IMPORTANT — the field mapping below is written against Eventfinda's
 * documented v2 Event resource but has NOT been verified against a live
 * response (their docs site is not reachable from CI). Every field is optional
 * and the whole raw payload is stored in source_records.raw, so a wrong guess
 * costs a re-normalise, not a re-crawl.
 *
 * Verify in 30 seconds once you have a key:
 *     pnpm ingest -- --source eventfinda --dry-run --limit 1
 * which prints the first raw record. Fix the mapping here, then:
 *     pnpm ingest -- --source eventfinda --renormalize
 */
import { inferCategory, parseNzLocal, type NormalizedListing } from "@kiwi/core";
import { z } from "zod";
import { getJson, type FetchContext, type SourceAdapter } from "./types";

const point = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).partial().nullish();

const efEvent = z
  .object({
    id: z.union([z.number(), z.string()]),
    url: z.string().nullish(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    datetime_start: z.string().nullish(),
    datetime_end: z.string().nullish(),
    is_free: z.union([z.boolean(), z.number(), z.string()]).nullish(),
    address: z.string().nullish(),
    point,
    location: z.object({ name: z.string().nullish() }).partial().nullish(),
    location_summary: z.string().nullish(),
    category: z.object({ name: z.string().nullish() }).partial().nullish(),
    images: z
      .object({
        images: z
          .array(
            z.object({
              is_primary: z.union([z.boolean(), z.number()]).nullish(),
              transforms: z
                .object({ transforms: z.array(z.object({ url: z.string().nullish(), width: z.coerce.number().nullish() }).partial()).nullish() })
                .partial()
                .nullish(),
            }).partial(),
          )
          .nullish(),
      })
      .partial()
      .nullish(),
    ticket_types: z
      .object({ ticket_types: z.array(z.object({ price: z.coerce.number().nullish() }).partial()).nullish() })
      .partial()
      .nullish(),
  })
  .passthrough();

const efPage = z
  .object({ "@attributes": z.object({ count: z.coerce.number().nullish() }).partial().nullish(), events: z.array(efEvent).nullish() })
  .passthrough();

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

/** Largest transform of the primary image; falls back to the first image. */
function coverImage(e: z.infer<typeof efEvent>): string | null {
  const images = e.images?.images ?? [];
  const primary = images.find((i) => truthy(i.is_primary)) ?? images[0];
  const transforms = primary?.transforms?.transforms ?? [];
  const best = [...transforms]
    .filter((t) => t.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return best?.url ?? null;
}

function minPrice(e: z.infer<typeof efEvent>): number | null {
  const prices = (e.ticket_types?.ticket_types ?? [])
    .map((t) => t.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function normalizeEventfinda(raw: unknown): NormalizedListing | null {
  const parsed = efEvent.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;

  const startsAt = parseNzLocal(e.datetime_start);
  const title = e.name?.trim();
  // No title or no start time means it cannot be rendered on a card or placed
  // in a date bucket — drop it rather than serve a broken row.
  if (!startsAt || !title) return null;

  const lat = e.point?.lat;
  const lng = e.point?.lng;
  const venueName = e.location?.name?.trim() || null;

  return {
    sourceSlug: "eventfinda",
    externalId: String(e.id),
    url: e.url ?? `https://www.eventfinda.co.nz/event/${e.id}`,
    title,
    summary: e.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) || null,
    startsAt,
    endsAt: parseNzLocal(e.datetime_end),
    isFree: truthy(e.is_free),
    priceFrom: minPrice(e),
    venueName,
    address: e.address?.trim() || e.location_summary?.trim() || null,
    point: typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null,
    citySlug: null, // resolved from coordinates in the pipeline
    categoryHint: e.category?.name ?? null,
    coverImageUrl: coverImage(e),
    popularity: 0, // Eventfinda exposes no engagement signal
    raw,
  };
}

export const eventfindaAdapter: SourceAdapter = {
  slug: "eventfinda",

  async *fetchAll(ctx: FetchContext) {
    const username = process.env.EVENTFINDA_USERNAME;
    const password = process.env.EVENTFINDA_PASSWORD;
    if (!username || !password) {
      throw new Error("EVENTFINDA_USERNAME / EVENTFINDA_PASSWORD are not set — request a key at https://www.eventfinda.co.nz/api/v2/index");
    }

    const baseUrl = String(ctx.config.baseUrl ?? "https://api.eventfinda.co.nz/v2");
    const rows = Number(ctx.config.rows ?? 200);
    const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const until = new Date(Date.now() + ctx.horizonDays * 86_400_000);

    let offset = 0;
    for (;;) {
      const url = new URL(`${baseUrl}/events.json`);
      url.searchParams.set("rows", String(rows));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("order", "date");
      url.searchParams.set("end_date", until.toISOString().slice(0, 10));

      const page = efPage.safeParse(await getJson(url.toString(), { headers: { authorization: auth } }));
      if (!page.success) {
        ctx.log("eventfinda: unexpected page shape, stopping", { offset, issues: page.error.issues.slice(0, 3) });
        return;
      }

      const events = page.data.events ?? [];
      if (!events.length) return;

      const batch = events
        .map((e) => normalizeEventfinda(e))
        .filter((l): l is NormalizedListing => l !== null);

      ctx.log(`eventfinda: page offset=${offset} raw=${events.length} usable=${batch.length}`);
      if (batch.length) yield batch;

      offset += events.length;
      if (events.length < rows) return;
      // Be a polite client; their ToS asks for reasonable request rates.
      await new Promise((r) => setTimeout(r, 400));
    }
  },
};
