import { tokenizeHebrewVerse } from "./tokenize.js";
import { alignVerseTokens } from "./tahot-align.js";

let gloss = {};
let frequency = {};
const verseIndex = new Map();
const loadedBooks = new Set();

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

  const entry =
    gloss[String(id)] || gloss[String(id).replace(/^0+/, "")] || null;
  const freq = frequency.byStrongs?.[id] || frequency[id] || null;

  return {
    strongs: id,
    lemma: entry?.lemma || null,
    gloss: entry?.gloss || "—",
    pron: entry?.pron || null,
    rank: freq?.rank ?? null
  };
}

function buildTokenSense(tahotToken) {
  if (!tahotToken?.strongs) {
    return {
      strongs: null,
      gloss: "Unknown word",
      pron: null,
      rank: null
    };
  }

  const sense = buildSense(tahotToken.strongs);
  if (tahotToken.translation && sense.gloss === "—") {
    sense.gloss = tahotToken.translation;
  }
  return sense;
}

export function initTahotLookup({ glossData, frequencyData }) {
  gloss = glossData || {};
  frequency = frequencyData || {};
  verseIndex.clear();
  loadedBooks.clear();
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

    const tokens = aligned.map((entry) => ({
      index: entry.index,
      surface: entry.surface,
      aligned: entry.aligned,
      strongs: entry.tahot?.strongs || null,
      morph: entry.tahot?.morph || null,
      dStrongs: entry.tahot?.dStrongs || null,
      sense: buildTokenSense(entry.tahot)
    }));

    return { ...verse, tokens };
  });
}

export function resolveVerseToken(verseRef, tokenIndex) {
  const tokens = verseIndex.get(verseRef);
  if (!tokens) return null;
  return tokens.find((t) => t.index === tokenIndex) || tokens[tokenIndex - 1] || null;
}

export function resolveTahotSense(ctx) {
  const { word, verseRef, tokenIndex, strongs, sense } = ctx || {};

  if (sense) return sense;

  if (strongs) return buildSense(strongs);

  if (verseRef != null && tokenIndex != null) {
    const token = resolveVerseToken(verseRef, tokenIndex);
    if (token) return buildTokenSense(token);
  }

  return {
    strongs: null,
    gloss: "Unknown word",
    pron: null,
    rank: null
  };
}

export function lookupTahotSenses(ctx) {
  const resolved = resolveTahotSense(ctx);
  const senses = resolved.strongs ? [resolved] : [{ ...resolved }];
  return { senses };
}
