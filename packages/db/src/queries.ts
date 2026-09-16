import {
  bucketToRange, getCity, type CategorySlug, type DateBucket,
  type KiwiEvent, type NormalizedListing, type ParsedEventQuery, type Point,
} from "@kiwi/core";
import { db, type Sql } from "./client";

/* ------------------------------------------------------------------ feed --- */

interface EventRow {
  id: string; title: string; title_zh: string | null;
  summary: string | null; summary_zh: string | null;
  category: string; starts_at: Date; ends_at: Date | null;
  is_free: boolean; price_from: string | null; currency: string;
  city_slug: string | null; cover_image_url: string | null;
  source_url: string; source_name: string; source_count: number; popularity: number;
  lat: number | null; lng: number | null;
  venue_id: string | null; venue_name: string | null; venue_address: string | null;
  venue_lat: number | null; venue_lng: number | null;
}

function toEvent(r: EventRow): KiwiEvent {
  return {
    id: r.id,
    title: r.title,
    titleZh: r.title_zh,
    summary: r.summary,
    summaryZh: r.summary_zh,
    category: r.category,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    isFree: r.is_free,
    priceFrom: r.price_from === null ? null : Number(r.price_from),
    currency: r.currency,
    citySlug: r.city_slug,
    coverImageUrl: r.cover_image_url,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    sourceCount: r.source_count,
    popularity: r.popularity,
    point: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null,
    venue: r.venue_id
      ? {
          id: r.venue_id,
          name: r.venue_name ?? "",
          address: r.venue_address,
          citySlug: r.city_slug,
          point: r.venue_lat !== null && r.venue_lng !== null
            ? { lat: r.venue_lat, lng: r.venue_lng } : null,
        }
      : null,
  };
}

/** Keyset cursor: events are ordered by (starts_at, id), both stable. */
function encodeCursor(e: KiwiEvent): string {
  return Buffer.from(`${e.startsAt.toISOString()}|${e.id}`).toString("base64url");
}
function decodeCursor(c: string): { startsAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    if (!iso || !id) return null;
    const startsAt = new Date(iso);
    return Number.isNaN(startsAt.getTime()) ? null : { startsAt, id };
  } catch {
    return null;
  }
}

/**
 * The feed query. Ordered by start time — an aggregator's job is "what is on
 * next", not "what is most popular ever". Popularity only breaks ties.
 */
export async function findEvents(
  q: ParsedEventQuery,
  opts: { now?: Date; sql?: Sql } = {},
): Promise<{ events: KiwiEvent[]; nextCursor: string | null }> {
  const sql = opts.sql ?? db();
  const now = opts.now ?? new Date();
  const range = bucketToRange(q.date as DateBucket, now);
  const city = q.city ? getCity(q.city) : undefined;
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;

  const rows = await sql<EventRow[]>`
    SELECT e.id, e.title, e.title_zh, e.summary, e.summary_zh, e.category,
           e.starts_at, e.ends_at, e.is_free, e.price_from, e.currency,
           e.city_slug, e.cover_image_url, e.source_url, e.source_name,
           e.source_count, e.popularity,
           ST_Y(e.geom::geometry) AS lat, ST_X(e.geom::geometry) AS lng,
           v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
           ST_Y(v.geom::geometry) AS venue_lat, ST_X(v.geom::geometry) AS venue_lng
      FROM events e
      LEFT JOIN venues v ON v.id = e.venue_id
     WHERE e.starts_at >= ${range.from}
       ${range.to ? sql`AND e.starts_at < ${range.to}` : sql``}
       ${q.city ? sql`AND e.city_slug = ${q.city}` : sql``}
       ${q.category ? sql`AND e.category = ${q.category}` : sql``}
       ${q.free ? sql`AND e.is_free = true` : sql``}
       ${q.q ? sql`AND e.search_text ILIKE ${"%" + q.q + "%"}` : sql``}
       ${
         q.bbox
           ? sql`AND e.geom && ST_MakeEnvelope(${q.bbox[0]}, ${q.bbox[1]}, ${q.bbox[2]}, ${q.bbox[3]}, 4326)::geography`
           : city
             ? sql`AND ST_DWithin(e.geom, ST_MakePoint(${city.lng}, ${city.lat})::geography, ${city.radiusKm * 1000})`
             : sql``
       }
       ${cursor ? sql`AND (e.starts_at, e.id) > (${cursor.startsAt}, ${cursor.id}::uuid)` : sql``}
     ORDER BY e.starts_at ASC, e.id ASC
     LIMIT ${q.limit + 1}
  `;

  const hasMore = rows.length > q.limit;
  const events = rows.slice(0, q.limit).map(toEvent);
  return {
    events,
    nextCursor: hasMore && events.length ? encodeCursor(events[events.length - 1]!) : null,
  };
}

