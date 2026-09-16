import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketToRange, formatWhen, nzOffsetMs, nzStartOfDay, nzWeekday, parseNzLocal } from "../src/dates";

// NZDT (UTC+13) — January. NZST (UTC+12) — July.
const SUMMER = new Date("2026-01-15T02:00:00Z"); // 15:00 Thu in Auckland
const WINTER = new Date("2026-07-15T02:00:00Z"); // 14:00 Wed in Auckland

test("tracks NZ daylight saving", () => {
  assert.equal(nzOffsetMs(SUMMER) / 3_600_000, 13);
  assert.equal(nzOffsetMs(WINTER) / 3_600_000, 12);
});

test("start of day is local midnight in Auckland", () => {
  assert.equal(nzStartOfDay(SUMMER, 0).toISOString(), "2026-01-14T11:00:00.000Z");
  assert.equal(nzStartOfDay(WINTER, 0).toISOString(), "2026-07-14T12:00:00.000Z");
});

test("weekday is computed in NZ, not UTC", () => {
  // 02:00Z Thursday is still Thursday 15:00 in Auckland.
  assert.equal(nzWeekday(SUMMER), 4);
});

test("today starts now, so finished events are excluded", () => {
  const r = bucketToRange("today", SUMMER);
  assert.equal(r.from.getTime(), SUMMER.getTime());
  assert.equal(r.to!.toISOString(), "2026-01-15T11:00:00.000Z");
});

test("tomorrow is a full local day", () => {
  const r = bucketToRange("tomorrow", SUMMER);
  assert.equal(r.from.toISOString(), "2026-01-15T11:00:00.000Z");
  assert.equal(r.to!.toISOString(), "2026-01-16T11:00:00.000Z");
});

test("weekend covers Sat 00:00 to Mon 00:00 NZ", () => {
  const r = bucketToRange("weekend", SUMMER); // Thursday
  assert.equal(r.from.toISOString(), "2026-01-16T11:00:00.000Z"); // Sat 00:00 NZDT
  assert.equal(r.to!.toISOString(), "2026-01-18T11:00:00.000Z");  // Mon 00:00 NZDT
});

test("on Saturday the weekend bucket is the one we are in", () => {
  const sat = new Date("2026-01-17T05:00:00Z"); // Sat 18:00 NZ
  const r = bucketToRange("weekend", sat);
  assert.equal(r.from.getTime(), sat.getTime(), "clamped to now, not last Saturday");
  assert.equal(r.to!.toISOString(), "2026-01-18T11:00:00.000Z");
});

test("all dates is unbounded", () => {
  assert.equal(bucketToRange("all", SUMMER).to, null);
});

test("formatWhen labels relative days in both locales", () => {
  const tonight = new Date("2026-01-15T06:30:00Z"); // 19:30 Thu NZ
  assert.match(formatWhen(tonight, { locale: "zh", now: SUMMER }), /^今天 19:30$/);
  assert.match(formatWhen(tonight, { locale: "en", now: SUMMER }), /^Today 19:30$/);
  const tomorrow = new Date("2026-01-16T06:30:00Z");
  assert.match(formatWhen(tomorrow, { locale: "zh", now: SUMMER }), /^明天 19:30$/);
});

test("naive NZ wall-clock strings become the right instant across DST", () => {
  // 19:30 on 14 Mar 2026 is NZDT (UTC+13) -> 06:30Z
  assert.equal(parseNzLocal("2026-03-14 19:30:00")!.toISOString(), "2026-03-14T06:30:00.000Z");
  // 19:30 on 14 Jul 2026 is NZST (UTC+12) -> 07:30Z
  assert.equal(parseNzLocal("2026-07-14 19:30:00")!.toISOString(), "2026-07-14T07:30:00.000Z");
});

test("explicit offsets are respected, not re-interpreted", () => {
  assert.equal(parseNzLocal("2026-03-14T06:30:00Z")!.toISOString(), "2026-03-14T06:30:00.000Z");
});

test("date-only strings start at NZ midnight", () => {
  assert.equal(parseNzLocal("2026-03-14")!.toISOString(), "2026-03-13T11:00:00.000Z");
});

test("garbage in, null out", () => {
  assert.equal(parseNzLocal("not a date"), null);
  assert.equal(parseNzLocal(null), null);
});
