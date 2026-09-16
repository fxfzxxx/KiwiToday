import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchEvents, titleFingerprint, titleSimilarity, haversineMeters, titleTokens,
} from "../src/dedupe";

const SPARK = { lat: -36.8476, lng: 174.7842 };
const EDEN = { lat: -36.8748, lng: 174.7449 };

test("fingerprint ignores word order, noise words and macrons", () => {
  assert.equal(
    titleFingerprint("Six60 Live in Concert — Auckland"),
    titleFingerprint("Auckland: SIX60 (concert)"),
  );
  assert.equal(titleFingerprint("Taupō Summer Market"), titleFingerprint("Taupo Summer Market"));
});

test("tokenises CJK into bigrams", () => {
  assert.deepEqual(titleTokens("陶波市集"), ["陶波", "波市", "市集"]);
});

test("same gig from two sources merges", () => {
  const r = matchEvents(
    { title: "SIX60 — Saturdays in the Park", startsAt: new Date("2026-03-14T06:30:00Z"), point: SPARK },
    { title: "Six60: Saturdays In The Park (Auckland)", startsAt: new Date("2026-03-14T07:00:00Z"), point: SPARK },
  );
  assert.equal(r.verdict, "same");
  assert.ok(r.confidence >= 0.8, `confidence ${r.confidence}`);
});

test("identical url short-circuits to same", () => {
  const r = matchEvents(
    { title: "Totally Different Words Here", startsAt: new Date("2026-03-14T06:30:00Z"), url: "https://x.nz/e/1" },
    { title: "Nothing Alike At All", startsAt: new Date("2026-05-01T06:30:00Z"), url: "https://x.nz/e/1" },
  );
  assert.equal(r.verdict, "same");
});

test("same tour on different nights stays separate", () => {
  const r = matchEvents(
    { title: "SIX60 National Tour", startsAt: new Date("2026-03-14T07:00:00Z"), point: SPARK },
    { title: "SIX60 National Tour", startsAt: new Date("2026-03-15T07:00:00Z"), point: SPARK },
  );
  assert.equal(r.verdict, "different");
});

test("same title at a different venue stays separate", () => {
  const r = matchEvents(
    { title: "Summer Sounds Festival", startsAt: new Date("2026-03-14T07:00:00Z"), point: SPARK },
    { title: "Summer Sounds Festival", startsAt: new Date("2026-03-14T07:00:00Z"), point: EDEN },
  );
  assert.equal(r.verdict, "different");
});

test("explicit venue ids beat coordinates", () => {
  const r = matchEvents(
    { title: "NZSO: Dvořák 9", startsAt: new Date("2026-03-14T06:00:00Z"), venueId: "v1", point: SPARK },
    { title: "NZSO Dvorak No. 9", startsAt: new Date("2026-03-14T06:00:00Z"), venueId: "v1", point: EDEN },
  );
  assert.equal(r.verdict, "same");
});

test("missing coordinates abstain rather than veto, landing in review", () => {
  const r = matchEvents(
    { title: "Devonport Craft Market", startsAt: new Date("2026-03-14T21:00:00Z"), point: null },
    { title: "Devonport Craft & Vintage Market", startsAt: new Date("2026-03-14T22:00:00Z"), point: null },
  );
  assert.equal(r.verdict, "review");
  assert.equal(r.signals.geo, null);
});

test("unrelated events are different", () => {
  const r = matchEvents(
    { title: "Piha Surf Lifesaving Lesson", startsAt: new Date("2026-03-14T20:00:00Z"), point: SPARK },
    { title: "NZSO Symphony Night", startsAt: new Date("2026-03-14T20:00:00Z"), point: SPARK },
  );
  assert.equal(r.verdict, "different");
});

test("haversine is accurate enough to threshold on", () => {
  const d = haversineMeters(SPARK, EDEN);
  assert.ok(d > 4000 && d < 5200, `got ${d}m`); // Spark Arena → Eden Park ≈ 4.6km
  assert.ok(haversineMeters(SPARK, SPARK) < 1);
});

test("similarity is bounded and symmetric", () => {
  const a = "Waiheke Island Vineyard Run", b = "Vineyard Run, Waiheke Island";
  assert.equal(titleSimilarity(a, b), titleSimilarity(b, a));
  assert.ok(titleSimilarity(a, a) === 1);
});
