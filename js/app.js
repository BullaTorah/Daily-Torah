import { initLookup, lookupSenses } from "./core/lookup.js";
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
  getStoredDifficulty,
  getStoredDiaspora,
  setStoredDiaspora,
  getStoredAliyahOverride,
  setStoredAliyahOverride
} from "./core/storage.js";
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

const loadJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return res.json();
};

const MAX_ALIYAH_TABS = 7;

let isDiaspora = true;
let sliderInitialized = false;
let cachedLexiconData = null;
let loadInFlight = null;
let currentAliyotCount = MAX_ALIYAH_TABS;

function getTodayAliyahNumber() {
  return getAliyahIndexForToday() + 1;
}

function getActiveAliyahNumber() {
  const query = getAliyahOverrideFromQuery();
  if (query !== null) return query;

  const stored = getStoredAliyahOverride();
  if (stored !== null) return stored;

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
      setStoredDiaspora(isDiaspora);
      setDiasporaTabsUI(isDiaspora);
      hidePopup();
      loadReading();
    });
  });
}

function setAliyahTabsUI(activeNumber = getActiveAliyahNumber()) {
  document.querySelectorAll("#aliyahTabs .segment-tab").forEach((tab) => {
    const number = Number(tab.dataset.aliyah);
    const available = number <= currentAliyotCount;
    const active = available && number === activeNumber;

    tab.disabled = !available;
    tab.classList.toggle("unavailable", !available);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
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
        setStoredAliyahOverride(null);
      } else {
        setStoredAliyahOverride(i);
      }

      setAliyahTabsUI();
      hidePopup();
      loadReading();
    });
    container.appendChild(tab);
  }

  setAliyahTabsUI();
}

async function loadReading() {
  if (loadInFlight) return loadInFlight;

  loadInFlight = loadReadingInner().finally(() => {
    loadInFlight = null;
  });

  return loadInFlight;
}

async function loadReadingInner() {
  showLoading();
  hidePopup();

  try {
    if (!cachedLexiconData) {
      const [wordLookup, gloss, frequency] = await Promise.all([
        loadJSON("data/word-lookup.json"),
        loadJSON("data/gloss.json"),
        loadJSON("data/lemma-frequency.json")
      ]);
      cachedLexiconData = { wordLookup, gloss, frequency };
    }

    const { wordLookup, gloss, frequency } = cachedLexiconData;
    initLookup(wordLookup, gloss, frequency);
    initRender(frequency);

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
    const verses = normalizeVerses(textData, aliyahRef);

    if (!verses.length) {
      throw new Error("No verses returned for this aliyah.");
    }

    const title = parsha.displayValue.en;
    updateAliyahInfo(formatAliyahDisplay(aliyahRef));
    setAliyahTabsUI(aliyahNumber);

    const difficulty = sliderInitialized
      ? getCurrentDifficulty()
      : resolveStoredDifficulty(getStoredDifficulty(0), 0);

    setRenderState({ title, verses, difficulty });
    render(title, verses);

    if (!sliderInitialized) {
      initSlider(difficulty);
      sliderInitialized = true;
    } else {
      setDifficulty(difficulty, { persist: false });
    }
  } catch (err) {
    showError(
      err.message || "Something went wrong while loading today's reading.",
      loadReading
    );
  }
}

isDiaspora = getStoredDiaspora(true);
initDiasporaToggle();
initAliyahTabs();

initPopupHandlers((word) => {
  const { senses } = lookupSenses(word.dataset.word);
  showPopup({ word: word.dataset.word, senses }, word);
});

loadReading();
