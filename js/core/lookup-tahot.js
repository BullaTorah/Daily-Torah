import { tokenizeHebrewVerse } from "./tokenize.js";
import { alignVerseTokens } from "./tahot-align.js";
import { formatDivineNameEnglish } from "./divine-name.js";

let gloss = {};
let frequency = {};
const verseIndex = new Map();
const loadedBooks = new Set();
/** Consonantal lemma → Strong's ids (for clicks outside aligned Torah verses). */
let consonantalIndex = new Map();

const BOOK_FILES = {
  Genesis: "data/tahot/books/genesis.json",
  Exodus: "data/tahot/books/exodus.json",
  Leviticus: "data/tahot/books/leviticus.json",
  Numbers: "data/tahot/books/numbers.json",
  Deuteronomy: "data/tahot/books/deuteronomy.json"
};

function toStrongId(id) {
  const match = String(id || "").match(/\d+/);
  return match ? match[0] : null;
}

function normalizeSurface(w) {
  return String(w || "")
    .normalize("NFD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\u05D0-\u05EA]/g, "");
}

function stripPrefixLetter(clean) {
  const prefixes = ["ו", "ב", "ל", "כ", "מ", "ה", "ש"];
  if (prefixes.includes(clean[0]) && clean.length >= 4) {
    return clean.slice(1);
  }
  return clean;
}

function buildConsonantalIndex() {
  consonantalIndex = new Map();
  for (const [id, entry] of Object.entries(gloss)) {
    const key = normalizeSurface(entry?.lemma);
    if (!key) continue;
    if (!consonantalIndex.has(key)) consonantalIndex.set(key, []);
    consonantalIndex.get(key).push(String(id));
  }
}

function pickBestByRank(ids) {
  let best = null;
  for (const id of ids) {
    const sense = buildSense(id);
    if (!sense.strongs) continue;
    if (
      !best ||
      (sense.rank != null && (best.rank == null || sense.rank < best.rank))
    ) {
      best = sense;
    }
  }
  return best;
}

/** Best-effort gloss lookup when there is no Torah verse alignment (e.g. practice). */
function resolveBySurface(word) {
  const clean = normalizeSurface(word);
  if (!clean) return null;

  const keys = [clean];
  const stripped = stripPrefixLetter(clean);
  if (stripped !== clean) keys.push(stripped);

  const ids = [];
  const seen = new Set();
  for (const key of keys) {
    for (const id of consonantalIndex.get(key) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }

  return pickBestByRank(ids);
}

function frequencyKeys(id) {
  const bare = id.replace(/^0+/, "") || id;
  const padded = bare.padStart(4, "0");
  return [...new Set([id, bare, padded])];
}

function buildSense(strongs) {
  const id = toStrongId(strongs);
  if (!id) {
    return {
      strongs: null,
      gloss: "Unknown word",
      pron: null,
      rank: null
    };
  }

  const keys = frequencyKeys(id);
  let entry = null;
  let freq = null;
  for (const key of keys) {
    if (!entry && gloss[key]) entry = gloss[key];
    if (!freq) freq = frequency.byStrongs?.[key] || frequency[key] || null;
  }

  return {
    strongs: id,
    lemma: entry?.lemma || null,
    gloss: formatDivineNameEnglish(entry?.gloss || "—"),
    pron: entry?.pron || null,
    rank: freq?.rank ?? null
  };
}

function cleanSegment(s) {
  return String(s || "")
    .replace(/\\/g, "")
    .replace(/׃/g, "")
    .trim();
}

function segmentsFromToken(tahotToken) {
  if (Array.isArray(tahotToken?.segments) && tahotToken.segments.length) {
    return tahotToken.segments.map(cleanSegment).filter(Boolean);
  }
  // Fallback: TAHOT hebrew field uses / between prefix and stem (בְּ/רֵאשִׁ֖ית)
  const hebrew = String(tahotToken?.hebrew || "");
  if (hebrew.includes("/")) {
    return hebrew.split("/").map(cleanSegment).filter(Boolean);
  }
  return [];
}

function buildTokenSense(tahotToken) {
  const segments = segmentsFromToken(tahotToken);
  const prefixes = Array.isArray(tahotToken?.prefixes)
    ? tahotToken.prefixes.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  if (!tahotToken?.strongs) {
    return {
      strongs: null,
      gloss: "Unknown word",
      pron: null,
      rank: null,
      morph: tahotToken?.morph || null,
      segments,
      prefixes,
      translation: tahotToken?.translation || null
    };
  }

  const sense = buildSense(tahotToken.strongs);
  if (tahotToken.translation && sense.gloss === "—") {
    sense.gloss = formatDivineNameEnglish(tahotToken.translation);
  }
  sense.morph = tahotToken.morph || null;
  sense.segments = segments;
  sense.prefixes = prefixes;
  sense.translation = formatDivineNameEnglish(
    tahotToken.translation || sense.gloss || null
  );
  return sense;
}

function surfaceKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\u05D0-\u05EA]/g, "");
}

function findTahotToken(verseRef, { tokenIndex, strongs, word } = {}) {
  const tokens = verseIndex.get(verseRef);
  if (!tokens?.length) return null;

  const id = toStrongId(strongs);
  const key = surfaceKey(word);
  const bySurface = key
    ? tokens.filter((t) => surfaceKey(t.surface) === key)
    : [];

  if (id && bySurface.length) {
    const match = bySurface.find((t) => toStrongId(t.strongs) === id);
    if (match) return match;
  }
  if (bySurface.length === 1) return bySurface[0];
  if (bySurface.length > 1) {
    const withParts = bySurface.find(
      (t) => segmentsFromToken(t).length > 1 || (t.prefixes && t.prefixes.length)
    );
    if (withParts) return withParts;
  }

  return resolveVerseToken(verseRef, tokenIndex);
}

