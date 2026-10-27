import { stripSefariaArtifacts } from "../core/lookup.js";
import { resolveWord } from "../core/lexicon.js";
import { tokenizeHebrewVerse } from "../core/tokenize.js";
import { isWordLearned, onLearnedWordsChange } from "../core/word-bank.js";
import { initVerseBulkActions } from "./verse-bulk-actions.js";
// createVerseBulkActions — How did you do? panel hidden for now

let currentTitle = "";
let globalVerses = [];
let learnedRerenderBound = false;

const HEBREW_ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const HEBREW_TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HEBREW_HUNDREDS = ["", "ק", "ר", "ש", "ת"];

function toHebrewNumeral(num) {
  if (!Number.isFinite(num) || num < 1) return "";

  if (num >= 1000) {
    return toHebrewNumeral(Math.floor(num / 1000)) + toHebrewNumeral(num % 1000);
  }

  let n = num;
  let parts = [];

  while (n >= 400) {
    parts.push("ת");
    n -= 400;
  }

  if (n >= 100) {
    parts.push(HEBREW_HUNDREDS[Math.floor(n / 100)]);
    n %= 100;
  }

  if (n === 15) parts.push("טו");
  else if (n === 16) parts.push("טז");
  else {
    if (n >= 10) {
      parts.push(HEBREW_TENS[Math.floor(n / 10)]);
      n %= 10;
    }
    if (n > 0) parts.push(HEBREW_ONES[n]);
  }

  let result = parts.join("");
  return result;
}

/** Sync underlines to Known set without rebuilding the DOM (keeps popup anchors). */
export function syncKnownUnderlines() {
  document
    .querySelectorAll(
      "#content .word[data-strongs], #dailyVocabList .word[data-strongs], #practiceStoryHebrew .word[data-strongs]"
    )
    .forEach((el) => {
      el.classList.toggle("no-highlight", isWordLearned(el.dataset.strongs));
    });
}

export function initRender() {
  initVerseNumInteraction();
  initVerseBulkActions();
  if (!learnedRerenderBound) {
    learnedRerenderBound = true;
    onLearnedWordsChange(() => {
      syncKnownUnderlines();
    });
  }
}

let verseNumInteractionBound = false;

function showEnglishVerseNum(num) {
  const label = num.querySelector(".verse-num-text");
  if (label) label.textContent = num.dataset.english;
  num.classList.add("is-english");
}

function showHebrewVerseNum(num) {
  const label = num.querySelector(".verse-num-text");
  if (label) label.textContent = num.dataset.hebrew;
  num.classList.remove("is-english");
}

function initVerseNumInteraction() {
  if (verseNumInteractionBound) return;

  const content = document.getElementById("content");
  if (!content) return;

  verseNumInteractionBound = true;

  content.addEventListener("mouseover", (e) => {
    const num = e.target.closest(".verse-num");
    if (num) showEnglishVerseNum(num);
  });

  content.addEventListener("mouseout", (e) => {
    const num = e.target.closest(".verse-num");
    if (!num) return;
    if (e.relatedTarget?.closest?.(".verse-num") === num) return;
    showHebrewVerseNum(num);
  });

  content.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const num = e.target.closest(".verse-num");
    if (num) showEnglishVerseNum(num);
  });

  const restoreTouchedVerseNums = (e) => {
    if (e.pointerType !== "touch") return;
    document.querySelectorAll(".verse-num.is-english").forEach(showHebrewVerseNum);
  };

  content.addEventListener("pointerup", restoreTouchedVerseNums);
  content.addEventListener("pointercancel", restoreTouchedVerseNums);
}

export function setRenderState({ title, verses }) {
  if (title !== undefined) currentTitle = title;
  if (verses !== undefined) globalVerses = verses;
}

export function getGlobalVerses() {
  return globalVerses;
}

