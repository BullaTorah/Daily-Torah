import { displaySurface, splitSegments } from "./normalize-hebrew.mjs";
import { parseDStrongs } from "./parse-dstrongs.mjs";

const BOOK_NAMES = {
  Gen: "Genesis",
  Exo: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deu: "Deuteronomy"
};

const DATA_ROW_RE =
  /^(?<book>[A-Za-z0-9]+)\.(?<chapter>\d+)\.(?<verse>\d+)#(?<word>\d+)=(?<textType>[A-Za-z()+=]+)\t/;

const HEADER = "Eng (Heb) Ref & Type";

export function parseRefField(refField) {
  const match = String(refField || "").match(DATA_ROW_RE);
  if (!match?.groups) return null;

  const book = BOOK_NAMES[match.groups.book];
  if (!book) return null;

  return {
    book,
    chapter: Number(match.groups.chapter),
    verse: Number(match.groups.verse),
    wordIndex: Number(match.groups.word),
    textType: match.groups.textType,
    verseRef: `${book}.${match.groups.chapter}.${match.groups.verse}`
  };
}

export function parseTahotLine(line) {
  const trimmed = String(line || "").trimEnd();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const ref = parseRefField(trimmed);
  if (!ref) return null;

  const cols = trimmed.split("\t");
  if (cols.length < 6) return null;

  const [, hebrew, transliteration, translation, dStrongs, morph] = cols;
  const parsed = parseDStrongs(dStrongs);

  return {
    ...ref,
    hebrew,
    surface: displaySurface(hebrew),
    segments: splitSegments(hebrew),
    transliteration: transliteration || null,
    translation: translation || null,
    dStrongs: parsed.raw,
    strongs: parsed.root,
    prefixes: parsed.prefixes,
    morph: morph || null
  };
}

export function* parseTahotFile(content) {
  let inData = false;

  for (const line of String(content || "").split("\n")) {
    if (line.startsWith(HEADER)) {
      inData = true;
      continue;
    }

    if (!inData) continue;

    const token = parseTahotLine(line);
    if (token) yield token;
  }
}

export function buildVerseIndex(tokens) {
  const verses = {};

  for (const token of tokens) {
    if (!verses[token.verseRef]) {
      verses[token.verseRef] = [];
    }
    verses[token.verseRef].push({
      index: token.wordIndex,
      surface: token.surface,
      hebrew: token.hebrew,
      segments: token.segments,
      strongs: token.strongs,
      dStrongs: token.dStrongs,
      prefixes: token.prefixes,
      morph: token.morph,
      textType: token.textType,
      translation: token.translation
    });
  }

  for (const ref of Object.keys(verses)) {
    verses[ref].sort((a, b) => a.index - b.index);
  }

  return verses;
}

export function buildFrequency(tokens) {
  const counts = new Map();

  for (const token of tokens) {
    if (!token.strongs) continue;
    counts.set(token.strongs, (counts.get(token.strongs) || 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([strongs, count], i) => ({
      strongs,
      count,
      rank: i + 1
    }));

  const byStrongs = {};
  for (const entry of ranked) {
    byStrongs[entry.strongs] = { rank: entry.rank, count: entry.count };
  }

  return { ranked, byStrongs };
}

export function buildReport(tokens, verses) {
  const byBook = {};
  const byTextType = {};
  let missingStrongs = 0;
  let hadavarTokens = [];

  for (const token of tokens) {
    byBook[token.book] = (byBook[token.book] || 0) + 1;
    byTextType[token.textType] = (byTextType[token.textType] || 0) + 1;
    if (!token.strongs) missingStrongs += 1;

    if (token.hebrew.includes("דָּבָר") && token.hebrew.includes("ה")) {
      hadavarTokens.push({
        verseRef: token.verseRef,
        index: token.wordIndex,
        hebrew: token.hebrew,
        strongs: token.strongs,
        dStrongs: token.dStrongs
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "TAHOT Gen-Deu (STEPBible)",
    totals: {
      tokens: tokens.length,
      verses: Object.keys(verses).length,
      missingStrongs
    },
    byBook,
    byTextType,
    samples: {
      hadavar: hadavarTokens.slice(0, 10)
    }
  };
}
