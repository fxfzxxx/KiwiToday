import { createHash } from "node:crypto";
import { nzLocalToInstant, type NormalizedListing } from "@kiwi/core";
import type { VenueSource } from "./catalog";
import type { VenueReport } from "./crawl";

const SOURCE_URL = "https://www.eventfindastadium.co.nz/upcoming";
const FEED_URL = "https://efs.venueiq.co.nz/api/public-events?token=a2d11316dd2a492b8c65f44f07407aa3a0042448d93648ebb68007cfffa9786f";

interface VenueIqEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  description?: string;
  imageUrl?: string;
  ticketsUrl?: string;
  locationName?: string;
  locationAddress?: string;
}

function cleanDescription(value: string | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 600) : null;
}

export async function crawlEventfindaStadium(source: VenueSource, options: {
  now: Date; days: number; fetcher?: typeof fetch;
}): Promise<VenueReport> {
  const fetcher = options.fetcher ?? fetch;
  const checkedAt = options.now.toISOString();
  const report: VenueReport = {
    venue: source, checkedAt, days: options.days, coverage: "partial", truncated: false,
    events: [], pages: [], dateOnlyAnnouncements: [],
  };
  try {
    const response = await fetcher(FEED_URL, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`VenueIQ HTTP ${response.status}`);
    const payload = await response.json() as { events?: VenueIqEvent[] };
    const from = options.now.getTime();
    const until = from + options.days * 86_400_000;
    const events = new Map<string, NormalizedListing>();
    for (const row of payload.events ?? []) {
      const startsAt = new Date(row.start);
      const endsAt = new Date(row.end);
      if (!row.title || Number.isNaN(startsAt.getTime()) || startsAt.getTime() < from || startsAt.getTime() >= until) continue;
      const key = `${row.id}:${row.start}`;
      events.set(key, {
        sourceSlug: source.slug, externalId: String(row.id), url: row.ticketsUrl || SOURCE_URL,
        title: row.title.trim(), summary: cleanDescription(row.description), startsAt,
        endsAt: Number.isNaN(endsAt.getTime()) ? null : endsAt,
        isFree: /\bfree\b/i.test(row.description ?? ""), priceFrom: null,
        venueName: row.locationName?.trim() || source.name, address: row.locationAddress?.trim() || "17 Silverfield, Auckland",
        point: null, citySlug: source.city, categoryHint: row.title,
        coverImageUrl: row.imageUrl ?? null, popularity: 0,
        raw: { data: row },
      });
    }
    report.events = [...events.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    report.pages.push({ url: FEED_URL, checkedAt, contentHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), text: JSON.stringify(payload).slice(0, 30_000), status: "structured" });
  } catch (error) {
    report.pages.push({ url: SOURCE_URL, checkedAt, contentHash: "", text: "", status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
  return report;
}