function renderHebrew(verse, {
  animate = false,
  wordOffset = 0,
  forceHighlightStrongs = null,
  forceHighlightSurface = null
} = {}) {
  const container = document.createElement("span");
  const parts = tokenizeHebrewVerse(verse.he);
  let revealIndex = wordOffset;
  const forceId = forceHighlightStrongs
    ? String(forceHighlightStrongs).replace(/\D/g, "")
    : null;
  const forceSurfacePlain = forceHighlightSurface
    ? String(forceHighlightSurface)
        .normalize("NFD")
        .replace(/[\u0591-\u05C7]/g, "")
        .replace(/[^\u05D0-\u05EA]/g, "")
    : "";

  parts.forEach((token, index) => {
    const tokenMeta = verse.tokens?.[index] ?? null;
    const sense = resolveWord({
      word: token,
      verseRef: verse.ref,
      tokenIndex: index + 1,
      strongs: tokenMeta?.strongs ?? null
    });
    const tokenStrongs = String(sense.strongs || tokenMeta?.strongs || "").replace(
      /\D/g,
      ""
    );
    const tokenPlain = String(token)
      .normalize("NFD")
      .replace(/[\u0591-\u05C7]/g, "")
      .replace(/[^\u05D0-\u05EA]/g, "");
    const isTargetByStrongs =
      forceId &&
      tokenStrongs &&
      (tokenStrongs === forceId ||
        tokenStrongs.replace(/^0+/, "") === forceId.replace(/^0+/, ""));
    const isTargetBySurface =
      forceSurfacePlain &&
      tokenPlain &&
      (tokenPlain === forceSurfacePlain ||
        tokenPlain.includes(forceSurfacePlain) ||
        forceSurfacePlain.includes(tokenPlain));
    const isTarget = Boolean(isTargetByStrongs || isTargetBySurface);
    // Underline = not yet Known; Known words are plain (personalized)
    const hide =
      forceId || forceSurfacePlain
        ? !isTarget
        : isWordLearned(sense.strongs || tokenMeta?.strongs);

    const el = document.createElement("span");
    const forceMode = Boolean(forceId || forceSurfacePlain);
    // Practice sentences: only the target word is tappable; fillers are plain text
    if (forceMode && !isTarget) {
      el.className = "practice-token";
      el.textContent = token;
      container.appendChild(el);
      container.appendChild(document.createTextNode(" "));
      return;
    }

    // no-highlight only controls underlines; every word stays clickable
    el.className = hide ? "word no-highlight" : "word";
    el.textContent = token;
    el.dataset.word = token;
    if (verse.ref) el.dataset.verseRef = verse.ref;
    el.dataset.tokenIndex = String(index + 1);
    if (sense.strongs || tokenMeta?.strongs || (isTarget && forceId)) {
      el.dataset.strongs = sense.strongs || tokenMeta?.strongs || forceId;
    }
    const segments =
      (Array.isArray(sense.segments) && sense.segments.length
        ? sense.segments
        : null) ||
      (Array.isArray(tokenMeta?.segments) && tokenMeta.segments.length
        ? tokenMeta.segments
        : null) ||
      (Array.isArray(tokenMeta?.sense?.segments) &&
      tokenMeta.sense.segments.length
        ? tokenMeta.sense.segments
        : null);
    if (segments?.length) {
      el.dataset.segments = JSON.stringify(segments);
    }
    if (sense.translation || tokenMeta?.sense?.translation) {
      el.dataset.translation =
        sense.translation || tokenMeta.sense.translation;
    }

    if (animate) {
      el.classList.add("word-reveal");
      revealIndex += 1;
    }

    container.appendChild(el);
    container.appendChild(document.createTextNode(" "));
  });

  return { container, nextWordOffset: revealIndex };
}

const WORD_REVEAL_STAGGER_MS = 55;
const WORD_REVEAL_ACCELERATION = 1.04;
/** Beat after a verse's last Hebrew word before its English appears. */
const ENGLISH_REVEAL_GAP_MS = 120;
/** Hold after English before the next verse's Hebrew starts. */
const ENGLISH_HOLD_MS = 280;
const WORD_FADE_MS = 420;
let wordRevealTimers = [];

function clearWordRevealTimers() {
  wordRevealTimers.forEach((id) => window.clearTimeout(id));
  wordRevealTimers = [];
}

function wordStaggerAfter(wordIndex) {
  return WORD_REVEAL_STAGGER_MS / WORD_REVEAL_ACCELERATION ** Math.max(0, wordIndex);
}

/**
 * Top-to-bottom plan: each verse's Hebrew words, then that verse's English,
 * then the next verse.
 * @returns {{ steps: { kind: string, el: Element, delay: number }[], totalMs: number }}
 */
function buildRevealPlan(content) {
  const steps = [];
  let t = 0;
  let wordIndex = 0;

  content.querySelectorAll(".verse").forEach((verse) => {
    const words = [...verse.querySelectorAll(".word.word-reveal")];
    const english = verse.querySelector(".english.english-reveal");

    words.forEach((word, i) => {
      steps.push({ kind: "word", el: word, delay: t });
      if (i < words.length - 1) {
        t += wordStaggerAfter(wordIndex);
      }
      wordIndex += 1;
    });

    if (english) {
      const englishAt = words.length ? t + ENGLISH_REVEAL_GAP_MS : t;
      steps.push({ kind: "english", el: english, delay: englishAt });
      t = englishAt + ENGLISH_HOLD_MS;
    } else if (words.length) {
      t += wordStaggerAfter(wordIndex - 1);
    }
  });

  return { steps, totalMs: t + WORD_FADE_MS };
}

export function wordRevealDurationMs(wordCount) {
  const n = Math.max(0, Number(wordCount) || 0);
  if (n <= 1) return 0;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;

  let delay = 0;
  for (let i = 0; i < n - 1; i += 1) {
    delay += wordStaggerAfter(i);
  }
  return delay;
}

