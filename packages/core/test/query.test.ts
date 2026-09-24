import { test } from "node:test";
import assert from "node:assert/strict";
import { eventQuerySchema } from "../src/types";

test("free query parses explicit booleans without treating false as truthy", () => {
  assert.equal(eventQuerySchema.parse({ free: "false" }).free, false);
  assert.equal(eventQuerySchema.parse({ free: "true" }).free, true);
  assert.equal(eventQuerySchema.parse({ free: false }).free, false);
  assert.equal(eventQuerySchema.parse({}).free, undefined);
  assert.equal(eventQuerySchema.safeParse({ free: "garbage" }).success, false);
});
