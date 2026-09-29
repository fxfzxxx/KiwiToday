import { test } from "node:test";
import assert from "node:assert/strict";
import { inferCategory } from "../src/categories";

test("category keywords match complete words instead of substrings", () => {
  assert.equal(inferCategory("Conan Gray", "The global pop artist's world tour sails into Auckland."), "music");
  assert.equal(inferCategory("Auckland sailing regatta"), "other");
  assert.equal(inferCategory("Learn to sail in Auckland"), "water");
});

test("stand-up shows are comedy, not water activities", () => {
  assert.equal(inferCategory("Aaron Chen", "A distinctive comedy voice, with a Funny Garden Netflix special, Adult Swim special and Adult Swim/Warner Media credit, plus a new stand-up hour."), "comedy");
  assert.equal(inferCategory("Adult Swim sessions at the pool"), "water");
});

test("figurative deep dives are not water activities", () => {
  assert.equal(inferCategory("Members | Deep dive: Contemporary art in Aotearoa"), "arts");
});

test("anime and comic conventions have their own category", () => {
  assert.equal(inferCategory("Overload 2026"), "comics");
  assert.equal(inferCategory("Auckland Anime & Manga Convention"), "comics");
  assert.equal(inferCategory("Cosplay competition"), "comics");
  assert.equal(inferCategory("A comic voice returns with a new comedy show"), "comedy");
});

test("trading card and tabletop events have their own category", () => {
  assert.equal(inferCategory("Pokémon TCG League Challenge"), "tabletop");
  assert.equal(inferCategory("Magic: The Gathering Commander Night"), "tabletop");
  assert.equal(inferCategory("Board Game Meetup"), "tabletop");
  assert.equal(inferCategory("One Piece Hobby", "One Piece", "Come sail with us for our One Piece Card Game weekly hobby league!"), "tabletop");
  assert.equal(inferCategory("One Piece - Extra Grand Battle for Stores 2026", "One Piece", "Come sail with us for the One Piece Extra Grand Battle."), "tabletop");
  assert.equal(inferCategory("Dungeons & Dragons Adventurer's League"), "tabletop");
  assert.equal(inferCategory("Riftbound Nexus Nights"), "tabletop");
});