export function initTahotLookup({ glossData, frequencyData }) {
  gloss = glossData || {};
  frequency = frequencyData || {};
  verseIndex.clear();
  loadedBooks.clear();
  buildConsonantalIndex();
}

/** Ranked Torah Strong's list from tahot frequency.json (`ranked`). */
export function getTahotRankedFrequency() {
  return Array.isArray(frequency.ranked) ? frequency.ranked : [];
}

/**
 * Lemmas whose Torah frequency rank is 1…maxRank, most common first.
 * Used as the filler whitelist for a practice story.
 * @param {number} maxRank
 * @returns {{ strongs: string, lemma: string, rank: number }[]}
 */
export function listRankedLemmas(maxRank) {
  const cap = Number(maxRank);
  if (!cap || cap < 1) return [];

  const rows = getTahotRankedFrequency()
    .map((row) => {
      const rank = Number(row?.rank);
      const sense = buildSense(row?.strongs);
      if (!sense.strongs || !rank || rank > cap) return null;
      if (!normalizeSurface(sense.lemma)) return null;
      return {
        strongs: sense.strongs,
        lemma: sense.lemma,
        rank
      };
    })
    .filter(Boolean);

  rows.sort((a, b) => a.rank - b.rank);

  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    if (seen.has(row.strongs)) continue;
    seen.add(row.strongs);
    unique.push(row);
  }
  return unique;
}

/**
 * Best lemma match for a practice-story token, including one prefix letter.
 * @param {string} word
 * @returns {{ strongs: string, lemma: string, rank: number | null } | null}
 */
export function lookupLemmaBySurface(word) {
  const sense = resolveBySurface(word);
  if (!sense?.strongs) return null;
  return {
    strongs: sense.strongs,
    lemma: sense.lemma || "",
    rank: sense.rank ?? null
  };
}

async function loadBook(book, loadJSON) {
  if (loadedBooks.has(book)) return;

  const path = BOOK_FILES[book];
  if (!path) return;

  const data = await loadJSON(path);
  for (const [ref, tokens] of Object.entries(data)) {
    verseIndex.set(ref, tokens);
  }
  loadedBooks.add(book);
}

export async function ensureTahotBooks(verses, loadJSON) {
  const books = [...new Set(verses.map((v) => v.ref?.split(".")[0]).filter(Boolean))];
  await Promise.all(books.map((book) => loadBook(book, loadJSON)));
}

export function attachTahotTokens(verses) {
  return verses.map((verse) => {
    const sefariaTokens = tokenizeHebrewVerse(verse.he);
    const tahotTokens = verseIndex.get(verse.ref) || [];
    const aligned = alignVerseTokens(sefariaTokens, tahotTokens);

    const tokens = aligned.map((entry) => {
      const tahotToken = entry.tahot ?? resolveVerseToken(verse.ref, entry.index);

      return {
        index: entry.index,
        surface: entry.surface,
        aligned: entry.aligned,
        strongs: tahotToken?.strongs || null,
        morph: tahotToken?.morph || null,
        dStrongs: tahotToken?.dStrongs || null,
        segments: segmentsFromToken(tahotToken),
        sense: buildTokenSense(tahotToken)
      };
    });

    return { ...verse, tokens };
  });
}

export function resolveVerseToken(verseRef, tokenIndex) {
  const tokens = verseIndex.get(verseRef);
  if (!tokens) return null;
  return tokens.find((t) => t.index === tokenIndex) || tokens[tokenIndex - 1] || null;
}

export function resolveTahotSense(ctx) {
  const {
    verseRef,
    tokenIndex,
    strongs,
    sense,
    word,
    segments,
    translation
  } = ctx || {};

  const givenSegments = Array.isArray(segments)
    ? segments.map(cleanSegment).filter(Boolean)
    : [];

  if (sense) {
    const next = { ...sense };
    if (givenSegments.length && !next.segments?.length) {
      next.segments = givenSegments;
    }
    if (translation && !next.translation) next.translation = translation;
    return next;
  }

  if (verseRef != null) {
    const token = findTahotToken(verseRef, { tokenIndex, strongs, word });
    if (token?.strongs) {
      const built = buildTokenSense(token);
      if (givenSegments.length && !built.segments?.length) {
        built.segments = givenSegments;
      }
      return built;
    }
  }

  if (strongs) {
    return {
      ...buildSense(strongs),
      morph: null,
      segments: givenSegments,
      prefixes: [],
      translation: translation || null
    };
  }

  const surface = resolveBySurface(word);
  if (surface) {
    return {
      ...surface,
      morph: null,
      segments: givenSegments,
      prefixes: [],
      translation: translation || surface.gloss || null
    };
  }

  return {
    strongs: null,
    gloss: "Unknown word",
    pron: null,
    rank: null,
    morph: null,
    segments: givenSegments,
    prefixes: [],
    translation: translation || null
  };
}

export function lookupTahotSenses(ctx) {
  const resolved = resolveTahotSense(ctx);
  const senses = resolved.strongs ? [resolved] : [{ ...resolved }];
  return { senses };
}
