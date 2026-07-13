const KEYS = {
  difficulty: "torah-reader:difficulty",
  diaspora: "torah-reader:diaspora",
  aliyahOverride: "torah-reader:aliyah-override",
  lexiconMode: "torah-reader:lexicon"
};

export function getStoredDifficulty(defaultValue = 0) {
  try {
    const raw = localStorage.getItem(KEYS.difficulty);
    if (raw === null) return defaultValue;
    const value = Number(raw);
    return Number.isFinite(value) ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStoredDifficulty(value) {
  try {
    localStorage.setItem(KEYS.difficulty, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getStoredDiaspora(defaultValue = true) {
  try {
    const raw = localStorage.getItem(KEYS.diaspora);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

export function setStoredDiaspora(isDiaspora) {
  try {
    localStorage.setItem(KEYS.diaspora, isDiaspora ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getStoredAliyahOverride() {
  try {
    const raw = localStorage.getItem(KEYS.aliyahOverride);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1) return null;
    return value;
  } catch {
    return null;
  }
}

export function setStoredAliyahOverride(aliyahNumber) {
  try {
    if (aliyahNumber === null || aliyahNumber === undefined) {
      localStorage.removeItem(KEYS.aliyahOverride);
    } else {
      localStorage.setItem(KEYS.aliyahOverride, String(aliyahNumber));
    }
  } catch {
    /* ignore */
  }
}

export function getStoredLexiconMode(defaultValue = "tahot") {
  try {
    const raw = localStorage.getItem(KEYS.lexiconMode);
    if (raw === "legacy" || raw === "tahot") return raw;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStoredLexiconMode(mode) {
  try {
    if (mode === "legacy" || mode === "tahot") {
      localStorage.setItem(KEYS.lexiconMode, mode);
    }
  } catch {
    /* ignore */
  }
}
