# KiwiToday Continuation Notes

Last updated: 2026-10-01

## What This Session Built

KiwiToday now has a much broader Auckland activity feed. The work focused on anime/comics, card/tabletop games, venue calendars, and reliable source evidence.

The current published snapshot is `apps/web/src/data/venue-snapshot.json`. The latest successful publication reported 24 venues and 517 listings before the most recent Eventfinda Stadium snapshot refresh; after Eventfinda Stadium was refreshed, the snapshot contains 517 listings. Verify the exact count with the publish command rather than relying on this note.

## Sources Added or Fixed

### Anime and Comics

- Armageddon Auckland:
  - Auckland Spring 2026: 23-26 October 2026, Auckland Showgrounds.
  - Auckland Winter 2027: 5-7 June 2027, Auckland Showgrounds, 10:00-17:00 daily.
  - Official event poster and long official description are retained.
- Cosmos Con 2027:
  - 13 March 2027, 10:00-17:00.
  - Auckland Netball Centre, 7 Allison Ferguson Drive, St Johns.
  - Official source: `https://cosmosnz.org/cosmos-con-2027/`.
- Overload:
  - Its homepage contains many program pages, but the verified Overload event was 26-27 September 2026 and is past as of this note.
  - Do not add its Anime Tattoo Zone, Cosplay Parade, NZ Makes Comics exhibition, Arts & Crafts, Photo Wall or similar pages as future events unless a future Overload date is published.

### Card and Tabletop

- Card Merchant WestCity:
  - Public BinderPOS feed integrated through `apps/worker/src/venues/card-merchant.ts`.
  - 159 future listings were captured in the last full-year crawl.
  - Includes Pokemon, Magic, Lorcana, One Piece, Grand Archive, Riftbound, Flesh and Blood, D&D and other games.
- Grand Archive TCG - Ascent Auckland 2027:
  - 22-24 January 2027, Alexandra Park Raceway.
  - Eventbrite JSON-LD source.
  - `AggregateOffer.lowPrice` is now parsed; the UI shows `Price unconfirmed` rather than the numeric starting price.
- Eventfinda Stadium:
  - VenueIQ public feed integrated through `apps/worker/src/venues/eventfinda-stadium.ts`.
  - 16 future records in the first real crawl, including BX-9, BNZ Kahu, Auckland Baby Expo, SAS Slam, NZ Super Nationals and other activities.

### Other Venue Improvements

- Go Media Stadium: 15 future sports events with explicit dates and kick-off times.
- Western Springs Bowl: Olivia Dean, Foo Fighters and Laneway Festival future events.
- ASB Waterfront Theatre: official season URL/date parser; Cabaret is published as a date range.
- Basement Theatre: `/blogs/whats-on` parser using browser-like requests; 23 fixed-date future listings. Undated weekly repeats are skipped.
- MOTAT: date-range parser for official event pages.
- Auckland Zoo: Dinosaur Discovery is modeled as a daily recurring activity from the current crawl date through the crawl horizon, 09:30-16:00 daily.

## Important Implementation Files

- `apps/worker/src/venues/catalog.ts`: source declarations and approved seeds.
- `apps/worker/src/venues/crawl.ts`: generic crawler and special-source dispatch.
- `apps/worker/src/venues/announcements.ts`: site-specific date-only and venue announcement parsers.
- `apps/worker/src/venues/card-merchant.ts`: Card Merchant API crawler.
- `apps/worker/src/venues/eventfinda-stadium.ts`: Eventfinda Stadium VenueIQ crawler.
- `apps/worker/src/venues/publish.ts`: turns reports into the web snapshot.
- `apps/web/src/lib/venue-events.ts`: maps snapshot rows to `KiwiEvent` and applies venue points/filtering.
- `apps/web/src/components/Shell.tsx`: filter UI, including dynamic venue chips under the result count.
- `apps/web/src/components/EventCard.tsx`: card summaries, images and uncertain price labels.
- `apps/web/src/components/EventDetail.tsx`: detail page summary, date range, sessions and price state.
- `packages/core/src/categories.ts`: canonical category slugs and keyword precedence.
- `packages/core/src/venue-snapshot.ts`: snapshot event shape.
- `apps/web/src/data/venue-snapshot.json`: generated output; do not hand-edit.

## Commands to Continue

```powershell
# From repository root
corepack pnpm venues --venue <slug> --days 365
corepack pnpm venues:publish
corepack pnpm test
corepack pnpm typecheck

# Direct fallback when pnpm is unavailable
node --import tsx --test packages/core/test/*.test.ts apps/worker/test/*.test.ts
npx tsc --noEmit -p apps/worker/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
```

Useful real crawls:

```powershell
Push-Location apps/worker
node --import tsx src/venues/cli.ts --venue eventfinda-stadium --days 366
node --import tsx src/venues/cli.ts --venue basement-theatre --days 366
node --import tsx src/venues/cli.ts --venue auckland-zoo --days 365
node --import tsx src/venues/cli.ts --venue western-springs --days 366
Pop-Location

Push-Location apps/worker
node --import tsx src/venues/publish.ts
Pop-Location
```

## Remaining Work Order

1. Auckland Museum: retry its failed seed with a browser-like request and inspect the current official activity API/page.
2. Stardome: reverse-engineer the Next.js data source because the homepage is a server-rendered shell with no event HTML.
3. Maritime Museum: parse only events whose JSON-LD or visible source contains an explicit year. Do not infer the year for `17 October`, `14 November`, etc.
4. Basement Theatre: keep monitoring the Shopify blog feed; the legacy pages redirect to Vega and can return 429.
5. Consider adding AucklandNZ Events, NZICC What's On, Humanitix, Heroes for Sale and Wizards/Pokemon official event locators as new source families.
6. Add a source-specific data freshness/status view once more venue adapters are active.

## Known Behavior

- The site displays 200 events per request rather than the previous 60-event limit.
- Date-only venue events are expanded to session dates by `venueSnapshotEvents`.
- Venue chips are generated from the current filtered results and display counts.
- New detail IDs are allowed to render dynamically; static-only params must not be reintroduced.
- A nonzero uncertain price is displayed as `价格待确认` / `Price unconfirmed`.
- External images are hotlinked for now; the publisher must preserve normalized `coverImageUrl`.

## Validation

The complete core and worker test suite reached 89 passing tests after the Eventfinda Stadium integration. The latest Zoo/Western Springs follow-up also passed the venue tests and web/worker type checks. Rerun the complete suite after any new parser or catalog edit.
