import { getSupabase, getUser, isLoggedIn } from "./auth.js";
import { normalizeStrongs } from "./strongs.js";
import { PLACEMENT_KNOWN_SEED_MAX_RANK } from "./difficulty.js";

const savedIds = new Set();
const learnedIds = new Set();
let words = [];
let learnedLoaded = false;

function sortWords(list) {
  return [...list].sort(
    (a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
  );
}

function syncSavedIds() {
  savedIds.clear();
  words.forEach((item) => {
    const id = normalizeStrongs(item.strongs);
    if (id) savedIds.add(id);
  });
}

const listeners = new Set();
const learnedListeners = new Set();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener(words);
    } catch {
      /* ignore */
    }
  });
}

function notifyLearnedListeners() {
  learnedListeners.forEach((listener) => {
    try {
      listener(learnedIds.size);
    } catch {
      /* ignore */
    }
  });
}

export function onWordBankChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onLearnedWordsChange(listener) {
  learnedListeners.add(listener);
  return () => learnedListeners.delete(listener);
}

export function listWords() {
  return words;
}

export function isWordSaved(strongs) {
  const id = normalizeStrongs(strongs);
  return id ? savedIds.has(id) : false;
}

export function isWordLearned(strongs) {
  const id = normalizeStrongs(strongs);
  return id ? learnedIds.has(id) : false;
}

export async function loadWordBank() {
  if (!isLoggedIn()) {
    words = [];
    learnedIds.clear();
    learnedLoaded = false;
    syncSavedIds();
    notifyListeners();
    notifyLearnedListeners();
    return words;
  }

  const supabase = getSupabase();
  const user = getUser();

  if (!supabase || !user) {
    words = [];
    learnedIds.clear();
    learnedLoaded = false;
    syncSavedIds();
    notifyListeners();
    notifyLearnedListeners();
    return words;
  }

  const [bankRes, learnedRes] = await Promise.all([
    supabase
      .from("word_bank_items")
      .select("id, strongs, lemma, gloss, surface_example, added_at, got_it_count")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false }),
    supabase.from("learned_words").select("strongs").eq("user_id", user.id)
  ]);

  if (bankRes.error) throw bankRes.error;
  if (learnedRes.error) throw learnedRes.error;

  words = sortWords(bankRes.data || []);
  syncSavedIds();

  learnedIds.clear();
  (learnedRes.data || []).forEach((row) => {
    const id = normalizeStrongs(row.strongs);
    if (id) learnedIds.add(id);
  });
  learnedLoaded = true;
  notifyListeners();
  notifyLearnedListeners();
  return words;
}

export function clearWordBank() {
  words = [];
  learnedIds.clear();
  learnedLoaded = false;
  syncSavedIds();
  notifyListeners();
  notifyLearnedListeners();
}

/** Remove a Strong's from learned_words (and local cache). */
export async function removeLearnedWord(strongsOrId) {
  const id = normalizeStrongs(strongsOrId);
  if (!id || !isLoggedIn()) return false;
  if (!learnedIds.has(id)) return false;

  const supabase = getSupabase();
  const user = getUser();
  if (!supabase || !user) return false;

  const { error } = await supabase
    .from("learned_words")
    .delete()
    .eq("user_id", user.id)
    .eq("strongs", id);

  if (error) throw error;

  learnedIds.delete(id);
  learnedLoaded = true;
  notifyLearnedListeners();
  return true;
}

export async function addWord({ strongs, lemma, gloss, surfaceExample }) {
  const id = normalizeStrongs(strongs);

  if (!id) {
    throw new Error("Cannot save word without a Strong's number.");
  }

  if (!isLoggedIn()) {
    throw new Error("Sign in to save words to your Practice words.");
  }

  if (isWordSaved(id)) {
    return words.find((item) => normalizeStrongs(item.strongs) === id) || null;
  }

  const supabase = getSupabase();
  const user = getUser();

  const { data, error } = await supabase
    .from("word_bank_items")
    .insert({
      user_id: user.id,
      strongs: id,
      lemma: lemma || null,
      gloss: gloss || null,
      surface_example: surfaceExample || null
    })
    .select("id, strongs, lemma, gloss, surface_example, added_at, got_it_count")
    .single();

  if (error) throw error;

  words = sortWords([data, ...words]);
  syncSavedIds();
  notifyListeners();

  // Mutual exclusion: wordlist and Known Words never share a Strong's
  await removeLearnedWord(id);

  return data;
}

