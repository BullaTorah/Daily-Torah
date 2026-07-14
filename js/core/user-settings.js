import {
  getStoredDifficulty,
  setStoredDifficulty,
  getStoredDiaspora,
  setStoredDiaspora,
  getStoredLexiconMode,
  setStoredLexiconMode
} from "./storage.js";
import { getSupabase, getUser, isLoggedIn } from "./auth.js";

const DEFAULTS = {
  difficulty: 0,
  diaspora: true,
  lexicon_mode: "tahot"
};

let cloudSettings = null;
let saveTimer = null;
const DEBOUNCE_MS = 500;

function readLocalSettings() {
  return {
    difficulty: getStoredDifficulty(DEFAULTS.difficulty),
    diaspora: getStoredDiaspora(DEFAULTS.diaspora),
    lexicon_mode: getStoredLexiconMode(DEFAULTS.lexicon_mode)
  };
}

function writeLocalSettings(settings) {
  setStoredDifficulty(settings.difficulty);
  setStoredDiaspora(settings.diaspora);
  setStoredLexiconMode(settings.lexicon_mode);
}

function isDefaultSettings(settings) {
  return (
    settings.difficulty === DEFAULTS.difficulty &&
    settings.diaspora === DEFAULTS.diaspora &&
    settings.lexicon_mode === DEFAULTS.lexicon_mode
  );
}

function hasNonDefaultLocal(local) {
  return !isDefaultSettings(local);
}

function normalizeCloudRow(row) {
  if (!row) return { ...DEFAULTS };

  return {
    difficulty: Number(row.difficulty) || 0,
    diaspora: Boolean(row.diaspora),
    lexicon_mode: row.lexicon_mode === "legacy" ? "legacy" : "tahot"
  };
}

function getEffectiveSettings() {
  if (isLoggedIn() && cloudSettings) {
    return { ...cloudSettings };
  }

  return readLocalSettings();
}

export function getUserDifficulty(defaultValue = DEFAULTS.difficulty) {
  const value = getEffectiveSettings().difficulty;
  return Number.isFinite(value) ? value : defaultValue;
}

export function getUserDiaspora(defaultValue = DEFAULTS.diaspora) {
  return getEffectiveSettings().diaspora ?? defaultValue;
}

export function getUserLexiconMode(defaultValue = DEFAULTS.lexicon_mode) {
  const mode = getEffectiveSettings().lexicon_mode;
  return mode === "legacy" ? "legacy" : defaultValue;
}

async function upsertCloudSettings(settings) {
  const supabase = getSupabase();
  const user = getUser();

  if (!supabase || !user) return;

  const payload = {
    user_id: user.id,
    difficulty: settings.difficulty,
    diaspora: settings.diaspora,
    lexicon_mode: settings.lexicon_mode,
    aliyah_override: null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("user_settings").upsert(payload);

  if (error) throw error;

  cloudSettings = { ...settings };
}

function scheduleCloudSave() {
  if (!isLoggedIn()) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const settings = readLocalSettings();
    upsertCloudSettings(settings).catch(() => {
      /* ignore transient network errors */
    });
  }, DEBOUNCE_MS);
}

export function persistUserSettings(patch = {}) {
  const { aliyah_override: _ignored, ...rest } = patch;
  const current = readLocalSettings();
  const next = { ...current, ...rest };

  writeLocalSettings(next);

  if (isLoggedIn()) {
    cloudSettings = { ...next };
    scheduleCloudSave();
  }
}

export async function mergeSettingsOnLogin() {
  const supabase = getSupabase();
  const user = getUser();

  if (!supabase || !user) {
    cloudSettings = null;
    return readLocalSettings();
  }

  const local = readLocalSettings();

  const { data, error } = await supabase
    .from("user_settings")
    .select("difficulty, diaspora, lexicon_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  const cloud = normalizeCloudRow(data);

  if (isDefaultSettings(cloud) && hasNonDefaultLocal(local)) {
    await upsertCloudSettings(local);
    writeLocalSettings(local);
    return local;
  }

  writeLocalSettings(cloud);
  cloudSettings = cloud;
  return cloud;
}

export function clearCloudSettings() {
  cloudSettings = null;
  clearTimeout(saveTimer);
  saveTimer = null;
}
