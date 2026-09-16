import { bucketToRange, type DateBucket, type KiwiEvent, type ParsedEventQuery } from "@kiwi/core";

/**
 * The same filtering the SQL does, applied in memory to the demo rows. Kept in
 * one place so "what the API means by `weekend`" has a single definition, and
 * so the demo path cannot quietly disagree with the real one.
 */
export function filterSample(events: KiwiEvent[], q: ParsedEventQuery): KiwiEvent[] {
  const range = bucketToRange(q.date as DateBucket);
  const needle = q.q?.toLowerCase();

  return events
    .filter((e) => e.startsAt >= range.from && (!range.to || e.startsAt < range.to))
    .filter((e) => !q.city || e.citySlug === q.city)
    .filter((e) => !q.category || e.category === q.category)
    .filter((e) => !q.free || e.isFree)
    .filter((e) => {
      if (!q.bbox || !e.point) return true;
      const [minLng, minLat, maxLng, maxLat] = q.bbox;
      return e.point.lng >= minLng && e.point.lng <= maxLng && e.point.lat >= minLat && e.point.lat <= maxLat;
    })
    .filter((e) => !needle || `${e.title} ${e.titleZh ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, q.limit);
}
