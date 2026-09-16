# KiwiToday

New Zealand local-event aggregator. Bilingual (中文 / English), web now, mobile app later.

Pulls listings from Eventfinda, Ticketmaster and any site publishing schema.org
`Event` markup, de-duplicates them into canonical events, and serves them as a
list / map / split feed.

## Why the repo is shaped like this

The hard part of an event aggregator is not the frontend — it's the ingestion
pipeline. Three sources will each list the same concert, with three different
titles and start times that disagree by an hour. So:

- **`source_records` is never what we serve.** Raw payloads are stored verbatim;
  a canonical `events` row is derived from one or more of them via `event_links`.
  A field-mapping mistake is a re-normalise, not a re-crawl.
- **Matching is scored, not exact.** `@kiwi/core/dedupe` combines title
  similarity, start-time skew and venue distance. Time and distance act as
  vetoes so a multi-night tour stays multiple events. Near-misses land in
  `merge_reviews` instead of being silently merged.
- **Everything user-facing is bucketed in `Pacific/Auckland`.** "Tonight" means
  tonight in NZ regardless of where the server runs. Sources that publish naive
  wall-clock times (Eventfinda does) go through `parseNzLocal`.

```
packages/core     domain types, categories, NZ date bucketing, dedup matcher  (no deps beyond zod)
packages/db       PostGIS schema, migrations, typed queries
apps/worker       source adapters + ingestion pipeline + pg-boss scheduler
apps/web          Next.js App Router, SSR feed, MapLibre map
```

## Stack, and why

| Layer | Choice | Reason |
|---|---|---|
| Web | Next.js (App Router) | The traffic comes from "things to do in Auckland this weekend". Crawlers must see events without running JS. |
| DB | Postgres + PostGIS (Supabase, **Sydney** `ap-southeast-2`) | Every query is time-range + geo. Auth/Storage come free for the app phase. |
| Worker | Node + pg-boss on **Fly.io `syd`** | Crawling is long-running and retried — a bad fit for serverless. Queue lives in the same Postgres, so no Redis. |
| Map | MapLibre GL | Native heatmap + clustering (the prototype hand-rolled both), and `maplibre-react-native` shares the layer spec with the app. |
| Images/tiles | Cloudflare R2 | Zero egress. This is the single biggest cost lever. |

**Region matters more than DX here.** Railway has no Oceania region — its
closest is Singapore, ~160ms from NZ, which is felt on every filter change.
Fly has `syd` (~25–30ms). AWS now has an Auckland region (`ap-southeast-6`) if
in-country data residency ever becomes a requirement.

The worker is a plain Dockerfile and the database is plain Postgres with no
platform-specific extensions, so moving to Cloudflare Containers or AWS later
is a weekend, not a rewrite. The Supabase Auth/Storage SDKs are the one real
lock-in; that's a deliberate trade for speed right now.

## Running it

```bash
pnpm install
cp .env.example .env
```

The web app runs immediately with demo data — no database needed. It says so in
a banner, so demo rows are never mistaken for a quiet weekend:

```bash
pnpm --filter @kiwi/web dev      # http://localhost:3000
```

For real data:

```bash
# Postgres with PostGIS
docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgis/postgis:16-3.4
pnpm db:migrate

# Verify the field mapping before trusting a crawl (prints the first raw record)
pnpm ingest -- --source eventfinda --dry-run --limit 1

pnpm ingest -- --source eventfinda
```

```bash
pnpm test        # unit tests
pnpm typecheck
pnpm build
```

## Adding a source

**Probe it first.** Adding a source is a research question — does the site
publish schema.org markup (free, deterministic) or does it need LLM extraction
(costs money, needs guards)? Don't guess:

```bash
pnpm probe https://www.aucklandnz.com/events/all-events --city auckland
```

It reports the JSON-LD it found, what would be normalised out of it, how many
events have coordinates, and — if the source is usable — the exact `INSERT` to
paste. It distinguishes "no markup" from "I was blocked", because those lead to
opposite decisions.

Most NZ venues and councils publish JSON-LD for Google, so a new source is
usually a row, not code:

```sql
INSERT INTO sources (slug, name, kind, attribution, config) VALUES (
  'auckland-council', 'Auckland Council', 'jsonld',
  'Event data from Auckland Council',
  '{"seeds":["https://www.aucklandcouncil.govt.nz/whats-on"],"defaultCity":"auckland"}'
);
```

Sources with a real API get an adapter in `apps/worker/src/sources/` implementing
`SourceAdapter`, registered in `pipeline/run.ts`.

Migration `0002` seeds seven NZ tourism/city sites as **disabled** candidates.
They are unverified — several sit behind bot protection, and only four of the
seven URLs are confirmed to exist. Probe each one before enabling it.

**Note on Eventbrite:** its public event-search API was withdrawn in 2020 —
third parties cannot retrieve other organisers' events. Not worth attempting.

## Status

Working: schema + migrations, dedup matcher (tested), Eventfinda and
Ticketmaster adapters, generic JSON-LD adapter, source probe, ingestion pipeline
with review queue, hourly scheduler, SSR feed, MapLibre map with heatmap +
clustering, bilingual UI, demo fallback. 40 unit tests.

Not built yet:
- **Neither API field mapping is verified** against a live response — both
  sites are unreachable from the environment this was built in. Run
  `--dry-run` with your keys and correct
  `apps/worker/src/sources/{eventfinda,ticketmaster}.ts` if needed. This is the
  first thing to do; everything else is downstream of having real rows.
- The seven candidate sources in migration `0002` are unprobed and disabled.
- Chinese titles/summaries via Claude Haiku (`title_zh`/`summary_zh` columns and
  `enriched_at` exist; nothing writes them yet).
- LLM extraction for sites with neither an API nor JSON-LD. Only worth building
  once the probe shows how many NZ sources actually fall in that bucket.
- Nothing alerts when a source silently stops returning events. `ingest_runs`
  records every run; there is no monitor reading it.
- Meilisearch. Search is `ILIKE` for now — fine at this size, but Postgres FTS
  does not tokenise Chinese, so this needs replacing before search matters.
- Cover images still hotlink from sources; they should be proxied through R2.
- Auth, saved events, publishing.
