import {
  initLexicon,
  lookupSenses,
  resolveLexiconMode
} from "./core/lexicon.js";
import { resolveStoredDifficulty } from "./core/difficulty.js";
import {
  fetchCalendar,
  fetchAliyahText,
  findParshaItem,
  normalizeVerses,
  getAliyahIndexForToday,
  getAliyahOverrideFromQuery,
  formatAliyahDisplay
} from "./core/sefaria.js";
import {
  initAuth,
  onAuthStateChange,
  isLoggedIn
} from "./core/auth.js";
import {
  getUserDifficulty,
  getUserDiaspora,
  mergeSettingsOnLogin,
  persistUserSettings,
  clearCloudSettings
} from "./core/user-settings.js";
import {
  clearProfileCache,
  loadUserProfile
} from "./core/profile.js";
import { loadWordBank, clearWordBank } from "./core/word-bank.js";
import {
  initRender,
  render,
  showLoading,
  showError,
  updateAliyahInfo,
  setRenderState
} from "./ui/render.js";
import { initSlider, setDifficulty, getCurrentDifficulty } from "./ui/slider.js";
import { initPopupHandlers, showPopup, hidePopup } from "./ui/popup.js";
import { initAuthPanel } from "./ui/auth-panel.js";
import {
  initWordBankPanel,
  showWordBankPanel,
  refreshWordBankPanel
} from "./ui/word-bank-panel.js";

const loadJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return res.json();
};

const MAX_ALIYAH_TABS = 7;
const ALIYAH_TAB_BASE_GAP_MS = 100;
const ALIYAH_TAB_GAP_MULTIPLIER = 1.25;

let isDiaspora = true;
let sliderInitialized = false;
let cachedLexiconData = null;
let loadInFlight = null;
let currentAliyotCount = MAX_ALIYAH_TABS;
let aliyahTabAnimTimers = [];
let sessionAliyahOverride = null;

function clearLegacyAliyahOverride() {
  try {
    localStorage.removeItem("torah-reader:aliyah-override");
  } catch {
    /* ignore */
  }
}

function clearAliyahTabAnimation() {
  aliyahTabAnimTimers.forEach(clearTimeout);
  aliyahTabAnimTimers = [];
}

function getTodayAliyahNumber() {
  return getAliyahIndexForToday() + 1;
}

function getActiveAliyahNumber() {
  const query = getAliyahOverrideFromQuery();
  if (query !== null) return query;

  if (sessionAliyahOverride !== null) return sessionAliyahOverride;

  return getTodayAliyahNumber();
}

function setDiasporaTabsUI(diaspora) {
  document.querySelectorAll("#diasporaTabs .segment-tab").forEach((tab) => {
    const active = tab.dataset.diaspora === String(diaspora);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function initDiasporaToggle() {
  const container = document.getElementById("diasporaTabs");
  if (!container) return;

  setDiasporaTabsUI(isDiaspora);

  container.querySelectorAll(".segment-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      isDiaspora = tab.dataset.diaspora === "true";
      persistUserSettings({ diaspora: isDiaspora });
      setDiasporaTabsUI(isDiaspora);
      hidePopup();
      loadReading();
    });
  });
}

