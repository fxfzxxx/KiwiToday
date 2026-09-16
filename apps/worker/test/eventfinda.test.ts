import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEventfinda } from "../src/sources/eventfinda";

/** Shaped after Eventfinda's documented v2 Event resource. */
const RAW = {
  id: 1234567,
  url: "https://www.eventfinda.co.nz/2026/six60/auckland",
  name: "SIX60 — Saturdays in the Park",
  description: "<p>The  <b>biggest</b> show of summer.</p>",
  datetime_start: "2026-03-14 19:30:00",
  datetime_end: "2026-03-14 23:00:00",
  is_free: "0",
  address: "Western Springs Stadium, Auckland",
  point: { lat: -36.8664, lng: 174.7247 },
  location: { name: "Western Springs Stadium" },
  category: { name: "Live Music" },
  images: {
    images: [
      { is_primary: false, transforms: { transforms: [{ url: "https://img/small.jpg", width: 100 }] } },
      { is_primary: true, transforms: { transforms: [
        { url: "https://img/med.jpg", width: 600 }, { url: "https://img/large.jpg", width: 1200 },
      ] } },
    ],
  },
  ticket_types: { ticket_types: [{ price: 89.9 }, { price: 129 }, { price: 0 }] },
};

test("maps a documented-shape record", () => {
  const l = normalizeEventfinda(RAW)!;
  assert.equal(l.sourceSlug, "eventfinda");
  assert.equal(l.externalId, "1234567");
  assert.equal(l.title, "SIX60 — Saturdays in the Park");
  // 19:30 NZDT -> 06:30Z. Getting this wrong shifts the whole feed a day.
  assert.equal(l.startsAt.toISOString(), "2026-03-14T06:30:00.000Z");
  assert.equal(l.endsAt!.toISOString(), "2026-03-14T10:00:00.000Z");
  assert.equal(l.summary, "The biggest show of summer.", "html stripped, whitespace collapsed");
  assert.equal(l.isFree, false);
  assert.equal(l.priceFrom, 89.9, "zero-priced tiers ignored when paid tiers exist");
  assert.equal(l.venueName, "Western Springs Stadium");
  assert.equal(l.coverImageUrl, "https://img/large.jpg", "largest transform of the primary image");
  assert.deepEqual(l.point, { lat: -36.8664, lng: 174.7247 });
});

test("survives a response missing every optional field", () => {
  const l = normalizeEventfinda({ id: 9, name: "Bare Minimum", datetime_start: "2026-05-01 10:00:00" })!;
  assert.equal(l.title, "Bare Minimum");
  assert.equal(l.point, null);
  assert.equal(l.coverImageUrl, null);
  assert.equal(l.priceFrom, null);
  assert.equal(l.url, "https://www.eventfinda.co.nz/event/9");
});

test("drops records that cannot be rendered or bucketed", () => {
  assert.equal(normalizeEventfinda({ id: 1, datetime_start: "2026-05-01 10:00:00" }), null);
  assert.equal(normalizeEventfinda({ id: 2, name: "No date" }), null);
  assert.equal(normalizeEventfinda({ nope: true }), null);
});

test("is_free is truthy-tolerant across the shapes an API might send", () => {
  for (const v of [true, 1, "1", "true"]) {
    assert.equal(normalizeEventfinda({ id: 3, name: "F", datetime_start: "2026-05-01 10:00:00", is_free: v })!.isFree, true);
  }
  for (const v of [false, 0, "0", "false", null]) {
    assert.equal(normalizeEventfinda({ id: 3, name: "F", datetime_start: "2026-05-01 10:00:00", is_free: v })!.isFree, false);
  }
});
