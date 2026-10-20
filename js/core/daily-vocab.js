import { listWords } from "./word-bank.js";
import { normalizeStrongs } from "./strongs.js";
import { getSupabase, isLoggedIn } from "./auth.js";

const CACHE_KEY = "torah-reader:vocab-daily";
const PRACTICED_KEY = "torah-reader:vocab-practiced";
const OUTCOMES_KEY = "torah-reader:vocab-outcomes";
const PRACTICE_COUNT = 3;
const CACHE_SOURCE = "groq";

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function getDailyVocabCache() {
  const cache = readJson(CACHE_KEY, null);
  if (!cache || cache.date !== localDateKey()) return null;
  if (cache.source !== CACHE_SOURCE) return null;
  return cache;
}

export function saveDailyVocabCache(cache) {
  writeJson(CACHE_KEY, {
    ...cache,
    date: localDateKey(),
    source: CACHE_SOURCE
  });
}

export function markDailyVocabDismissed() {
  const cache = getDailyVocabCache() || { items: [], completed: [] };
  saveDailyVocabCache({ ...cache, dismissed: true });
}

export function shouldOfferDailyVocab() {
  // Once-per-day gating disabled for now — show on every page load when bank has words.
  return listWords().length > 0;
}

function getPracticedMap() {
  const data = readJson(PRACTICED_KEY, {});
  return data && typeof data === "object" ? data : {};
}

function getOutcomesMap() {
  const data = readJson(OUTCOMES_KEY, {});
  return data && typeof data === "object" ? data : {};
}

function setOutcome(strongs, status) {
  const id = normalizeStrongs(strongs);
  if (!id) return;
  const map = getOutcomesMap();
  map[id] = { status, at: Date.now() };
  writeJson(OUTCOMES_KEY, map);
}

function stampPracticed(strongsList) {
  const map = getPracticedMap();
  const now = Date.now();
  strongsList.forEach((id) => {
    if (id) map[id] = now;
  });
  writeJson(PRACTICED_KEY, map);
}

function pickBankWords(count) {
  const practiced = getPracticedMap();
  const outcomes = getOutcomesMap();
  const sorted = [...listWords()].sort((a, b) => {
    const aId = normalizeStrongs(a.strongs);
    const bId = normalizeStrongs(b.strongs);
    const aStatus = outcomes[aId]?.status || "";
    const bStatus = outcomes[bId]?.status || "";

    const aNeed = aStatus === "need" ? 0 : 1;
    const bNeed = bStatus === "need" ? 0 : 1;
    if (aNeed !== bNeed) return aNeed - bNeed;

    const aGot = aStatus === "got" ? 1 : 0;
    const bGot = bStatus === "got" ? 1 : 0;
    if (aGot !== bGot) return aGot - bGot;

    const aTime = practiced[aId] || 0;
    const bTime = practiced[bId] || 0;
    if (aTime !== bTime) return aTime - bTime;
    return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
  });
  return sorted.slice(0, count);
}

function stripNiqqud(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\u05D0-\u05EA]/g, "");
}

async function readFunctionError(error) {
  if (!error) return "Could not generate practice sentences.";

  try {
    const context = error.context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      if (body?.code === "NO_API_KEY") {
        return "Practice is not configured yet (missing Groq API key on the server).";
      }
      if (body?.error) {
        return body.detail
          ? `${body.error}: ${String(body.detail).slice(0, 200)}`
          : body.error;
      }
    }
    if (context && typeof context.text === "function") {
      const text = await context.text();
      if (text) return text.slice(0, 300);
    }
  } catch {
    /* fall through */
  }

  return error.message || "Could not generate practice sentences.";
}