function revealWord(word) {
  word.classList.add("word-shown");
}

function revealEnglish(el) {
  el.classList.add("english-shown");
}

function scheduleWordReveal(content) {
  clearWordRevealTimers();

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { steps, totalMs } = buildRevealPlan(content);

  if (reducedMotion) {
    steps.forEach((step) => {
      if (step.kind === "word") revealWord(step.el);
      else revealEnglish(step.el);
    });
    return 0;
  }

  steps.forEach((step) => {
    const timer = window.setTimeout(() => {
      if (step.kind === "word") revealWord(step.el);
      else revealEnglish(step.el);
    }, step.delay);
    wordRevealTimers.push(timer);
  });

  return totalMs;
}

/** @returns {{ entranceEndMs: number }} */
export function render(title, verses, { animate = false, animateDelay = 0 } = {}) {
  if (title !== undefined) currentTitle = title;
  if (verses !== undefined) globalVerses = verses;

  document.getElementById("title").textContent = currentTitle;

  const content = document.getElementById("content");
  content.innerHTML = "";
  content.classList.remove("loading", "error");
  clearWordRevealTimers();

  let wordOffset = 0;

  globalVerses.forEach((v, verseIndex) => {
    const verse = document.createElement("div");
    verse.className = "verse";

    const he = document.createElement("div");
    he.className = "hebrew";

    const hebrew = renderHebrew(v, { animate, wordOffset });
    he.appendChild(hebrew.container);
    wordOffset = hebrew.nextWordOffset;

    const num = document.createElement("span");
    num.className = "verse-num";
    num.dataset.hebrew = toHebrewNumeral(v.label);
    num.dataset.english = String(v.label);

    const numLabel = document.createElement("span");
    numLabel.className = "verse-num-text";
    numLabel.textContent = num.dataset.hebrew;
    num.appendChild(numLabel);

    const en = document.createElement("div");
    en.className = animate ? "english english-reveal" : "english";
    en.textContent = stripSefariaArtifacts(v.en);

    // How did you do? panel — hidden for now
    // verse.appendChild(createVerseBulkActions({ showHeading: verseIndex === 0 }));
    verse.appendChild(num);
    verse.appendChild(he);
    verse.appendChild(en);
    content.appendChild(verse);
  });

  if (animate) {
    document.body.classList.add("reading-animate");
    document.body.classList.remove("reading-loaded");
    requestAnimationFrame(() => {
      document.body.classList.add("reading-loaded");
    });
    const delay = Math.max(0, Number(animateDelay) || 0);
    const { totalMs: revealMs } = buildRevealPlan(content);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (delay > 0 && !reduced) {
      const timer = window.setTimeout(() => scheduleWordReveal(content), delay);
      wordRevealTimers.push(timer);
    } else {
      scheduleWordReveal(content);
    }
    return { entranceEndMs: delay + (reduced ? 0 : revealMs) };
  }

  document.body.classList.remove("reading-animate");
  document.body.classList.add("reading-loaded");
  return { entranceEndMs: 0 };
}

/** Render one verse-like block into a container (daily vocab practice). */
export function renderPracticeVerse(container, verse, {
  forceHighlightStrongs = null,
  forceHighlightSurface = null
} = {}) {
  if (!container || !verse) return;

  container.innerHTML = "";

  const row = document.createElement("div");
  row.className = "verse daily-vocab-verse";

  const he = document.createElement("div");
  he.className = "hebrew";
  const hebrew = renderHebrew(verse, {
    forceHighlightStrongs,
    forceHighlightSurface
  });
  he.appendChild(hebrew.container);

  const en = document.createElement("div");
  en.className = "english";
  en.textContent = stripSefariaArtifacts(verse.en);

  row.appendChild(he);
  row.appendChild(en);
  container.appendChild(row);
}

export function showLoading() {
  document.getElementById("aliyah-info").textContent = "";

  const content = document.getElementById("content");
  content.innerHTML = "";
  content.classList.remove("error");
  clearWordRevealTimers();
  document.body.classList.remove("reading-loaded", "reading-animate");
}

export function showError(message, onRetry) {
  document.getElementById("title").textContent = "Unable to load";

  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="error-panel">
      <p class="status-message">${message}</p>
      <button type="button" id="retryBtn" class="retry-btn">Retry</button>
    </div>
  `;
  content.classList.add("error");
  content.classList.remove("loading");
  document.body.classList.add("reading-loaded");

  document.getElementById("retryBtn").addEventListener("click", onRetry);
}

export function updateAliyahInfo(text) {
  document.getElementById("aliyah-info").textContent = text;
}

export function rerenderCurrent() {
  render(currentTitle, globalVerses);
}
