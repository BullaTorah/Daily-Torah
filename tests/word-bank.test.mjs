import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStrongs } from "../js/core/strongs.js";

test("normalizeStrongs extracts numeric id", () => {
  assert.equal(normalizeStrongs("H3478"), "3478");
  assert.equal(normalizeStrongs("3478"), "3478");
  assert.equal(normalizeStrongs("G123"), "123");
});

test("normalizeStrongs returns null for empty input", () => {
  assert.equal(normalizeStrongs(""), null);
  assert.equal(normalizeStrongs(null), null);
  assert.equal(normalizeStrongs("no-digits"), null);
});