async function generateSentences(words) {
  const supabase = getSupabase();
  if (!supabase || !isLoggedIn()) {
    throw new Error("Sign in to load vocabulary practice.");
  }

  const { data, error } = await supabase.functions.invoke("daily-vocab", {
    body: {
      words: words.map((w) => ({
        strongs: normalizeStrongs(w.strongs),
        lemma: w.lemma || "",
        gloss: w.gloss || "",
        surface_example: w.surface_example || w.surfaceExample || ""
      }))
    }
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  if (data?.error) {
    if (data.code === "NO_API_KEY") {
      throw new Error(
        "Practice is not configured yet (missing Groq API key on the server)."
      );
    }
    throw new Error(
      data.detail
        ? `${data.error}: ${String(data.detail).slice(0, 200)}`
        : data.error || "Could not generate practice sentences."
    );
  }

  const sentences = Array.isArray(data?.sentences) ? data.sentences : [];
  if (!sentences.length) {
    throw new Error("No practice sentences returned.");
  }

  return sentences;
}

/**
 * Build practice payload via Groq (Supabase Edge Function).
 * @returns {Promise<null | { items: Array, completed: string[] }>}
 */
export async function loadDailyVocabPractice() {
  // Fresh generation each page load while once-per-day is disabled.
  const selected = pickBankWords(PRACTICE_COUNT);
  if (!selected.length) return null;

  const sentences = await generateSentences(selected);
  const byStrongs = new Map(
    sentences.map((s) => [normalizeStrongs(s.strongs), s])
  );

  const items = selected
    .map((word, index) => {
      const strongs = normalizeStrongs(word.strongs);
      const generated =
        byStrongs.get(strongs) ||
        sentences[index] ||
        null;
      if (!generated?.he) return null;

      return {
        strongs,
        lemma: word.lemma || "",
        gloss: word.gloss || "",
        displayRef: word.lemma || word.gloss || `Word ${index + 1}`,
        he: String(generated.he).trim(),
        en: String(generated.en || "").trim(),
        label: index + 1,
        targetSurface: String(generated.target_surface || "").trim(),
        targetSurfacePlain: stripNiqqud(generated.target_surface || ""),
        tokens: []
      };
    })
    .filter(Boolean);

  if (!items.length) return null;

  stampPracticed(items.map((item) => item.strongs));

  const cache = {
    date: localDateKey(),
    source: CACHE_SOURCE,
    items,
    completed: [],
    dismissed: false
  };
  saveDailyVocabCache(cache);
  return cache;
}

export function markVerseComplete(strongs) {
  const id = normalizeStrongs(strongs);
  const cache = getDailyVocabCache();
  if (!cache || !id) return cache;

  setOutcome(id, "got");
  stampPracticed([id]);

  const completed = new Set(cache.completed || []);
  completed.add(id);
  const next = {
    ...cache,
    dismissed: false,
    completed: [...completed]
  };
  saveDailyVocabCache(next);
  return next;
}

export function markNeedsPractice(strongs) {
  const id = normalizeStrongs(strongs);
  const cache = getDailyVocabCache();
  if (!cache || !id) return cache;

  setOutcome(id, "need");
  stampPracticed([id]);

  const completed = new Set(cache.completed || []);
  completed.delete(id);
  const next = {
    ...cache,
    dismissed: false,
    completed: [...completed]
  };
  saveDailyVocabCache(next);
  return next;
}

export function unmarkVerseComplete(strongs) {
  const id = normalizeStrongs(strongs);
  const cache = getDailyVocabCache();
  if (!cache || !id) return cache;

  const completed = new Set(cache.completed || []);
  completed.delete(id);
  const next = {
    ...cache,
    dismissed: false,
    completed: [...completed]
  };
  saveDailyVocabCache(next);
  return next;
}

export function toggleVerseComplete(strongs) {
  const id = normalizeStrongs(strongs);
  const cache = getDailyVocabCache();
  if (!cache || !id) return cache;
  const completed = new Set(cache.completed || []);
  return completed.has(id) ? unmarkVerseComplete(id) : markVerseComplete(id);
}

/** Same order as daily practice: needs-work first, then least recently practiced. */
export function selectPracticeWords(count) {
  return pickBankWords(count);
}

export { stripNiqqud };