const WORD_BANK_INSERT_CHUNK = 100;

/** Bulk insert practice-list words. Skips already-saved ids. Removes from Known Words. */
export async function addWords(entries = []) {
  if (!isLoggedIn()) return 0;

  const supabase = getSupabase();
  const user = getUser();
  if (!supabase || !user) return 0;

  const rows = [];
  const seen = new Set();
  const toUnlearn = [];

  for (const entry of entries) {
    const id = normalizeStrongs(entry?.strongs);
    if (!id || seen.has(id) || isWordSaved(id)) continue;
    seen.add(id);
    rows.push({
      user_id: user.id,
      strongs: id,
      lemma: entry?.lemma || null,
      gloss: entry?.gloss || null,
      surface_example: entry?.surfaceExample || entry?.surface_example || null
    });
    if (isWordLearned(id)) toUnlearn.push(id);
  }

  if (!rows.length) return 0;

  const inserted = [];
  for (let i = 0; i < rows.length; i += WORD_BANK_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + WORD_BANK_INSERT_CHUNK);
    const { data, error } = await supabase
      .from("word_bank_items")
      .insert(chunk)
      .select(WORD_BANK_SELECT);
    if (error) throw error;
    if (Array.isArray(data)) inserted.push(...data);
  }

  words = sortWords([...inserted, ...words]);
  syncSavedIds();
  notifyListeners();

  for (const id of toUnlearn) {
    await removeLearnedWord(id);
  }

  return inserted.length;
}

const WORD_BANK_SELECT =
  "id, strongs, lemma, gloss, surface_example, added_at, got_it_count";

function replaceLocalWord(row) {
  if (!row) return;
  const id = normalizeStrongs(row.strongs);
  words = sortWords([
    row,
    ...words.filter((item) => normalizeStrongs(item.strongs) !== id)
  ]);
  syncSavedIds();
  notifyListeners();
}

/** Increment Got-it count for a bank word. Returns updated row or null. */
export async function recordGotIt(strongs) {
  const id = normalizeStrongs(strongs);
  if (!id || !isLoggedIn()) return null;

  const existing = words.find((item) => normalizeStrongs(item.strongs) === id);
  if (!existing) return null;

  const supabase = getSupabase();
  const user = getUser();
  const nextCount = (Number(existing.got_it_count) || 0) + 1;

  const { data, error } = await supabase
    .from("word_bank_items")
    .update({ got_it_count: nextCount })
    .eq("user_id", user.id)
    .eq("strongs", id)
    .select(WORD_BANK_SELECT)
    .single();

  if (error) throw error;

  replaceLocalWord(data);
  return data;
}

/** Count rows in learned_words for the signed-in user. */
export async function countLearnedWords() {
  if (!isLoggedIn()) return 0;
  if (learnedLoaded) return learnedIds.size;

  const supabase = getSupabase();
  const user = getUser();
  if (!supabase || !user) return 0;

  const { count, error } = await supabase
    .from("learned_words")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) throw error;
  return Number(count) || 0;
}

/** Persist a word as learned (idempotent upsert). Removes from wordlist. */
export async function markWordLearned({
  strongs,
  lemma,
  gloss,
  surfaceExample
} = {}) {
  const id = normalizeStrongs(strongs);
  if (!id || !isLoggedIn()) return null;

  const supabase = getSupabase();
  const user = getUser();
  const fromBank = words.find((item) => normalizeStrongs(item.strongs) === id);

  const { data, error } = await supabase
    .from("learned_words")
    .upsert(
      {
        user_id: user.id,
        strongs: id,
        lemma: lemma || fromBank?.lemma || null,
        gloss: gloss || fromBank?.gloss || null,
        surface_example:
          surfaceExample || fromBank?.surface_example || null,
        learned_at: new Date().toISOString()
      },
      { onConflict: "user_id,strongs" }
    )
    .select("id, strongs, lemma, gloss, surface_example, learned_at")
    .single();

  if (error) throw error;

  learnedIds.add(id);
  learnedLoaded = true;
  notifyLearnedListeners();

  if (isWordSaved(id)) {
    await removeWord(id);
  }

  return data;
}

const LEARNED_UPSERT_CHUNK = 400;

