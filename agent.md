# KiwiToday Agent Context

## Project

KiwiToday is an Auckland-first local events aggregator. It uses a pnpm/Turbo monorepo:

- `apps/web`: Next.js website and static venue snapshot consumer.
- `apps/worker`: crawlers, venue-specific parsers, ingestion jobs and snapshot publisher.
- `packages/core`: shared categories, date handling, event types, dedupe and snapshot types.
- `packages/db`: PostgreSQL/PostGIS queries and migrations.
- `artifacts/venues`: generated crawl reports. Treat these as crawl evidence, not hand-edited source data.

The homepage currently reads `apps/web/src/data/venue-snapshot.json` through `apps/web/src/lib/venue-events.ts`. The normal production database path also exists, but local venue-preview work is snapshot-driven.

## Important Commands

Run from the repository root unless noted:

```powershell
corepack pnpm venues --venue <slug> --days 365
corepack pnpm venues:publish
corepack pnpm --filter @kiwi/web dev --hostname 127.0.0.1 --port 3001
corepack pnpm test
corepack pnpm typecheck
```

When `pnpm` is not on PATH, use the repository's installed tools directly:

```powershell
node --import tsx --test packages/core/test/*.test.ts apps/worker/test/*.test.ts
npx tsc --noEmit -p apps/worker/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
```

The web app's local port has commonly been `3001`.

## Current Data Pipeline

1. A source is declared in `apps/worker/src/venues/catalog.ts`.
2. `apps/worker/src/venues/crawl.ts` crawls the source and returns a partial `VenueReport`.
3. Site-specific parsing lives in `apps/worker/src/venues/announcements.ts` or a dedicated file such as `card-merchant.ts` and `eventfinda-stadium.ts`.
4. `apps/worker/src/venues/cli.ts` writes `artifacts/venues/<slug>.json` and Markdown evidence.
5. `apps/worker/src/venues/publish.ts` merges all reports into `apps/web/src/data/venue-snapshot.json`.
6. `apps/web/src/lib/venue-events.ts` converts snapshot records into `KiwiEvent` rows and applies filters.

Do not add fake/demo activities to fill empty venues. Keep coverage marked partial and preserve source URLs.

## Completed Sources and Venue Work

The following sources have been implemented or materially improved:

- `card-merchant-westcity`: public BinderPOS/VenueIQ-style feed. It uses the public BinderPOS API with the official store `Origin` and `Referer` headers. It produced 159 future card/tabletop listings. Nonzero provider prices are intentionally not displayed as amounts; they become `priceStatus: "unconfirmed"` and render as `价格待确认` / `Price unconfirmed`.
- `eventfinda-stadium`: public VenueIQ feed discovered from `https://www.eventfindastadium.co.nz/upcoming`. It currently produces 16 future activities with images, descriptions and ticket/source links.
- `armageddon-auckland`: official Armageddon homepage. It publishes Auckland Spring 2026 for 23-26 October and Auckland Winter 2027 for 5-7 June. The parser extracts the official poster and announcement copy.
- `cosmos-con-auckland`: official Cosmos Con 2027 page. It publishes 13 March 2027, 10:00-17:00, Auckland Netball Centre, 7 Allison Ferguson Drive, St Johns.
- `grand-archive-ascent-auckland`: Eventbrite JSON-LD source. It publishes 22-24 January 2027 at Alexandra Park Raceway. Eventbrite uses `AggregateOffer.lowPrice`; the shared JSON-LD parser now understands that field. The event is shown with price unconfirmed, not with a guessed ticket amount.
- `go-media-stadium`: Auckland Stadiums event pages. A custom parser extracts explicit match dates, kick-off times, images and summaries. It currently produces 15 future activities.
- `western-springs`: Auckland Stadiums event pages. A custom parser extracts Olivia Dean, Foo Fighters and Laneway Festival with explicit dates and source metadata.
- `asb-waterfront`: corrected official `whats-on` entry point and season URL parsing. It currently publishes Cabaret as a date range when the linked season URL explicitly contains the year.
- `basement-theatre`: official Shopify-style `/blogs/whats-on` feed. It uses browser-like request behavior and a custom parser for fixed-date posts, skipping undated weekly repeats. It currently produces 23 date announcements.
- `motat`: custom parser extracts explicit date ranges such as September Holiday Experience and official images/summaries.
- `auckland-zoo`: recurring daily Dinosaur Discovery activity. It is modeled as daily sessions from the current crawl date through the crawl horizon, with `9:30am-4pm daily`; it is not represented as a fake single-day event.
- Existing generic venue crawlers continue to cover Spark Arena, Auckland Live venues, Auckland Art Gallery, Powerstation, Q Theatre, Eden Park and other catalog entries.

