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
import { loadWordBank, clearWordBank, seedKnownWordsForLevel } from "./core/word-bank.js";
import { getTahotRankedFrequency } from "./core/lookup-tahot.js";
import {
  loadDailyVocabPractice,
  shouldOfferDailyVocab
} from "./core/daily-vocab.js";
import { loadPracticeStory } from "./core/practice-story.js";
import {
  initRender,
  render,
  showLoading,
  showError,
  updateAliyahInfo,
  setRenderState
} from "./ui/render.js";
import {
  initSlider,
  setDifficulty,
  getCurrentDifficulty,
  animateDifficultyTabs
} from "./ui/slider.js";
import { initPopupHandlers, showPopup, hidePopup } from "./ui/popup.js";
import { initAuthPanel } from "./ui/auth-panel.js";
import {
  initWordBankPanel,
  showWordBankPanel,
  refreshWordBankPanel
} from "./ui/word-bank-panel.js";
import {
  initDailyVocabOverlay,
  showDailyVocabLoading,
  showDailyVocabOverlay,
  showDailyVocabError,
  hideDailyVocabOverlay
} from "./ui/daily-vocab-overlay.js";
import {
  initPracticeStoryOverlay,
  startPracticeStory,
  hidePracticeStoryOverlay
} from "./ui/practice-story-overlay.js";
import {
  initWeeklyFlashOverlay,
  openWeeklyFlashOverlay
} from "./ui/weekly-flash-overlay.js";
import {
  initHomeOverlay,
  isHomeOpen,
  setHomeReadingReady,
  refreshHomeOverlay,
  showHomeOverlay,
  scheduleDifficultyProgressEntrance,
  startReadingFromHome
} from "./ui/home.js";
import {
  initReadingFeedback,
  resetReadingFeedback
} from "./ui/reading-feedback.js";
import {
  initPlacementCatalog,
  markPlacementDone
} from "./core/placement.js";
import { initTheme } from "./core/theme.js";
import {
  initPlacementOverlay,
  openPlacementOverlay
} from "./ui/placement-overlay.js";
import { initWalkthroughOverlay } from "./ui/walkthrough-overlay.js";

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
let dailyVocabOfferedThisSession = false;
let fullVerses = [];
let currentTitle = "";
let readingMode = "aliyah";
let readingReady = false;
let readingReadyResolvers = [];
let readingLoadGeneration = 0;

function markReadingReady(ready) {
  readingReady = ready;
  setHomeReadingReady(ready);
  if (ready) {
    const waiters = readingReadyResolvers;
    readingReadyResolvers = [];
    waiters.forEach((resolve) => resolve());
  }
}

function waitUntilReadingReady() {
  if (readingReady) return Promise.resolve();
  return new Promise((resolve) => {
    readingReadyResolvers.push(resolve);
  });
}

function applyDisplayedVerses({ animate = false, animateDelay = 0 } = {}) {
  if (!fullVerses.length) return { entranceEndMs: 0 };
  const verses =
    readingMode === "three" ? fullVerses.slice(0, 3) : fullVerses;
  const difficulty = sliderInitialized
    ? getCurrentDifficulty()
    : resolveStoredDifficulty(getUserDifficulty(0), 0);
  setRenderState({ title: currentTitle, verses, difficulty });
  const result = render(currentTitle, verses, { animate, animateDelay });
  resetReadingFeedback();
  return result || { entranceEndMs: 0 };
}

async function revealReading(mode) {
  readingMode = mode === "three" ? "three" : "aliyah";
  const aliyahMs = setAliyahTabsUI(getActiveAliyahNumber(), { animate: true });
  const difficultyMs = animateDifficultyTabs(getCurrentDifficulty());
  const headerMs = Math.max(aliyahMs, difficultyMs);
  const { entranceEndMs } = applyDisplayedVerses({
    animate: true,
    animateDelay: headerMs + 120
  });
  scheduleDifficultyProgressEntrance({ delayMs: entranceEndMs });
  hidePopup();
}