function applyAliyahTabsUI(activeNumber) {
  const resolvedActive =
    activeNumber === undefined ? getActiveAliyahNumber() : activeNumber;

  document.querySelectorAll("#aliyahTabs .segment-tab").forEach((tab) => {
    const number = Number(tab.dataset.aliyah);
    const available = number <= currentAliyotCount;
    const active =
      resolvedActive !== null && available && number === resolvedActive;

    tab.disabled = !available;
    tab.classList.toggle("unavailable", !available);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function clearAliyahTabsHighlight() {
  applyAliyahTabsUI(null);
}

function animateAliyahTabs(targetNumber) {
  clearAliyahTabAnimation();

  const finalNumber = Math.min(
    Math.max(1, targetNumber),
    currentAliyotCount || MAX_ALIYAH_TABS
  );

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    applyAliyahTabsUI(finalNumber);
    return;
  }

  applyAliyahTabsUI(1);

  if (finalNumber <= 1) return;

  let delay = 0;
  let gap = ALIYAH_TAB_BASE_GAP_MS;

  for (let step = 2; step <= finalNumber; step += 1) {
    delay += gap;
    aliyahTabAnimTimers.push(
      setTimeout(() => applyAliyahTabsUI(step), delay)
    );
    gap *= ALIYAH_TAB_GAP_MULTIPLIER;
  }
}

function setAliyahTabsUI(activeNumber = getActiveAliyahNumber(), { animate = false } = {}) {
  if (animate) {
    animateAliyahTabs(activeNumber);
    return;
  }

  clearAliyahTabAnimation();
  applyAliyahTabsUI(activeNumber);
}

function initAliyahTabs() {
  const container = document.getElementById("aliyahTabs");
  if (!container || container.childElementCount) return;

  for (let i = 1; i <= MAX_ALIYAH_TABS; i++) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "segment-tab";
    tab.dataset.aliyah = String(i);
    tab.textContent = String(i);
    tab.setAttribute("role", "tab");
    tab.addEventListener("click", () => {
      if (i > currentAliyotCount) return;

      if (i === getTodayAliyahNumber()) {
        sessionAliyahOverride = null;
      } else {
        sessionAliyahOverride = i;
      }

      hidePopup();
      loadReading();
    });
    container.appendChild(tab);
  }

  clearAliyahTabsHighlight();
}

async function loadReading() {
  if (loadInFlight) return loadInFlight;

  loadInFlight = loadReadingInner().finally(() => {
    loadInFlight = null;
  });

  return loadInFlight;
}

async function loadReadingInner() {
  clearAliyahTabAnimation();
  clearAliyahTabsHighlight();
  showLoading();
  hidePopup();

  try {
    const lexiconMode = resolveLexiconMode();

    if (!cachedLexiconData) {
      const [gloss, wordLookup, frequency, tahotFrequency] = await Promise.all([
        loadJSON("data/gloss.json"),
        loadJSON("data/word-lookup.json"),
        loadJSON("data/lemma-frequency.json"),
        loadJSON("data/tahot/frequency.json")
      ]);
      cachedLexiconData = {
        gloss,
        wordLookup,
        frequency,
        tahotFrequency
      };
    }

    const { wordLookup, gloss, frequency, tahotFrequency } = cachedLexiconData;
    initRender();

    const calendar = await fetchCalendar(isDiaspora);
    const parsha = findParshaItem(calendar);

    if (!parsha?.extraDetails?.aliyot?.length) {
      throw new Error("No weekly Torah portion found for today.");
    }

    const aliyot = parsha.extraDetails.aliyot;
    currentAliyotCount = aliyot.length;

    const aliyahNumber = getActiveAliyahNumber();
    const aliyahIndex = Math.min(aliyahNumber - 1, aliyot.length - 1);
    const aliyahRef = aliyot[aliyahIndex];
    const textData = await fetchAliyahText(aliyahRef);
    let verses = normalizeVerses(textData, aliyahRef);

    verses = await initLexicon({
      mode: lexiconMode,
      legacyData: { wordLookup, gloss, frequency },
      tahotData: {
        gloss,
        frequency: tahotFrequency || { byStrongs: {} }
      },
      verses,
      loadJSON
    });

    if (!verses.length) {
      throw new Error("No verses returned for this aliyah.");
    }

    const title = parsha.displayValue.en;
    updateAliyahInfo(formatAliyahDisplay(aliyahRef));
    setAliyahTabsUI(aliyahNumber, { animate: true });

    const difficulty = sliderInitialized
      ? getCurrentDifficulty()
      : resolveStoredDifficulty(getUserDifficulty(0), 0);

    setRenderState({ title, verses, difficulty });
    render(title, verses, { animate: true });

    if (!sliderInitialized) {
      initSlider(difficulty);
      sliderInitialized = true;
    } else {
      setDifficulty(difficulty, { persist: false, rerender: false });
    }
  } catch (err) {
    showError(
      err.message || "Something went wrong while loading today's reading.",
      loadReading
    );
  }
}

async function applySessionSettings() {
  isDiaspora = getUserDiaspora(true);
  setDiasporaTabsUI(isDiaspora);

  const difficulty = resolveStoredDifficulty(getUserDifficulty(0), 0);

  if (sliderInitialized) {
    setDifficulty(difficulty, { persist: false });
  }

  setAliyahTabsUI(null, { animate: false });
}

async function handleAuthChange(session) {
  if (session) {
    try {
      await loadUserProfile();
      await mergeSettingsOnLogin();
      await loadWordBank();
    } catch {
      /* keep local settings on sync failure */
    }
  } else {
    clearCloudSettings();
    clearWordBank();
    clearProfileCache();
  }

  await applySessionSettings();
  refreshWordBankPanel();
  loadReading();
}

async function bootstrap() {
  clearLegacyAliyahOverride();

  if (new URLSearchParams(window.location.search).get("preview") === "mobile") {
    document.documentElement.classList.add("mobile-preview");
  }

  await initAuth();

  initAuthPanel({
    onOpenWordBank: () => showWordBankPanel()
  });
  initWordBankPanel();

  onAuthStateChange((session, event) => {
    if (event && event !== "SIGNED_IN" && event !== "SIGNED_OUT") {
      return;
    }
    handleAuthChange(session);
  });

  if (isLoggedIn()) {
    try {
      await loadUserProfile();
      await mergeSettingsOnLogin();
      await loadWordBank();
    } catch {
      /* guest fallback */
    }
  }

  isDiaspora = getUserDiaspora(true);

  initDiasporaToggle();
  initAliyahTabs();

  initPopupHandlers((word) => {
    const { senses } = lookupSenses({
      word: word.dataset.word,
      verseRef: word.dataset.verseRef,
      tokenIndex: Number(word.dataset.tokenIndex),
      strongs: word.dataset.strongs
    });
    showPopup({ word: word.dataset.word, senses }, word);
  });

  loadReading();
}

bootstrap();
