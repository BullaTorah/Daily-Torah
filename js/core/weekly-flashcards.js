import { isLoggedIn } from "./auth.js";
import { normalizeStrongs } from "./strongs.js";
import { getTahotRankedFrequency } from "./lookup-tahot.js";
import { resolveWord } from "./lexicon.js";
import {
  isWordLearned,
  markWordLearned,
  onLearnedWordsChange
} from "./word-bank.js";

const STORAGE_KEY = "torah-reader:weekly-flashcards";
export const WEEKLY_SET_SIZE = 10;

function strongsKey(value) {
  const id = normalizeStrongs(value);
  if (!id) return "";
  return id.replace(/^0+/, "") || "0";
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.strongs)) return null;
    return {
      strongs: data.strongs.map(strongsKey).filter(Boolean),
      knownInSet: Array.isArray(data.knownInSet)
        ? data.knownInSet.map(strongsKey).filter(Boolean)
        : [],
      setIndex: Math.max(1, Number(data.setIndex) || 1)
    };
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        strongs: state.strongs,
        knownInSet: state.knownInSet,
        setIndex: state.setIndex
      })
    );
  } catch {
    /* ignore quota */
  }
}

function entryFromStrongs(strongs) {
  const id = strongsKey(strongs);
  if (!id) return null;
  const sense = resolveWord({ strongs: id });
  const lemma = String(sense?.lemma || "").trim();
  if (!isRealLemma(lemma)) return null;
  const gloss = String(sense?.gloss || "").trim();
  const ranked = getTahotRankedFrequency().find(
    (row) => strongsKey(row?.strongs) === id
  );
  return {
    strongs: id,
    lemma,
    gloss: gloss && gloss !== "—" && gloss !== "-" ? gloss : "",
    rank: ranked?.rank != null ? Number(ranked.rank) : sense?.rank ?? null
  };
}

function isRealLemma(lemma) {
  const text = String(lemma || "").trim();
  if (!text) return false;
  if (/^[—–−\-‐]+$/.test(text)) return false;
  // Need at least one Hebrew letter
  return /[\u05D0-\u05EA]/.test(text);
}

/** Next N most-common Torah lemmas not yet in Known words. */
export function pickNextWeeklyStrongs(count = WEEKLY_SET_SIZE, exclude = []) {
  const ranked = getTahotRankedFrequency();
  if (!ranked.length) return [];

  const blocked = new Set((exclude || []).map(strongsKey).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const row of ranked) {
    const id = strongsKey(row?.strongs);
    if (!id || seen.has(id) || blocked.has(id)) continue;
    if (isWordLearned(id)) continue;
    if (!entryFromStrongs(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= count) break;
  }
  return out;
}

export function getWeeklyFlashState() {
  return readState();
}

/** Home / overlay label: first set vs later sets. */
export function getWeeklyFlashLabel() {
  // Guests haven't started a saved set — always the first batch.
  if (!isLoggedIn()) return "First 10 words";
  const state = readState();
  const setIndex = Math.max(1, Number(state?.setIndex) || 1);
  return setIndex <= 1 ? "First 10 words" : "Next 10 words";
}

/**
 * Ensure a set exists. The practice deck is the next unknown words only
 * (already-Known Strong's are skipped). Syncs knownInSet with the real list.
 * @returns {{ strongs: string[], knownInSet: string[], setIndex: number, complete: boolean, cards: object[] }}
 */
export function ensureWeeklyFlashSet() {
  let state = readState();
  if (!state?.strongs?.length) {
    const strongs = pickNextWeeklyStrongs(WEEKLY_SET_SIZE);
    state = {
      strongs,
      knownInSet: [],
      setIndex: 1
    };
    writeState(state);
  } else {
    // Keep assigned set, drop unusable ids, sync which are already Known
    const strongs = state.strongs.filter((id) => entryFromStrongs(id));
    const knownInSet = [
      ...new Set([
        ...state.knownInSet.filter((id) => strongs.includes(id)),
        ...strongs.filter((id) => isWordLearned(id))
      ])
    ];
    state = { ...state, strongs, knownInSet };
    writeState(state);
  }

  // Practice only words not yet Known — skip ones marked known already
  const cards = state.strongs
    .filter((id) => !isWordLearned(id))
    .map((id) => {
      const entry = entryFromStrongs(id);
      if (!entry) return null;
      return {
        ...entry,
        known: false
      };
    })
    .filter(Boolean);

  const knownCount = state.strongs.filter((id) => isWordLearned(id)).length;
  const complete =
    state.strongs.length > 0 && cards.length === 0;

  return {
    ...state,
    cards,
    complete,
    knownCount
  };
}

export function isWeeklySetComplete() {
  return ensureWeeklyFlashSet().complete;
}

export async function markWeeklyCardKnown(strongs) {
  if (!isLoggedIn()) {
    throw new Error("Sign in to save Known words.");
  }
  const id = strongsKey(strongs);
  if (!id) return ensureWeeklyFlashSet();

  const entry = entryFromStrongs(id);
  await markWordLearned({
    strongs: id,
    lemma: entry?.lemma || null,
    gloss: entry?.gloss || null,
    surfaceExample: entry?.lemma || null
  });

  const state = readState() || {
    strongs: [],
    knownInSet: [],
    setIndex: 1
  };
  if (!state.knownInSet.includes(id)) {
    state.knownInSet = [...state.knownInSet, id];
    writeState(state);
  }
  return ensureWeeklyFlashSet();
}

/** Advance only when the current set is fully known. */
export function advanceWeeklyFlashSet() {
  const current = ensureWeeklyFlashSet();
  if (!current.complete) {
    throw new Error("Finish this set of 10 before opening the next.");
  }

  const strongs = pickNextWeeklyStrongs(WEEKLY_SET_SIZE);
  if (!strongs.length) {
    return { ...current, exhausted: true };
  }

  const next = {
    strongs,
    knownInSet: strongs.filter((id) => isWordLearned(id)),
    setIndex: current.setIndex + 1
  };
  writeState(next);
  return { ...ensureWeeklyFlashSet(), exhausted: false };
}

export function onWeeklyFlashChange(listener) {
  return onLearnedWordsChange(listener);
}
