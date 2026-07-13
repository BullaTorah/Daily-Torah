#!/usr/bin/env node
/**
 * Build Torah verse-level lexicon from STEPBible TAHOT (Gen–Deu).
 *
 * Usage:
 *   node scripts/build-tahot.mjs
 *   node scripts/build-tahot.mjs --input vendor/tahot-gen-deu.txt
 *
 * Output:
 *   data/tahot/torah-verses.json
 *   data/tahot/frequency.json
 *   data/tahot/alignment-report.json
 */

import { mkdir, readFile, writeFile, access } from "fs/promises";
import { constants } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  parseTahotFile,
  buildVerseIndex,
  buildFrequency,
  buildReport
} from "./lib/parse-tahot.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DEFAULT_INPUT = join(ROOT, "vendor", "tahot-gen-deu.txt");
const TAHOT_URL =
  "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt";

const OUT_DIR = join(ROOT, "data", "tahot");

function parseArgs(argv) {
  let input = DEFAULT_INPUT;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) {
      input = resolve(ROOT, argv[++i]);
    }
  }
  return { input };
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureInput(path) {
  if (await fileExists(path)) return readFile(path, "utf8");

  console.log(`TAHOT source not found at ${path}`);
  console.log("Downloading from STEPBible-Data…");

  const res = await fetch(TAHOT_URL);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${TAHOT_URL}`);
  }

  const text = await res.text();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  console.log(`Saved source to ${path}`);
  return text;
}

async function main() {
  const { input } = parseArgs(process.argv);
  const content = await ensureInput(input);

  console.log("Parsing TAHOT…");
  const tokens = [...parseTahotFile(content)];
  const verses = buildVerseIndex(tokens);
  const frequency = buildFrequency(tokens);
  const report = buildReport(tokens, verses);

  await mkdir(OUT_DIR, { recursive: true });

  const versesPath = join(OUT_DIR, "torah-verses.json");
  const freqPath = join(OUT_DIR, "frequency.json");
  const reportPath = join(OUT_DIR, "alignment-report.json");

  await writeFile(versesPath, JSON.stringify(verses), "utf8");
  await writeFile(
    freqPath,
    JSON.stringify({
      generatedAt: report.generatedAt,
      source: report.source,
      byStrongs: frequency.byStrongs,
      ranked: frequency.ranked
    }),
    "utf8"
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  const booksDir = join(OUT_DIR, "books");
  await mkdir(booksDir, { recursive: true });

  const bookNames = [
    "Genesis",
    "Exodus",
    "Leviticus",
    "Numbers",
    "Deuteronomy"
  ];

  for (const book of bookNames) {
    const subset = {};
    for (const [ref, tokens] of Object.entries(verses)) {
      if (ref.startsWith(`${book}.`)) subset[ref] = tokens;
    }
    const bookPath = join(booksDir, `${book.toLowerCase()}.json`);
    await writeFile(bookPath, JSON.stringify(subset), "utf8");
    console.log(`Wrote ${bookPath} (${Object.keys(subset).length} verses)`);
  }

  console.log(`Wrote ${versesPath}`);
  console.log(`  verses: ${report.totals.verses}`);
  console.log(`  tokens: ${report.totals.tokens}`);
  console.log(`Wrote ${freqPath}`);
  console.log(`  unique strongs: ${frequency.ranked.length}`);
  console.log(`Wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