## Categories

Canonical categories are in `packages/core/src/categories.ts` and automatically flow into API validation and web filter chips. Important additions:

- `comics`: anime, manga, cosplay, Overload, Armageddon, Cosmos Con, comic conventions and graphic novels.
- `tabletop`: TCG, Pokemon, Magic, Yu-Gi-Oh, One Piece, Lorcana, Flesh and Blood, Riftbound, Grand Archive, Dungeons & Dragons, board games and tabletop.

Specific tabletop signals must be evaluated before broad signals such as `league`, `sail` or `tournament`, otherwise card events can be misclassified as sports or water activities.

## UI Behavior

- Venue chips appear below the event count in `apps/web/src/components/Shell.tsx` and are generated from the current filtered event set.
- Event cards show summaries, categories, uncertain price labels and cover images.
- Detail pages allow new snapshot IDs to render dynamically; do not restore `dynamicParams = false`.
- Detail pages show official summaries, date ranges, recurrence/session dates and the official source link.
- The homepage uses `limit=200` so future venue results are not silently truncated at 60.

## Remaining Gaps

The latest reports still have unresolved or empty areas:

- `auckland-museum`: current seed request failed; retry with a browser-like request or official API/page endpoint before parsing.
- `stardome`: homepage is a Next.js shell with little useful server HTML; inspect its frontend data/build assets or official event endpoint.
- `maritime-museum`: many pages are found, but several published dates omit the year. Do not infer a year. Its JSON-LD Event nodes may lack usable dates; inspect current structured data carefully.
- `eventfinda-stadium`: now populated through VenueIQ; do not revert to the empty static HTML parser.
- `basement-theatre`: official blog access can redirect or rate-limit non-browser requests; preserve the browser-like behavior and do not rely on Vega registration pages as event content.
- `overload.co.nz`: many program pages exist, but the verified 2026 event was 26-27 September and is past as of 2026-10-01. Do not publish its old program components as future events until a future Overload date is announced.

## Data and Safety Rules

- Only publish future or currently active activities with explicit source evidence.
- Never infer a year from a date such as `17 October` unless the publisher explicitly supplies the year.
- Never invent opening times. Preserve date-only precision when only a date/range is known.
- Preserve official source URLs and images. Prefer normalized `coverImageUrl` over legacy raw image fields.
- Treat third-party feed prices cautiously. Nonzero uncertain prices must display as `价格待确认`, not as a numeric amount.
- Respect robots.txt, source rate limits and same-origin restrictions. Do not bypass authentication or access controls.
- Keep crawl coverage marked partial; an empty report does not prove a venue has no events.

## Validation Expectations

After parser changes:

1. Run the focused venue/source test.
2. Run all core and worker tests.
3. Run worker and web TypeScript checks.
4. Run the real venue CLI for the affected source.
5. Run `venues:publish` and verify the resulting web page or API.

As of the latest completed validation, the core/worker suite has passed 89 tests before the most recent Eventfinda Stadium and Zoo follow-up fixes; rerun it after any further edits.
