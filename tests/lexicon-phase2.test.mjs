import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { alignVerseTokens } from "../js/core/tahot-align.js";
import { tokenizeHebrewVerse } from "../js/core/tokenize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data", "tahot");

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("alignVerseTokens matches Deuteronomy 4:2 הַדָּבָר to H1697", async () => {
  const deuteronomy = await loadJson(join(DATA_DIR, "books/deuteronomy.json"));
  const tahotTokens = deuteronomy["Deuteronomy.4.2"];
  assert.ok(tahotTokens);

  const sefariaHe =
    "לֹא תֹסִפוּ עַל הַדָּבָר אֲשֶׁר אָנֹכִי מְצַוֶּה אֶתְכֶם";
  const sefariaTokens = tokenizeHebrewVerse(sefariaHe);
  const aligned = alignVerseTokens(sefariaTokens, tahotTokens);

  const hadavar = aligned.find((t) => t.surface.includes("הַדָּבָר"));
  assert.ok(hadavar, "expected הַדָּבָר in aligned tokens");
  assert.equal(hadavar.aligned, true);
  assert.equal(hadavar.tahot.strongs, "1697");
});

test("book shards exist for all Torah books", async () => {
  for (const book of [
    "genesis",
    "exodus",
    "leviticus",
    "numbers",
    "deuteronomy"
  ]) {
    const data = await loadJson(join(DATA_DIR, "books", `${book}.json`));
    assert.ok(Object.keys(data).length > 0, `${book}.json should not be empty`);
  }
});

test("Genesis 1:1 aligns all seven tokens", async () => {
  const genesis = await loadJson(join(DATA_DIR, "books/genesis.json"));
  const tahotTokens = genesis["Genesis.1.1"];

  const sefariaHe =
    "בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ";
  const sefariaTokens = tokenizeHebrewVerse(sefariaHe);
  const aligned = alignVerseTokens(sefariaTokens, tahotTokens);

  assert.equal(aligned.length, 7);
  assert.equal(aligned.filter((t) => t.aligned).length, 7);
  assert.equal(aligned[0].tahot.strongs, "7225");
});

test("Sefaria thinsp markup splits להם and משה into separate tokens", async () => {
  const { cleanHebrewText } = await import("../js/core/lookup.js");
  const raw = "לָהֶם&thinsp;<small>׀</small>&thinsp;מֹשֶׁה";
  const tokens = tokenizeHebrewVerse(raw);

  assert.deepEqual(tokens, ["לָהֶם", "מֹשֶׁה"]);
  assert.equal(cleanHebrewText(raw), "לָהֶם מֹשֶׁה");
});