async function openPracticeFromHome() {
  if (!isLoggedIn() || !shouldOfferDailyVocab()) {
    showHomeOverlay();
    refreshHomeOverlay();
    return;
  }
  dailyVocabOfferedThisSession = true;
  showDailyVocabLoading();
  try {
    const practice = await loadDailyVocabPractice();
    if (!practice?.items?.length) {
      hideDailyVocabOverlay();
      return;
    }
    showDailyVocabOverlay(practice);
  } catch (err) {
    showDailyVocabError(
      err.message || "Could not load today’s vocabulary practice."
    );
  }
}

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
    return 0;
  }

  applyAliyahTabsUI(1);

  if (finalNumber <= 1) return 0;

  let delay = 0;
  let gap = ALIYAH_TAB_BASE_GAP_MS;

  for (let step = 2; step <= finalNumber; step += 1) {
    delay += gap;
    aliyahTabAnimTimers.push(
      setTimeout(() => applyAliyahTabsUI(step), delay)
    );
    gap *= ALIYAH_TAB_GAP_MULTIPLIER;
  }

  return delay;
}

function setAliyahTabsUI(activeNumber = getActiveAliyahNumber(), { animate = false } = {}) {
  if (animate) {
    return animateAliyahTabs(activeNumber);
  }

  clearAliyahTabAnimation();
  applyAliyahTabsUI(activeNumber);
  return 0;
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
  const loadId = ++readingLoadGeneration;
  markReadingReady(false);
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
    initPlacementCatalog({
      frequency: tahotFrequency,
      gloss
    });
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

    if (loadId !== readingLoadGeneration) return;

    const title = parsha.displayValue.en;
    currentTitle = title;
    fullVerses = verses;
    updateAliyahInfo(formatAliyahDisplay(aliyahRef));
    const playEntrance = !isHomeOpen();
    const aliyahMs = setAliyahTabsUI(aliyahNumber, { animate: playEntrance });

    const difficulty = sliderInitialized
      ? getCurrentDifficulty()
      : resolveStoredDifficulty(getUserDifficulty(0), 0);

    if (!sliderInitialized) {
      initSlider(difficulty);
      sliderInitialized = true;
    } else {
      setDifficulty(difficulty, { persist: false, rerender: false });
    }

    const difficultyMs = playEntrance
      ? animateDifficultyTabs(difficulty)
      : 0;
    const headerMs = Math.max(aliyahMs, difficultyMs);

    const { entranceEndMs } = applyDisplayedVerses({
      animate: playEntrance,
      animateDelay: playEntrance ? headerMs + 120 : 0
    });
    if (playEntrance) {
      scheduleDifficultyProgressEntrance({ delayMs: entranceEndMs });
    }
    markReadingReady(true);

    if (!isHomeOpen()) {
      maybeOfferDailyVocab();
    }
  } catch (err) {
    if (loadId !== readingLoadGeneration) return;
    markReadingReady(false);
    showError(
      err.message || "Something went wrong while loading today's reading.",
      loadReading
    );
  }
}