export async function getEventById(id: string, sql: Sql = db()): Promise<KiwiEvent | null> {
  const rows = await sql<EventRow[]>`
    SELECT e.id, e.title, e.title_zh, e.summary, e.summary_zh, e.category,
           e.starts_at, e.ends_at, e.is_free, e.price_from, e.currency,
           e.city_slug, e.cover_image_url, e.source_url, e.source_name,
           e.source_count, e.popularity,
           ST_Y(e.geom::geometry) AS lat, ST_X(e.geom::geometry) AS lng,
           v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
           ST_Y(v.geom::geometry) AS venue_lat, ST_X(v.geom::geometry) AS venue_lng
      FROM events e LEFT JOIN venues v ON v.id = e.venue_id
     WHERE e.id = ${id}::uuid`;
  return rows[0] ? toEvent(rows[0]) : null;
}

/* ------------------------------------------------------------- ingestion --- */

export interface UpsertRecordResult { id: string; changed: boolean }

/**
 * Store a listing verbatim. Returns `changed: false` when the content hash is
 * unchanged, which lets the caller skip re-normalising and — more importantly —
 * skip paying for re-translation.
 */
export async function upsertSourceRecord(
  rec: { sourceSlug: string; externalId: string; url: string; raw: unknown; contentHash: string },
  sql: Sql = db(),
): Promise<UpsertRecordResult> {
  const rows = await sql<{ id: string; changed: boolean }[]>`
    INSERT INTO source_records (source_slug, external_id, url, raw, content_hash)
    VALUES (${rec.sourceSlug}, ${rec.externalId}, ${rec.url}, ${sql.json(rec.raw as never)}, ${rec.contentHash})
    ON CONFLICT (source_slug, external_id) DO UPDATE
      SET url = EXCLUDED.url,
          raw = EXCLUDED.raw,
          content_hash = EXCLUDED.content_hash,
          last_seen_at = now(),
          gone_at = NULL
    RETURNING id, (source_records.content_hash IS DISTINCT FROM ${rec.contentHash}) AS changed`;
  const row = rows[0]!;
  return { id: row.id, changed: row.changed };
}

