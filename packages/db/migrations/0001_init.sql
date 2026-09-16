-- KiwiToday core schema.
--
-- The shape that matters: a listing scraped from a source is NEVER the thing we
-- serve. Raw listings land in source_records, are matched against each other,
-- and are attached to a canonical `events` row via event_links. One concert
-- listed on Eventfinda, Ticketmaster and the venue's own site is three
-- source_records, three event_links, one event.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- sources ---
CREATE TABLE sources (
  slug            text PRIMARY KEY,
  name            text        NOT NULL,
  homepage        text,
  kind            text        NOT NULL CHECK (kind IN ('api', 'jsonld', 'ical', 'manual')),
  -- Per-source knobs (base url, category map, crawl seeds) without a migration
  -- every time a site changes.
  config          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  enabled         boolean     NOT NULL DEFAULT true,
  -- Attribution we are obliged to show, and want to show: link-out is the deal
  -- we offer sources in exchange for their data.
  attribution     text,
  last_run_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------- venues ---
CREATE TABLE venues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  address         text,
  city_slug       text,
  geom            geography(Point, 4326),
  -- Order-insensitive normalised name; lets us collapse "The Powerstation" and
  -- "Powerstation" before they create two venue rows.
  name_key        text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX venues_name_key_city_uniq ON venues (name_key, coalesce(city_slug, ''));
CREATE INDEX venues_geom_idx    ON venues USING gist (geom);
CREATE INDEX venues_name_trgm   ON venues USING gin (name gin_trgm_ops);

-- ----------------------------------------------------------------- events ---
-- The canonical, de-duplicated, user-facing row.
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  title_zh        text,
  summary         text,
  summary_zh      text,
  category        text        NOT NULL DEFAULT 'other',
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  is_free         boolean     NOT NULL DEFAULT false,
  price_from      numeric(10,2),
  currency        text        NOT NULL DEFAULT 'NZD',
  venue_id        uuid REFERENCES venues(id) ON DELETE SET NULL,
  geom            geography(Point, 4326),
  city_slug       text,
  cover_image_url text,
  -- Denormalised from the highest-priority linked source, so the feed query
  -- does not need a join to render a card.
  source_url      text        NOT NULL,
  source_name     text        NOT NULL,
  source_count    integer     NOT NULL DEFAULT 1,
  popularity      integer     NOT NULL DEFAULT 0,
  -- Shortlist key for dedup candidate lookup (see @kiwi/core titleFingerprint).
  title_fingerprint text      NOT NULL,
  -- Generated: lets one GIN index serve both English and Chinese prefix search
  -- until Meilisearch is worth standing up.
  search_text     text GENERATED ALWAYS AS (
                    coalesce(title, '') || ' ' || coalesce(title_zh, '') || ' ' ||
                    coalesce(summary, '') || ' ' || coalesce(summary_zh, '')
                  ) STORED,
  enriched_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The feed query is always "this city, this time window, maybe this category,
-- newest-interesting first". This index is the one that matters.
CREATE INDEX events_city_starts_idx ON events (city_slug, starts_at) INCLUDE (category);
CREATE INDEX events_starts_idx      ON events (starts_at);
CREATE INDEX events_geom_idx        ON events USING gist (geom);
CREATE INDEX events_search_trgm     ON events USING gin (search_text gin_trgm_ops);
-- Candidate shortlist for the matcher: same fingerprint, nearby day.
CREATE INDEX events_fingerprint_idx ON events (title_fingerprint, starts_at);

-- --------------------------------------------------------- source_records ---
-- Raw listings, stored verbatim. `raw` is the reason a field-mapping mistake is
-- a re-normalise, not a re-crawl.
CREATE TABLE source_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug     text        NOT NULL REFERENCES sources(slug) ON DELETE CASCADE,
  external_id     text        NOT NULL,
  url             text        NOT NULL,
  raw             jsonb       NOT NULL,
  -- Hash of `raw`; unchanged hash means enrichment (translation, categorisation)
  -- can be skipped, which is most of what enrichment costs.
  content_hash    text        NOT NULL,
  normalized      jsonb,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  -- Set when a listing disappears upstream; we tombstone rather than delete so
  -- a source having a bad day cannot wipe the feed.
  gone_at         timestamptz
);
CREATE UNIQUE INDEX source_records_identity ON source_records (source_slug, external_id);
CREATE INDEX source_records_seen_idx ON source_records (last_seen_at);

-- ------------------------------------------------------------ event_links ---
CREATE TABLE event_links (
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_record_id uuid NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  -- Why the matcher believed these are the same event. Kept for tuning
  -- thresholds against real data instead of against intuition.
  confidence      real NOT NULL,
  signals         jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source_record_id)
);
CREATE UNIQUE INDEX event_links_record_uniq ON event_links (source_record_id);

-- --------------------------------------------------------- merge_reviews ---
-- Pairs the matcher was not confident enough to merge automatically. A human
-- (or a better model) decides later; meanwhile both events stay visible.
CREATE TABLE merge_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  candidate_event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  confidence      real NOT NULL,
  signals         jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved        text CHECK (resolved IN ('merged', 'distinct')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE UNIQUE INDEX merge_reviews_pair ON merge_reviews (
  least(event_id::text, candidate_event_id::text),
  greatest(event_id::text, candidate_event_id::text)
);

-- ----------------------------------------------------------- ingest_runs ---
-- One row per source per run. The first thing you look at when the feed goes
-- quiet: did the crawl stop, or did the city genuinely have nothing on?
CREATE TABLE ingest_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug     text NOT NULL REFERENCES sources(slug) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  fetched         integer NOT NULL DEFAULT 0,
  created         integer NOT NULL DEFAULT 0,
  updated         integer NOT NULL DEFAULT 0,
  merged          integer NOT NULL DEFAULT 0,
  flagged         integer NOT NULL DEFAULT 0,
  error           text
);
CREATE INDEX ingest_runs_source_idx ON ingest_runs (source_slug, started_at DESC);

-- ------------------------------------------------------------- seed rows ---
INSERT INTO sources (slug, name, homepage, kind, attribution, config) VALUES
  ('eventfinda',   'Eventfinda',   'https://www.eventfinda.co.nz', 'api',
   'Event data from Eventfinda', '{"baseUrl":"https://api.eventfinda.co.nz/v2","rows":200}'),
  ('ticketmaster', 'Ticketmaster', 'https://www.ticketmaster.co.nz', 'api',
   'Event data from Ticketmaster Discovery API',
   '{"baseUrl":"https://app.ticketmaster.com/discovery/v2","countryCode":"NZ"}')
ON CONFLICT (slug) DO NOTHING;
