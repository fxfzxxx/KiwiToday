import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedUrl, crawlVenue, discoverLinks } from "../src/venues/crawl";
import { validateCandidates } from "../src/venues/ai";

const venue = { slug: "test", name: "Test Hall", city: "auckland", seeds: ["https://venue.example/events"], linkPrefixes: ["/events/"], maxPages: 3 };
const now = new Date("2026-09-25T00:00:00Z");
const event = { "@type": "MusicEvent", name: "Concert", startDate: "2026-09-30T20:00:00+13:00", location: { name: "Test Hall" } };

test("discovery stays on the approved origin and excludes unrelated paths and tracking duplicates", () => {
  assert.deepEqual(discoverLinks('<a href="/events/one?utm_source=x">one</a><a href="/events/one#buy">one</a><a href="https://evil.example/events/">bad</a><a href="/login">login</a>', venue.seeds[0]!, venue.linkPrefixes), ["https://venue.example/events/one"]);
  assert.equal(allowedUrl("javascript:alert(1)", venue.seeds[0]!), null);
  assert.equal(allowedUrl("https://user:pass@venue.example/events", venue.seeds[0]!), null);
});

test("crawler follows a detail page and preserves evidence", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : url.endsWith("/events") ? '<a href="/events/one">Concert</a>' : `<script type="application/ld+json">${JSON.stringify(event)}</script>`;
    return new Response(body, { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const report = await crawlVenue(venue, { now, fetcher, delayMs: 0 });
  assert.equal(report.events.length, 1);
  assert.equal(report.pages.length, 2);
  assert.equal(report.events[0]?.sourceSlug, "test");
  assert.equal(report.coverage, "partial");
});

test("robots disallow prevents a page request and reports failure, not empty coverage", async () => {
  let requests = 0;
  const fetcher = (async () => { requests++; return new Response("User-agent: *\nDisallow: /"); }) as typeof fetch;
  const report = await crawlVenue(venue, { now, fetcher, delayMs: 0 });
  assert.equal(requests, 1);
  assert.equal(report.pages[0]?.status, "failed");
});

test("page cap is visible and does not claim complete coverage", async () => {
  const fetcher = (async () => new Response('<a href="/events/one">one</a>', { headers: { "content-type": "text/html" } })) as typeof fetch;
  const report = await crawlVenue({ ...venue, maxPages: 1 }, { now, fetcher, delayMs: 0 });
  assert.equal(report.truncated, true);
});

test("AI candidates without exact source evidence are rejected", () => {
  const text = "Concert at Test Hall on 30 September 2026.";
  const candidate = { title: "Concert", venueText: "Test Hall", startText: "30 September 2026", evidence: text };
  assert.equal(validateCandidates({ events: [candidate] }, text).length, 1);
  assert.equal(validateCandidates({ events: [{ ...candidate, startText: "1 October 2026" }] }, text).length, 0);
});

test("shared sites cannot assign another venue's event to this venue", async () => {
  const fetcher = (async (input: string | URL | Request) => new Response(String(input).endsWith("robots.txt") ? "" : `<script type="application/ld+json">${JSON.stringify({ ...event, location: { name: "Other Hall" } })}</script>`, { headers: { "content-type": "text/html" } })) as typeof fetch;
  assert.equal((await crawlVenue(venue, { now, fetcher, delayMs: 0 })).events.length, 0);
});

test("Spark date-only announcements never become invented midnight events", async () => {
  const fetcher = (async (input: string | URL | Request) => new Response(String(input).endsWith("robots.txt") ? "" : '<h1>Concert</h1><time datetime="2026-09-30T00:00:00.000Z">30 Sep</time>', { headers: { "content-type": "text/html" } })) as typeof fetch;
  const report = await crawlVenue({ ...venue, slug: "spark-arena", seeds: ["https://venue.example/all-events/concert"] }, { now, fetcher, delayMs: 0 });
  assert.equal(report.events.length, 0);
  assert.deepEqual(report.dateOnlyAnnouncements, [{ title: "Concert", date: "2026-09-30", sourceUrl: "https://venue.example/all-events/concert", precision: "day" }]);
});

test("Card Merchant maps public BinderPOS listings to Auckland events without asserting the API price", async () => {
  const binderEvent = {
    id: 123, title: "Pokémon Day - Free Cards & Activities!", date: "2026-09-30T00:00Z[GMT]", time: "13:00:00",
    game: "Pokémon", buildingName: "Card Merchant Westcity", streetAddress: "7 Catherine Street",
    city: "Auckland", zipCode: "0612", ticketPrice: 55,
    description: "<p>Free Pokémon activities.</p>", disabled: false,
  };
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /", { status: 200 });
    return new Response(JSON.stringify([binderEvent]), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const report = await crawlVenue({
    slug: "card-merchant-westcity", name: "Card Merchant WestCity", city: "auckland",
    seeds: ["https://cardmerchant.co.nz/"], linkPrefixes: ["/"], maxPages: 1,
  }, { now: new Date("2026-09-29T00:00:00Z"), days: 30, fetcher });

  assert.equal(report.events.length, 1);
  assert.equal(report.events[0]?.startsAt.toISOString(), "2026-09-30T00:00:00.000Z");
  assert.equal(report.events[0]?.priceFrom, null);
  assert.equal(report.events[0]?.isFree, false);
  assert.equal((report.events[0]?.raw as { priceStatus: string }).priceStatus, "unconfirmed");
  assert.equal(report.events[0]?.summary, "Free Pokémon activities.");
  assert.equal(report.events[0]?.address, "7 Catherine Street, Auckland, 0612");
});

test("Grand Archive Eventbrite JSON-LD retains its multi-day range and marks the ticket price unconfirmed", async () => {
  const grandArchiveEvent = {
    "@type": "SportsEvent", name: "Grand Archive TCG - Ascent Auckland 2027",
    startDate: "2027-01-22T08:00:00+13:00", endDate: "2027-01-24T23:00:00+13:00",
    url: "https://www.eventbrite.com/e/grand-archive-tcg-ascent-auckland-2027-tickets-2001275411629",
    image: "https://images.example/grand-archive.jpg", description: "Grand Archive returns to New Zealand for the first Ascent of the CBL season!",
    location: { "@type": "Place", name: "Alexandra Park Raceway", address: { streetAddress: "Manukau Road", addressLocality: "Auckland", addressRegion: "Auckland" } },
    offers: [{ "@type": "Offer", price: "108.37", priceCurrency: "NZD" }],
  };
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const body = url.pathname === "/robots.txt"
      ? "User-agent: *\nAllow: /"
      : `<script type="application/ld+json">${JSON.stringify(grandArchiveEvent)}</script>`;
    return new Response(body, { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const report = await crawlVenue({
    slug: "grand-archive-ascent-auckland", name: "Alexandra Park Raceway", city: "auckland",
    seeds: ["https://www.eventbrite.com/e/grand-archive-tcg-ascent-auckland-2027-tickets-2001275411629"],
    linkPrefixes: ["/e/grand-archive-tcg-ascent-auckland-2027-tickets-"], maxPages: 1,
  }, { now: new Date("2026-09-29T00:00:00Z"), days: 366, fetcher, delayMs: 0 });

  assert.equal(report.events.length, 1);
  assert.equal(report.events[0]?.startsAt.toISOString(), "2027-01-21T19:00:00.000Z");
  assert.equal(report.events[0]?.endsAt?.toISOString(), "2027-01-24T10:00:00.000Z");
  assert.equal(report.events[0]?.venueName, "Alexandra Park Raceway");
  assert.equal(report.events[0]?.priceFrom, 108.37);
  assert.equal((report.events[0]?.raw as { priceStatus: string }).priceStatus, "unconfirmed");
});

test("Auckland Zoo keeps an explicit daily activity as recurring sessions", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.endsWith("robots.txt")
      ? "User-agent: *\nAllow: /"
      : "<main><h1>Dinosaur Discovery Session</h1><p>Open 9:30am - 4pm daily from 10 June 2026.</p></main>";
    return new Response(body, { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const report = await crawlVenue({
    slug: "auckland-zoo", name: "Auckland Zoo", city: "auckland",
    seeds: ["https://www.aucklandzoo.co.nz/visit/education-session-dinosaur-discovery"],
    linkPrefixes: ["/"], maxPages: 1,
  }, { now: new Date("2026-09-30T00:00:00Z"), days: 3, fetcher, delayMs: 0 });

  assert.equal(report.dateOnlyAnnouncements.length, 1);
  assert.equal(report.dateOnlyAnnouncements[0]?.date, "2026-09-30");
  assert.deepEqual(report.dateOnlyAnnouncements[0]?.sessionDates, ["2026-09-30", "2026-10-01", "2026-10-02"]);
  assert.equal(report.dateOnlyAnnouncements[0]?.scheduleText, "9:30am–4pm daily");
});

test("Eventfinda Stadium maps its public VenueIQ feed into timed activities", async () => {
  const feed = [{ id: 757, title: "BX-9 Vol. 7", start: "2026-10-02T11:00:00.000Z", end: "2026-10-02T11:00:00.000Z", imageUrl: "https://images.example/bx9.png", ticketsUrl: "https://www.eventfinda.co.nz/event/bx9", locationName: "Eventfinda Stadium", locationAddress: "17 Silverfield" }];
  const fetcher = (async () => new Response(JSON.stringify({ events: feed }), { headers: { "content-type": "application/json" } })) as typeof fetch;
  const report = await crawlVenue({ slug: "eventfinda-stadium", name: "Eventfinda Stadium", city: "auckland", seeds: ["https://www.eventfindastadium.co.nz/upcoming"], linkPrefixes: ["/"], maxPages: 1 }, { now: new Date("2026-09-30T00:00:00Z"), days: 30, fetcher });
  assert.equal(report.events.length, 1);
  assert.equal(report.events[0]?.title, "BX-9 Vol. 7");
  assert.equal(report.events[0]?.startsAt.toISOString(), "2026-10-02T11:00:00.000Z");
  assert.equal(report.events[0]?.venueName, "Eventfinda Stadium");
});
