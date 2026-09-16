/**
 * Listing → canonical event.
 *
 * For each normalised listing:
 *   1. store it verbatim (source_records)
 *   2. resolve/create its venue
 *   3. shortlist existing events that could be the same thing
 *   4. score each candidate with @kiwi/core's matcher
 *   5. merge / create / flag for review
 *
 * Steps 3–5 are the whole product: without them the feed shows the same
 * concert three times and looks broken.
 */
import { createHash } from "node:crypto";
import {
  inferCategory, matchEvents, resolveCity, titleFingerprint,
  type CategorySlug, type NormalizedListing,
} from "@kiwi/core";
import {
  enrichEventFromListing, findMatchCandidates, flagForReview, insertEvent,
  linkRecordToEvent, upsertSourceRecord, upsertVenue, type Sql,
} from "@kiwi/db";

export interface IngestStats {
  fetched: number; created: number; updated: number; merged: number; flagged: number; skipped: number;
}

export function emptyStats(): IngestStats {
  return { fetched: 0, created: 0, updated: 0, merged: 0, flagged: 0, skipped: 0 };
}

export function contentHash(raw: unknown): string {
  return createHash("sha256").update(JSON.stringify(raw ?? null)).digest("hex").slice(0, 32);
}

export async function ingestListing(
  listing: NormalizedListing,
  stats: IngestStats,
  sql: Sql,
): Promise<void> {
  stats.fetched++;

  // Events that already finished are not worth a row.
  if (listing.startsAt.getTime() < Date.now() - 6 * 3600_000) {
    stats.skipped++;
    return;
  }

  const record = await upsertSourceRecord(
    {
      sourceSlug: listing.sourceSlug,
      externalId: listing.externalId,
      url: listing.url,
      raw: listing.raw,
      contentHash: contentHash(listing.raw),
    },
    sql,
  );

  const citySlug = listing.citySlug ?? resolveCity(listing.point);
  const venueId = listing.venueName
    ? await upsertVenue(
        { name: listing.venueName, address: listing.address, citySlug, point: listing.point },
        sql,
      )
    : null;

  const category = inferCategory(listing.categoryHint, listing.title, listing.summary) as CategorySlug;
  const fingerprint = titleFingerprint(listing.title);

  const candidates = await findMatchCandidates(
    { title: listing.title, titleFingerprint: fingerprint, startsAt: listing.startsAt },
    sql,
  );

  let best: { id: string; confidence: number; signals: unknown } | null = null;
  let review: { id: string; confidence: number; signals: unknown } | null = null;

  for (const c of candidates) {
    const result = matchEvents(
      {
        title: listing.title,
        startsAt: listing.startsAt,
        point: listing.point,
        venueId,
        url: listing.url,
      },
      {
        title: c.title,
        startsAt: c.starts_at,
        point: c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null,
        venueId: c.venue_id,
        url: c.source_url,
      },
    );
    if (result.verdict === "same" && (!best || result.confidence > best.confidence)) {
      best = { id: c.id, confidence: result.confidence, signals: result.signals };
    } else if (result.verdict === "review" && (!review || result.confidence > review.confidence)) {
      review = { id: c.id, confidence: result.confidence, signals: result.signals };
    }
  }

  if (best) {
    await enrichEventFromListing(best.id, { ...listing, citySlug }, sql);
    await linkRecordToEvent(
      { eventId: best.id, sourceRecordId: record.id, confidence: best.confidence, signals: best.signals },
      sql,
    );
    record.changed ? stats.updated++ : stats.merged++;
    return;
  }

  const eventId = await insertEvent(
    { listing: { ...listing, citySlug }, category, venueId, titleFingerprint: fingerprint },
    sql,
  );
  await linkRecordToEvent(
    { eventId, sourceRecordId: record.id, confidence: 1, signals: { origin: "new" } },
    sql,
  );
  stats.created++;

  // Near-miss: keep both rows visible, but leave a breadcrumb for tuning.
  if (review) {
    await flagForReview(
      { eventId, candidateEventId: review.id, confidence: review.confidence, signals: review.signals },
      sql,
    );
    stats.flagged++;
  }
}