/**
 * Bulk upsert learned words. Returns rows written.
 * @param {object[]} entries
 * @param {{ moveFromBank?: boolean }} [options] When moveFromBank, bank items are
 *   promoted to Known Words (removed from the practice list). Otherwise bank ids are skipped.
 */
export async function markWordsLearned(entries = [], options = {}) {
  if (!isLoggedIn()) return 0;

  const supabase = getSupabase();
  const user = getUser();
  if (!supabase || !user) return 0;

  const moveFromBank = Boolean(options?.moveFromBank);
  const now = new Date().toISOString();
  const rows = [];
  const seen = new Set();
  const bankIdsToRemove = [];

  for (const entry of entries) {
    const id = normalizeStrongs(entry?.strongs);
    if (!id || seen.has(id)) continue;
    const onBank = isWordSaved(id);
    // Never put the same Strong's in both lists unless explicitly moving
    if (onBank && !moveFromBank) continue;
    // Already known and not promoting from bank — nothing to do
    if (isWordLearned(id) && !onBank) continue;
    if (onBank && moveFromBank) bankIdsToRemove.push(id);
    seen.add(id);
    const fromBank = words.find((item) => normalizeStrongs(item.strongs) === id);
    rows.push({
      user_id: user.id,
      strongs: id,
      lemma: entry?.lemma || fromBank?.lemma || null,
      gloss: entry?.gloss || fromBank?.gloss || null,
      surface_example:
        entry?.surfaceExample ||
        entry?.surface_example ||
        fromBank?.surface_example ||
        null,
      learned_at: now
    });
  }

  if (!rows.length) return 0;

  for (let i = 0; i < rows.length; i += LEARNED_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + LEARNED_UPSERT_CHUNK);
    const { error } = await supabase
      .from("learned_words")
      .upsert(chunk, { onConflict: "user_id,strongs" });
    if (error) throw error;
  }

  rows.forEach((row) => learnedIds.add(row.strongs));
  learnedLoaded = true;
  notifyLearnedListeners();

  for (const id of bankIdsToRemove) {
    await removeWord(id);
  }

  return rows.length;
}

/**
 * Delete all Known Words for the signed-in user. Returns how many were cleared.
 */
export async function clearLearnedWords() {
  if (!isLoggedIn()) return 0;

  const supabase = getSupabase();
  const user = getUser();
  if (!supabase || !user) return 0;

  const before = learnedIds.size;

  const { error } = await supabase
    .from("learned_words")
    .delete()
    .eq("user_id", user.id);

  if (error) throw error;

  learnedIds.clear();
  learnedLoaded = true;
  notifyLearnedListeners();
  return before;
}

/**
 * After Find my level only: mark Torah Strong's with rank ≤ placed level as known.
 * Beginner (0) seeds nothing. Advanced caps at Reader so an 8-question quiz
 * cannot grant the entire Torah vocabulary.
 * Skips anything already on the wordlist.
 * @param {number} levelValue difficulty cutoff (200, 500, or 999999)
 * @param {{ strongs: string, rank: number }[]} rankedFrequency tahot frequency.ranked
 */
export async function seedKnownWordsForLevel(levelValue, rankedFrequency = []) {
  const level = Number(levelValue) || 0;
  if (level <= 0 || !isLoggedIn()) return 0;

  const seedRank = Math.min(level, PLACEMENT_KNOWN_SEED_MAX_RANK);
  const ranked = Array.isArray(rankedFrequency) ? rankedFrequency : [];
  const entries = ranked.filter(
    (row) => Number(row?.rank) > 0 && Number(row.rank) <= seedRank
  );

  return markWordsLearned(
    entries.map((row) => ({ strongs: row.strongs }))
  );
}

export async function removeWord(strongsOrId) {
  const id = normalizeStrongs(strongsOrId);

  if (!id || !isLoggedIn()) return false;

  const supabase = getSupabase();
  const user = getUser();

  const { error } = await supabase
    .from("word_bank_items")
    .delete()
    .eq("user_id", user.id)
    .eq("strongs", id);

  if (error) throw error;

  words = words.filter((item) => normalizeStrongs(item.strongs) !== id);
  syncSavedIds();
  notifyListeners();
  return true;
}

export async function toggleWord(entry) {
  const id = normalizeStrongs(entry?.strongs);

  if (!id) return false;

  if (isWordSaved(id)) {
    await removeWord(id);
    return false;
  }

  await addWord(entry);
  return true;
}