async function maybeOfferDailyVocab() {
  if (isHomeOpen()) return;
  if (dailyVocabOfferedThisSession) return;
  if (!isLoggedIn() || !shouldOfferDailyVocab()) return;

  dailyVocabOfferedThisSession = true;
  showDailyVocabLoading();

  try {
    const practice = await loadDailyVocabPractice();

    if (!practice?.items?.length) {
      hideDailyVocabOverlay();
      return;
    }

    showDailyVocabOverlay(practice);
  } catch (err) {
    showDailyVocabError(
      err.message || "Could not load today’s vocabulary practice."
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

async function loadRankedFrequencyForSeed() {
  let ranked = getTahotRankedFrequency();
  if (ranked.length) return ranked;
  try {
    const tahotFrequency = await loadJSON("data/tahot/frequency.json");
    return Array.isArray(tahotFrequency?.ranked) ? tahotFrequency.ranked : [];
  } catch {
    return [];
  }
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
  refreshHomeOverlay();
  loadReading();
}

async function bootstrap() {
  clearLegacyAliyahOverride();

  if (new URLSearchParams(window.location.search).get("preview") === "mobile") {
    document.documentElement.classList.add("mobile-preview");
  }

  initTheme();

  await initAuth();

  initAuthPanel({
    onOpenWordBank: () => showWordBankPanel()
  });
  initPracticeStoryOverlay({
    loadStory: () =>
      loadPracticeStory({
        level: sliderInitialized
          ? getCurrentDifficulty()
          : resolveStoredDifficulty(getUserDifficulty(0), 0),
        ensureLexicon: async () => {
          if (getTahotRankedFrequency().length) return;
          await waitUntilReadingReady();
        }
      })
  });
  initWordBankPanel({
    onPracticeStory: () => startPracticeStory()
  });
  initDailyVocabOverlay();
  initWeeklyFlashOverlay();
  initPlacementOverlay({
    onPersistLevel: async (level) => {
      markPlacementDone(level);
      setDifficulty(level, { persist: true });
      if (isLoggedIn()) {
        try {
          const ranked = await loadRankedFrequencyForSeed();
          await seedKnownWordsForLevel(level, ranked);
        } catch (err) {
          console.warn("Could not seed known words from placement:", err);
        }
      }
      refreshHomeOverlay();
    },
    onComplete: () => {
      startReadingFromHome("three");
    }
  });
  initHomeOverlay({
    waitUntilReadingReady,
    revealReading,
    openPractice: openPracticeFromHome,
    openPracticeStory: () => startPracticeStory(),
    openWeeklyFlash: () => openWeeklyFlashOverlay(),
    openPlacement: () => openPlacementOverlay(),
    isReadingReady: () => readingReady
  });
  initWalkthroughOverlay({
    ensureReading: async () => {
      if (isHomeOpen()) {
        await startReadingFromHome("three");
      }
    },
    ensureHome: async () => {
      showHomeOverlay();
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
    },
    openWordPopup: (word) => {
      let segments = [];
      try {
        segments = JSON.parse(word.dataset.segments || "[]");
      } catch {
        segments = [];
      }
      if (!Array.isArray(segments)) segments = [];

      const { senses } = lookupSenses({
        word: word.dataset.word,
        verseRef: word.dataset.verseRef,
        tokenIndex: Number(word.dataset.tokenIndex),
        strongs: word.dataset.strongs,
        segments,
        translation: word.dataset.translation || ""
      });

      if (segments.length && senses[0] && !senses[0].segments?.length) {
        senses[0].segments = segments;
      }
      if (word.dataset.translation && senses[0] && !senses[0].translation) {
        senses[0].translation = word.dataset.translation;
      }

      showPopup({ word: word.dataset.word, senses }, word);
    }
  });
  initReadingFeedback({
    shouldShowContinue: () =>
      readingMode === "three" && fullVerses.length > 3,
    onContinue: () => {
      readingMode = "aliyah";
      applyDisplayedVerses({ animate: false });
    },
    getDisplayedVerses: () =>
      readingMode === "three" ? fullVerses.slice(0, 3) : fullVerses,
    getDifficulty: () =>
      sliderInitialized ? getCurrentDifficulty() : getUserDifficulty(0),
    onWordsCredited: () => refreshHomeOverlay()
  });

  onAuthStateChange((session, event) => {
    if (event && event !== "SIGNED_IN" && event !== "SIGNED_OUT") {
      return;
    }
    if (event === "SIGNED_IN") {
      dailyVocabOfferedThisSession = false;
    }
    if (event === "SIGNED_OUT") {
      hideDailyVocabOverlay();
      hidePracticeStoryOverlay();
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

  refreshHomeOverlay();

  isDiaspora = getUserDiaspora(true);

  initDiasporaToggle();
  initAliyahTabs();

  initPopupHandlers((word) => {
    let segments = [];
    try {
      segments = JSON.parse(word.dataset.segments || "[]");
    } catch {
      segments = [];
    }
    if (!Array.isArray(segments)) segments = [];

    const { senses } = lookupSenses({
      word: word.dataset.word,
      verseRef: word.dataset.verseRef,
      tokenIndex: Number(word.dataset.tokenIndex),
      strongs: word.dataset.strongs,
      segments,
      translation: word.dataset.translation || ""
    });

    if (segments.length && senses[0] && !senses[0].segments?.length) {
      senses[0].segments = segments;
    }
    if (word.dataset.translation && senses[0] && !senses[0].translation) {
      senses[0].translation = word.dataset.translation;
    }

    showPopup({ word: word.dataset.word, senses }, word);
  });

  loadReading();
}

bootstrap();
