import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonLdNodes, normalizeJsonLdEvent, makeJsonLdAdapter } from "../src/sources/jsonld";

test("timezone-less NZ listings have the same instant on every server", () => {
  const listing = normalizeJsonLdEvent({ name: "Concert", startDate: "2026-03-14T20:00:00" },
    { sourceSlug: "venue", pageUrl: "https://example.nz" });
  assert.equal(listing?.startsAt.toISOString(), "2026-03-14T07:00:00.000Z");
});

test("a failed seed aborts ingestion instead of allowing missing-record cleanup", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const iterator = makeJsonLdAdapter("venue").fetchAll({
    config: { seeds: ["https://example.nz"] }, horizonDays: 120, log: () => {},
  });
  await assert.rejects(async () => { for await (const batch of iterator) void batch; }, /503/);
});

const PAGE = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Venue"}</script>
<script type="application/ld+json">{ this is not json }</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"MusicEvent","@id":"https://v.nz/e/1","name":"Indie Night","startDate":"2026-03-14T20:00:00+13:00",
   "endDate":"2026-03-14T23:30:00+13:00","url":"https://v.nz/e/1","image":["https://v.nz/1.jpg"],
   "description":"Three  local\\nbands","location":{"@type":"Place","name":"Whammy Bar",
     "address":{"@type":"PostalAddress","streetAddress":"183 K Road","addressLocality":"Auckland"},
     "geo":{"@type":"GeoCoordinates","latitude":"-36.8590","longitude":"174.7576"}},
   "offers":[{"@type":"Offer","price":"25.00"},{"@type":"Offer","price":"35"}]}
]}</script>
<script type="application/ld+json">[{"@type":"Event","name":"No Start Date"}]</script>
</head><body></body></html>`;

test("extracts nodes through @graph and arrays, skipping malformed blocks", () => {
  const nodes = extractJsonLdNodes(PAGE);
  const names = nodes.map((n) => (n as Record<string, unknown>).name);
  assert.ok(names.includes("Indie Night"));
  assert.ok(names.includes("Venue"));
  assert.ok(names.includes("No Start Date"));
});

test("normalises a real-shaped Event node", () => {
  const node = extractJsonLdNodes(PAGE).find(
    (n) => (n as Record<string, unknown>).name === "Indie Night",
  ) as Record<string, unknown>;

  const l = normalizeJsonLdEvent(node, { sourceSlug: "venue-x", pageUrl: "https://v.nz/whats-on" })!;
  assert.equal(l.title, "Indie Night");
  assert.equal(l.startsAt.toISOString(), "2026-03-14T07:00:00.000Z");
  assert.equal(l.endsAt!.toISOString(), "2026-03-14T10:30:00.000Z");
  assert.equal(l.venueName, "Whammy Bar");
  assert.equal(l.address, "183 K Road, Auckland");
  assert.deepEqual(l.point, { lat: -36.859, lng: 174.7576 });
  assert.equal(l.citySlug, "auckland", "resolved from coordinates");
  assert.equal(l.priceFrom, 25);
  assert.equal(l.isFree, false);
  assert.equal(l.coverImageUrl, "https://v.nz/1.jpg");
  assert.equal(l.externalId, "https://v.nz/e/1");
  assert.equal(l.summary, "Three local bands", "whitespace collapsed");
});

test("rejects nodes that cannot make a card", () => {
  assert.equal(normalizeJsonLdEvent({ "@type": "Event", name: "No Start" }, { sourceSlug: "x", pageUrl: "u" }), null);
  assert.equal(normalizeJsonLdEvent({ "@type": "Event", startDate: "2026-01-01" }, { sourceSlug: "x", pageUrl: "u" }), null);
  assert.equal(
    normalizeJsonLdEvent({ "@type": "Event", name: "Bad date", startDate: "soon" }, { sourceSlug: "x", pageUrl: "u" }),
    null,
  );
});

test("free events are detected from a zero-price offer", () => {
  const l = normalizeJsonLdEvent(
    { "@type": "Event", name: "Free Yoga", startDate: "2026-03-14T06:30:00+13:00", offers: { "@type": "Offer", price: 0 } },
    { sourceSlug: "x", pageUrl: "https://x.nz" },
  )!;
  assert.equal(l.isFree, true);
  assert.equal(l.priceFrom, null);
});

test("aggregate offer lowPrice is used as the starting price", () => {
  const listing = normalizeJsonLdEvent({
    "@type": "SportsEvent", name: "Grand Archive Ascent", startDate: "2027-01-22T08:00:00+13:00",
    offers: { "@type": "AggregateOffer", lowPrice: "108.37", highPrice: "517.72", priceCurrency: "NZD" },
  }, { sourceSlug: "eventbrite", pageUrl: "https://www.eventbrite.com/e/event" });
  assert.equal(listing?.priceFrom, 108.37);
  assert.equal(listing?.isFree, false);
});

test("a page with no JSON-LD yields nothing rather than throwing", () => {
  assert.deepEqual(extractJsonLdNodes("<html><body>nope</body></html>"), []);
});
