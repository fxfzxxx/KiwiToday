import { dateFilterToRange, type KiwiEvent, type ParsedEventQuery } from "@kiwi/core";

/** Apply the public event-query semantics to an in-memory event collection. */
export function filterEvents(events: KiwiEvent[], q: ParsedEventQuery): KiwiEvent[] {
  const range = dateFilterToRange(q.date);
  const needle = q.q?.toLowerCase();

  return events
    .filter((event) => event.startsAt >= range.from && (!range.to || event.startsAt < range.to))
    .filter((event) => !q.city || event.citySlug === q.city)
    .filter((event) => !q.venue || event.venue?.id === q.venue)
    .filter((event) => !q.category || event.category === q.category)
    .filter((event) => !q.free || event.isFree)
    .filter((event) => {
      if (!q.bbox || !event.point) return true;
      const [minLng, minLat, maxLng, maxLat] = q.bbox;
      return event.point.lng >= minLng && event.point.lng <= maxLng && event.point.lat >= minLat && event.point.lat <= maxLat;
    })
    .filter((event) => !needle || `${event.title} ${event.titleZh ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, q.limit);
}
