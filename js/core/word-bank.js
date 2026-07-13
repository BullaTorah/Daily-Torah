import { getSupabase, getUser, isLoggedIn } from "./auth.js";
import { normalizeStrongs } from "./strongs.js";

const savedIds = new Set();
let words = [];

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

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener(words);
    } catch {
      /* ignore */
    }
  });
}

export function onWordBankChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listWords() {
  return words;
}

export function isWordSaved(strongs) {
  const id = normalizeStrongs(strongs);
  return id ? savedIds.has(id) : false;
}

export async function loadWordBank() {
  if (!isLoggedIn()) {
    words = [];
    syncSavedIds();
    notifyListeners();
    return words;
  }

  const supabase = getSupabase();
  const user = getUser();

  if (!supabase || !user) {
    words = [];
    syncSavedIds();
    notifyListeners();
    return words;
  }

  const { data, error } = await supabase
    .from("word_bank_items")
    .select("id, strongs, lemma, gloss, surface_example, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (error) throw error;

  words = sortWords(data || []);
  syncSavedIds();
  notifyListeners();
  return words;
}

export function clearWordBank() {
  words = [];
  syncSavedIds();
  notifyListeners();
}

export async function addWord({ strongs, lemma, gloss, surfaceExample }) {
  const id = normalizeStrongs(strongs);

  if (!id) {
    throw new Error("Cannot save word without a Strong's number.");
  }

  if (!isLoggedIn()) {
    throw new Error("Sign in to save words to your word bank.");
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
    .select("id, strongs, lemma, gloss, surface_example, added_at")
    .single();

  if (error) throw error;

  words = sortWords([data, ...words]);
  syncSavedIds();
  notifyListeners();
  return data;
}

export async function removeWord(strongsOrId) {
  const id = normalizeStrongs(strongsOrId);

  if (!id || !isLoggedIn()) return false;

  const supabase = getSupabase();
  const user = getUser();
  const existing = words.find((item) => normalizeStrongs(item.strongs) === id);

  const { error } = await supabase
    .from("word_bank_items")
    .delete()
    .eq("user_id", user.id)
    .eq("strongs", id);

  if (error) throw error;

  words = words.filter((item) => normalizeStrongs(item.strongs) !== id);
  if (existing?.id) {
    /* row removed */
  }
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
