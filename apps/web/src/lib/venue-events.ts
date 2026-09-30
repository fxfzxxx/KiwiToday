import { inferCategory, nzLocalToInstant, type KiwiEvent, type ParsedEventQuery, type VenueSnapshot } from "@kiwi/core";
import snapshotData from "@/data/venue-snapshot.json";
import { filterEvents } from "./filter-events";

const snapshot = snapshotData as VenueSnapshot;

const VENUE_POINTS: Record<string, { lat: number; lng: number }> = {
  "armageddon-auckland": { lat: -36.8985, lng: 174.7984 },
  "card-merchant-westcity": { lat: -36.8526, lng: 174.6354 },
  "cosmos-con-auckland": { lat: -36.8884, lng: 174.8332 },
  "grand-archive-ascent-auckland": { lat: -36.8923225, lng: 174.7762145 },
  "eventfinda-stadium": { lat: -36.7859, lng: 174.7447 },
  "spark-arena": { lat: -36.8476, lng: 174.7768 },
  "auckland-town-hall": { lat: -36.8528, lng: 174.7625 },
  "asb-waterfront": { lat: -36.8415, lng: 174.7575 },
  "auckland-art-gallery": { lat: -36.8503, lng: 174.7668 },
  "the-civic": { lat: -36.8510, lng: 174.7640 },
  "aotea-centre": { lat: -36.8519, lng: 174.7625 },
  "bruce-mason": { lat: -36.7871, lng: 174.7736 },
  "tuning-fork": { lat: -36.8484, lng: 174.7767 },
  powerstation: { lat: -36.8660, lng: 174.7610 },
  "basement-theatre": { lat: -36.8509, lng: 174.7614 },
  "q-theatre": { lat: -36.8514, lng: 174.7605 },
  "eden-park": { lat: -36.8748, lng: 174.7449 },
  "go-media-stadium": { lat: -36.9185, lng: 174.8124 },
  "western-springs": { lat: -36.8678, lng: 174.7247 },
  "auckland-museum": { lat: -36.8604, lng: 174.7778 },
  motat: { lat: -36.8677, lng: 174.7274 },
  stardome: { lat: -36.9060, lng: 174.7767 },
  "auckland-zoo": { lat: -36.8621, lng: 174.7192 },
  "maritime-museum": { lat: -36.8404, lng: 174.7642 },
};

function dateAtEndOfDay(raw: string): Date {
  const [year, month, day] = raw.split("-").map(Number);
  return nzLocalToInstant(year!, month!, day!, 23, 59);
}

/** Convert only official venue-crawl records; no sample or generated events. */
export function venueSnapshotEvents(query: ParsedEventQuery): KiwiEvent[] {
  const venues = new Map(snapshot.venues.map((venue) => [venue.slug, venue]));
  const rows: KiwiEvent[] = [];

  for (const event of snapshot.events) {
    const venue = venues.get(event.venueSlug);
    if (!venue) continue;
    const point = VENUE_POINTS[event.venueSlug] ?? null;
    const dates = event.sessionDates?.length ? event.sessionDates : event.startsAt ? [] : [event.date];
    const occurrences = event.startsAt ? [{ id: event.id, startsAt: new Date(event.startsAt), dateOnly: false }] : dates.map((date) => ({ id: `${event.id}-${date}`, startsAt: dateAtEndOfDay(date), dateOnly: true }));

    for (const occurrence of occurrences) {
      rows.push({
        id: occurrence.id,
        title: event.title,
        titleZh: null,
        summary: event.summary ?? null,
        summaryZh: null,
        category: inferCategory(event.title, event.summary, venue.name),
        startsAt: occurrence.startsAt,
        endsAt: null,
        isFree: event.priceStatus === "unconfirmed" ? false : /\bfree\b/i.test(event.summary ?? ""),
        priceFrom: null,
        currency: "NZD",
        venue: { id: event.venueSlug, name: venue.name, address: null, citySlug: "auckland", point },
        point,
        citySlug: "auckland",
        coverImageUrl: event.imageUrl ?? null,
        sourceUrl: event.sourceUrl,
        sourceName: venue.name,
        sourceCount: 1,
        popularity: 0,
        ...(event.priceStatus ? { priceStatus: event.priceStatus } : {}),
        detailUrl: `/venues/events/${event.id}`,
        dateOnly: occurrence.dateOnly,
        ...(event.scheduleText ? { scheduleText: event.scheduleText } : {}),
      });
    }
  }

  return filterEvents(rows, query);
}