/** Normalised venue key: case/punctuation/macron-insensitive, "the" dropped. */
export function venueNameKey(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export async function upsertVenue(
  v: { name: string; address: string | null; citySlug: string | null; point: Point | null },
  sql: Sql = db(),
): Promise<string> {
  const key = venueNameKey(v.name);
  const rows = await sql<{ id: string }[]>`
    INSERT INTO venues (name, address, city_slug, name_key, geom)
    VALUES (${v.name}, ${v.address}, ${v.citySlug}, ${key},
            ${v.point ? sql`ST_MakePoint(${v.point.lng}, ${v.point.lat})::geography` : sql`NULL`})
    ON CONFLICT (name_key, coalesce(city_slug, '')) DO UPDATE
      SET address = coalesce(EXCLUDED.address, venues.address),
          geom    = coalesce(EXCLUDED.geom, venues.geom),
          updated_at = now()
    RETURNING id`;
  return rows[0]!.id;
}

export interface CandidateRow {
  id: string; title: string; starts_at: Date;
  lat: number | null; lng: number | null;
  venue_id: string | null; source_url: string; source_count: number;
}

/**
 * Shortlist possible duplicates: anything starting within ±2h that either
 * shares the title fingerprint or is trigram-similar. Cheap enough to run per
 * listing; the expensive scoring in @kiwi/core then runs over a handful of rows
 * rather than the whole table.
 */
export async function findMatchCandidates(
  l: { title: string; titleFingerprint: string; startsAt: Date },
  sql: Sql = db(),
): Promise<CandidateRow[]> {
  const windowMs = 2 * 60 * 60 * 1000;
  return sql<CandidateRow[]>`
    SELECT id, title, starts_at, venue_id, source_url, source_count,
           ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
      FROM events
     WHERE starts_at BETWEEN ${new Date(l.startsAt.getTime() - windowMs)}
                         AND ${new Date(l.startsAt.getTime() + windowMs)}
       AND (title_fingerprint = ${l.titleFingerprint} OR similarity(title, ${l.title}) > 0.3)
     LIMIT 25`;
}

export async function insertEvent(
  e: {
    listing: NormalizedListing; category: CategorySlug; venueId: string | null;
    titleFingerprint: string;
  },
  sql: Sql = db(),
): Promise<string> {
  const l = e.listing;
  const rows = await sql<{ id: string }[]>`
    INSERT INTO events (
      title, summary, category, starts_at, ends_at, is_free, price_from,
      venue_id, geom, city_slug, cover_image_url, source_url, source_name,
      popularity, title_fingerprint)
    VALUES (
      ${l.title}, ${l.summary}, ${e.category}, ${l.startsAt}, ${l.endsAt},
      ${l.isFree}, ${l.priceFrom}, ${e.venueId ? sql`${e.venueId}::uuid` : sql`NULL`},
      ${l.point ? sql`ST_MakePoint(${l.point.lng}, ${l.point.lat})::geography` : sql`NULL`},
      ${l.citySlug}, ${l.coverImageUrl}, ${l.url}, ${l.sourceSlug},
      ${l.popularity}, ${e.titleFingerprint})
    RETURNING id`;
  return rows[0]!.id;
}

/**
 * Fold a second source's listing into an existing event. We take the *better*
 * value per field rather than letting the newest writer win: a source with a
 * cover image should not be overwritten by one without.
 */
export async function enrichEventFromListing(
  eventId: string, l: NormalizedListing, sql: Sql = db(),
): Promise<void> {
  await sql`
    UPDATE events SET
      summary         = coalesce(events.summary, ${l.summary}),
      cover_image_url = coalesce(events.cover_image_url, ${l.coverImageUrl}),
      ends_at         = coalesce(events.ends_at, ${l.endsAt}),
      price_from      = LEAST(coalesce(events.price_from, ${l.priceFrom}), coalesce(${l.priceFrom}, events.price_from)),
      is_free         = events.is_free OR ${l.isFree},
      geom            = coalesce(events.geom,
                          ${l.point ? sql`ST_MakePoint(${l.point.lng}, ${l.point.lat})::geography` : sql`NULL`}),
      popularity      = GREATEST(events.popularity, ${l.popularity}),
      updated_at      = now()
    WHERE id = ${eventId}::uuid`;
}

export async function linkRecordToEvent(
  link: { eventId: string; sourceRecordId: string; confidence: number; signals: unknown },
  sql: Sql = db(),
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO event_links (event_id, source_record_id, confidence, signals)
      VALUES (${link.eventId}::uuid, ${link.sourceRecordId}::uuid, ${link.confidence},
              ${tx.json(link.signals as never)})
      ON CONFLICT (source_record_id) DO UPDATE
        SET event_id = EXCLUDED.event_id,
            confidence = EXCLUDED.confidence,
            signals = EXCLUDED.signals`;
    await tx`
      UPDATE events SET source_count = (
        SELECT count(*) FROM event_links WHERE event_id = ${link.eventId}::uuid
      ) WHERE id = ${link.eventId}::uuid`;
  });
}

export async function flagForReview(
  r: { eventId: string; candidateEventId: string; confidence: number; signals: unknown },
  sql: Sql = db(),
): Promise<void> {
  await sql`
    INSERT INTO merge_reviews (event_id, candidate_event_id, confidence, signals)
    VALUES (${r.eventId}::uuid, ${r.candidateEventId}::uuid, ${r.confidence}, ${sql.json(r.signals as never)})
    ON CONFLICT DO NOTHING`;
}

/** Tombstone listings a source stopped returning, so cancelled events drop out. */
export async function markMissingRecordsGone(
  sourceSlug: string, seenIds: string[], sql: Sql = db(),
): Promise<number> {
  if (!seenIds.length) return 0;
  const rows = await sql<{ id: string }[]>`
    UPDATE source_records SET gone_at = now()
     WHERE source_slug = ${sourceSlug} AND gone_at IS NULL
       AND external_id NOT IN ${sql(seenIds)}
    RETURNING id`;
  await sql`
    DELETE FROM events e
     WHERE NOT EXISTS (
       SELECT 1 FROM event_links el
         JOIN source_records sr ON sr.id = el.source_record_id
        WHERE el.event_id = e.id AND sr.gone_at IS NULL)`;
  return rows.length;
}

/* ------------------------------------------------------------ run stats --- */

export async function startRun(sourceSlug: string, sql: Sql = db()): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ingest_runs (source_slug) VALUES (${sourceSlug}) RETURNING id`;
  return rows[0]!.id;
}

export async function finishRun(
  id: string,
  stats: { status: "ok" | "failed"; fetched: number; created: number; updated: number; merged: number; flagged: number; error?: string },
  sql: Sql = db(),
): Promise<void> {
  await sql`
    UPDATE ingest_runs SET
      finished_at = now(), status = ${stats.status}, fetched = ${stats.fetched},
      created = ${stats.created}, updated = ${stats.updated}, merged = ${stats.merged},
      flagged = ${stats.flagged}, error = ${stats.error ?? null}
    WHERE id = ${id}::uuid`;
  await sql`UPDATE sources SET last_run_at = now() WHERE slug = (
    SELECT source_slug FROM ingest_runs WHERE id = ${id}::uuid)`;
}

export async function getSourceConfig<T = Record<string, unknown>>(
  slug: string, sql: Sql = db(),
): Promise<{ slug: string; name: string; enabled: boolean; config: T } | null> {
  const rows = await sql<{ slug: string; name: string; enabled: boolean; config: T }[]>`
    SELECT slug, name, enabled, config FROM sources WHERE slug = ${slug}`;
  return rows[0] ?? null;
}
