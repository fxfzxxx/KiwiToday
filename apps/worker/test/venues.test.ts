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
