import { getSupabase, getUser } from "./auth.js";

let cachedFirstName = null;
let cachedStreak = 0;
let cachedStreakOn = null;

function streakStorageKey(userId) {
  return `bulla-reading-streak:${userId}`;
}

export function toFirstName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

/** Local calendar date YYYY-MM-DD (streak uses the reader’s timezone). */
export function localDateYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateYmd(d);
}

function readLocalStreak(userId) {
  if (!userId) return { streak: 0, on: null };
  try {
    const raw = localStorage.getItem(streakStorageKey(userId));
    if (!raw) return { streak: 0, on: null };
    const parsed = JSON.parse(raw);
    const streak = Math.max(0, Number(parsed?.streak) || 0);
    const on = typeof parsed?.on === "string" ? parsed.on : null;
    return { streak, on };
  } catch {
    return { streak: 0, on: null };
  }
}

function writeLocalStreak(userId, streak, on) {
  if (!userId) return;
  try {
    localStorage.setItem(
      streakStorageKey(userId),
      JSON.stringify({ streak, on })
    );
  } catch {
    /* ignore quota */
  }
}

function setStreakCache(streak, on) {
  cachedStreak = Math.max(0, Number(streak) || 0);
  cachedStreakOn = on || null;
}

function nextStreakState(prevStreak, prevOn, today = localDateYmd()) {
  const streak = Math.max(0, Number(prevStreak) || 0);
  if (prevOn === today) {
    return { streak: Math.max(1, streak), on: today, changed: false };
  }
  if (prevOn === yesterdayYmd()) {
    return { streak: streak + 1, on: today, changed: true };
  }
  return { streak: 1, on: today, changed: true };
}

export async function loadUserProfile() {
  const supabase = getSupabase();
  const user = getUser();

  if (!supabase || !user) {
    cachedFirstName = null;
    setStreakCache(0, null);
    return null;
  }

  const local = readLocalStreak(user.id);

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, reading_streak, reading_streak_on")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Columns may not be migrated yet — keep name query working via fallback.
    const fallback = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    cachedFirstName = toFirstName(fallback.data?.display_name);
    setStreakCache(local.streak, local.on);
    return fallback.data;
  }

  cachedFirstName = toFirstName(data?.display_name);

  const remoteStreak = Math.max(0, Number(data?.reading_streak) || 0);
  const remoteOn =
    typeof data?.reading_streak_on === "string" ? data.reading_streak_on : null;

  // Prefer the farther-along of remote vs local (same device offline / pre-migration).
  let streak = remoteStreak;
  let on = remoteOn;
  if (
    local.on &&
    (!on || local.on > on || (local.on === on && local.streak > streak))
  ) {
    streak = local.streak;
    on = local.on;
  }

  setStreakCache(streak, on);
  writeLocalStreak(user.id, streak, on);
  return data;
}

export async function saveProfileFirstName(firstName) {
  const supabase = getSupabase();
  const user = getUser();
  const name = toFirstName(firstName);

  if (!supabase || !user || !name) return null;

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id)
    .select("display_name")
    .single();

  if (error) throw error;

  cachedFirstName = toFirstName(data?.display_name);
  return data;
}

export function getProfileFirstName(user = getUser()) {
  if (cachedFirstName) return cachedFirstName;

  if (!user) return "";

  const fromMeta =
    user.user_metadata?.first_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name;

  return toFirstName(fromMeta) || toFirstName(user.email?.split("@")[0]) || "";
}

/** True only if they chose a name (not email fallback). Guests → false. */
export function hasChosenDisplayName(user = getUser()) {
  if (cachedFirstName) return true;
  if (!user) return false;

  const fromMeta =
    user.user_metadata?.first_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name;

  return Boolean(toFirstName(fromMeta));
}

export function getReadingStreak() {
  return cachedStreak;
}

export function getReadingStreakOn() {
  return cachedStreakOn;
}

/**
 * Credit today’s reading toward the daily streak (idempotent same day).
 * @returns {{ streak: number, on: string, changed: boolean } | null}
 */
export async function recordReadingStreak() {
  const supabase = getSupabase();
  const user = getUser();
  if (!user) return null;

  const today = localDateYmd();
  const local = readLocalStreak(user.id);
  const prevStreak = cachedStreak || local.streak;
  const prevOn = cachedStreakOn || local.on;
  const next = nextStreakState(prevStreak, prevOn, today);

  setStreakCache(next.streak, next.on);
  writeLocalStreak(user.id, next.streak, next.on);

  if (supabase && next.changed) {
    const { error } = await supabase
      .from("profiles")
      .update({
        reading_streak: next.streak,
        reading_streak_on: next.on
      })
      .eq("id", user.id);
    // Ignore errors when migration isn’t applied yet — local cache still works.
    if (error) {
      /* keep local */
    }
  }

  return next;
}

export function clearProfileCache() {
  cachedFirstName = null;
  setStreakCache(0, null);
}
