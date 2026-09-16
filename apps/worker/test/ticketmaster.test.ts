import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTicketmaster } from "../src/sources/ticketmaster";

/** Shaped after a Discovery API v2 event. */
const RAW = {
  id: "G5vzZ9Y3aBcDe",
  name: "SIX60",
  url: "https://www.ticketmaster.co.nz/six60-auckland/event/G5vzZ9Y3aBcDe",
  info: "Doors  open   6pm.",
  dates: {
    start: { localDate: "2026-03-14", localTime: "19:30:00", dateTime: "2026-03-14T06:30:00Z" },
    end: { dateTime: "2026-03-14T10:00:00Z" },
    status: { code: "onsale" },
  },
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  priceRanges: [{ min: 89.9 }, { min: 129 }],
  images: [
    { url: "https://img/small.jpg", width: 305 },
    { url: "https://img/large.jpg", width: 2048 },
  ],
  _embedded: {
    venues: [{
      name: "Spark Arena",
      address: { line1: "Mahuhu Crescent" },
      city: { name: "Auckland" },
      location: { latitude: "-36.8476", longitude: "174.7842" },
    }],
  },
};

test("maps a Discovery API event", () => {
  const l = normalizeTicketmaster(RAW)!;
  assert.equal(l.sourceSlug, "ticketmaster");
  assert.equal(l.externalId, "G5vzZ9Y3aBcDe");
  assert.equal(l.title, "SIX60");
  assert.equal(l.startsAt.toISOString(), "2026-03-14T06:30:00.000Z");
  assert.equal(l.endsAt!.toISOString(), "2026-03-14T10:00:00.000Z");
  assert.equal(l.summary, "Doors open 6pm.");
  assert.equal(l.priceFrom, 89.9);
  assert.equal(l.venueName, "Spark Arena");
  assert.equal(l.address, "Mahuhu Crescent, Auckland");
  assert.deepEqual(l.point, { lat: -36.8476, lng: 174.7842 });
  assert.equal(l.citySlug, "auckland", "resolved from coordinates");
  assert.equal(l.coverImageUrl, "https://img/large.jpg");
  assert.equal(l.categoryHint, "Music Rock");
});

test("cancelled events are dropped so the tombstone pass retires them", () => {
  const cancelled = { ...RAW, dates: { ...RAW.dates, status: { code: "cancelled" } } };
  assert.equal(normalizeTicketmaster(cancelled), null);
});

test("postponed events survive but lose their popularity boost", () => {
  const postponed = { ...RAW, dates: { ...RAW.dates, status: { code: "postponed" } } };
  const l = normalizeTicketmaster(postponed)!;
  assert.equal(l.popularity, 0);
  assert.equal(normalizeTicketmaster(RAW)!.popularity, 1);
});

test("falls back to NZ wall-clock localDate/localTime when dateTime is absent", () => {
  const tba = { ...RAW, dates: { start: { localDate: "2026-03-14", localTime: "19:30:00" }, status: { code: "onsale" } } };
  // 19:30 NZDT == 06:30Z. Treating it as UTC would land the event a day early.
  assert.equal(normalizeTicketmaster(tba)!.startsAt.toISOString(), "2026-03-14T06:30:00.000Z");
});

test("date-only events start at NZ midnight", () => {
  const dateOnly = { ...RAW, dates: { start: { localDate: "2026-07-14", timeTBA: true }, status: { code: "onsale" } } };
  assert.equal(normalizeTicketmaster(dateOnly)!.startsAt.toISOString(), "2026-07-13T12:00:00.000Z");
});

test("null-island coordinates are treated as missing", () => {
  const noGeo = {
    ...RAW,
    _embedded: { venues: [{ name: "TBC", location: { latitude: 0, longitude: 0 } }] },
  };
  const l = normalizeTicketmaster(noGeo)!;
  assert.equal(l.point, null);
  assert.equal(l.citySlug, null);
});

test("drops records that cannot be rendered or bucketed", () => {
  assert.equal(normalizeTicketmaster({ id: "x", dates: { start: { dateTime: "2026-01-01T00:00:00Z" } } }), null);
  assert.equal(normalizeTicketmaster({ id: "x", name: "No date" }), null);
  assert.equal(normalizeTicketmaster({ nope: true }), null);
});
