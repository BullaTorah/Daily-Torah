import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDStrongs } from "../scripts/lib/parse-dstrongs.mjs";
import { parseTahotLine } from "../scripts/lib/parse-tahot.mjs";
import { displaySurface } from "../scripts/lib/normalize-hebrew.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data", "tahot");

async function loadJson(name) {
  const raw = await readFile(join(DATA_DIR, name), "utf8");
  return JSON.parse(raw);
}

test("parseDStrongs extracts root from definite article + dabar", () => {
  const parsed = parseDStrongs("H9009/{H1697G}");
  assert.equal(parsed.root, "1697");
  assert.deepEqual(parsed.prefixes, ["9009"]);
});

test("parseDStrongs handles conjunction + article + dabar", () => {
  const parsed = parseDStrongs("H9002/H9009/{H1697L}");
  assert.equal(parsed.root, "1697");
  assert.deepEqual(parsed.prefixes, ["9002", "9009"]);
});

test("parseTahotLine parses Gen.1.1 first word", () => {
  const line =
    "Gen.1.1#01=L\tבְּ/רֵאשִׁ֖ית\tbe./re.Shit\tin/ beginning\tH9003/{H7225G}\tHR/Ncfsa";
  const token = parseTahotLine(line);
  assert.equal(token.verseRef, "Genesis.1.1");
  assert.equal(token.wordIndex, 1);
  assert.equal(token.strongs, "7225");
  assert.equal(token.surface, displaySurface("בְּ/רֵאשִׁ֖ית"));
});

test("הַדָּבָר maps to H1697 in TAHOT (Deuteronomy 4:2)", async () => {
  const verses = await loadJson("torah-verses.json");
  const tokens = verses["Deuteronomy.4.2"];
  assert.ok(tokens, "Deuteronomy.4.2 should exist");

  const hadavar = tokens.find((t) => t.hebrew.includes("הַ/דָּבָר"));
  assert.ok(hadavar, "expected הַ/דָּבָר token in Deuteronomy.4.2");
  assert.equal(hadavar.strongs, "1697");
  assert.notEqual(hadavar.strongs, "1907");
});

test("הַדָּבָר never maps to H1907 anywhere in Torah TAHOT data", async () => {
  const verses = await loadJson("torah-verses.json");

  for (const [ref, tokens] of Object.entries(verses)) {
    for (const token of tokens) {
      if (!token.hebrew.includes("הַ/דָּבָר")) continue;
      assert.equal(
        token.strongs,
        "1697",
        `${ref}#${token.index}: הַדָּבָר should be 1697, got ${token.strongs}`
      );
    }
  }
});

test("frequency ranks דבר (1697) as common in Torah", async () => {
  const freq = await loadJson("frequency.json");
  const entry = freq.byStrongs["1697"];
  assert.ok(entry, "H1697 should appear in Torah frequency");
  assert.ok(entry.rank <= 100, `H1697 rank should be top 100, got ${entry.rank}`);
  assert.ok(entry.count >= 50, `H1697 count should be substantial, got ${entry.count}`);
});

test("torah-verses covers all five Torah books", async () => {
  const verses = await loadJson("torah-verses.json");
  const books = new Set(Object.keys(verses).map((ref) => ref.split(".")[0]));

  for (const book of [
    "Genesis",
    "Exodus",
    "Leviticus",
    "Numbers",
    "Deuteronomy"
  ]) {
    assert.ok(books.has(book), `missing book: ${book}`);
  }
});
