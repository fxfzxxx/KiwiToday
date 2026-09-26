import { test } from "node:test";
import assert from "node:assert/strict";
import { inferCategory } from "../src/categories";

test("category keywords match complete words instead of substrings", () => {
  assert.equal(inferCategory("Conan Gray", "The global pop artist's world tour sails into Auckland."), "music");
  assert.equal(inferCategory("Auckland sailing regatta"), "other");
  assert.equal(inferCategory("Learn to sail in Auckland"), "water");
});
