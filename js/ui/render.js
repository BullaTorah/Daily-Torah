import { stripSefariaArtifacts } from "../core/lookup.js";
import { resolveWord } from "../core/lexicon.js";
import { tokenizeHebrewVerse } from "../core/tokenize.js";
import { shouldHideWord } from "../core/difficulty.js";

let currentDifficulty = 0;
let currentTitle = "";
let globalVerses = [];

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

export function initRender() {}

export function setRenderState({ title, verses, difficulty }) {
  if (title !== undefined) currentTitle = title;
  if (verses !== undefined) globalVerses = verses;
  if (difficulty !== undefined) currentDifficulty = difficulty;
}

export function getGlobalVerses() {
  return globalVerses;
}

function renderHebrew(verse, { animate = false, wordOffset = 0 } = {}) {
  const container = document.createElement("span");
  const parts = tokenizeHebrewVerse(verse.he);
  let revealIndex = wordOffset;

  parts.forEach((token, index) => {
    const tokenMeta = verse.tokens?.[index] ?? null;
    const sense = resolveWord({
      word: token,
      verseRef: verse.ref,
      tokenIndex: index + 1,
      strongs: tokenMeta?.strongs ?? null
    });
    const rank = sense.rank ?? 0;
    const hide = shouldHideWord(rank, currentDifficulty);

    const el = document.createElement("span");
    el.className = hide ? "word no-highlight" : "word";
    el.textContent = token;
    if (!hide) {
      el.dataset.word = token;
      if (verse.ref) el.dataset.verseRef = verse.ref;
      el.dataset.tokenIndex = String(index + 1);
      if (sense.strongs) el.dataset.strongs = sense.strongs;
    }

    if (animate) {
      el.classList.add("word-reveal");
      el.dataset.revealText = token;
      el.textContent = "";
      revealIndex += 1;
    }

    container.appendChild(el);
    container.appendChild(document.createTextNode(" "));
  });

  return { container, nextWordOffset: revealIndex };
}

const WORD_REVEAL_STAGGER_MS = 50;
let wordRevealTimers = [];

function clearWordRevealTimers() {
  wordRevealTimers.forEach((id) => window.clearTimeout(id));
  wordRevealTimers = [];
}

function scheduleWordReveal(content) {
  clearWordRevealTimers();

  const words = [...content.querySelectorAll(".word.word-reveal")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  words.forEach((word, index) => {
    const reveal = () => {
      word.textContent = word.dataset.revealText || "";
      word.classList.add("word-shown");
    };

    if (reducedMotion) {
      reveal();
      return;
    }

    const timer = window.setTimeout(reveal, index * WORD_REVEAL_STAGGER_MS);
    wordRevealTimers.push(timer);
  });
}

export function render(title, verses, { animate = false } = {}) {
  if (title !== undefined) currentTitle = title;
  if (verses !== undefined) globalVerses = verses;

  document.getElementById("title").textContent = currentTitle;

  const content = document.getElementById("content");
  content.innerHTML = "";
  content.classList.remove("loading", "error");
  clearWordRevealTimers();

  let wordOffset = 0;

  globalVerses.forEach((v) => {
    const verse = document.createElement("div");
    verse.className = "verse";

    const he = document.createElement("div");
    he.className = "hebrew";

    const hebrew = renderHebrew(v, { animate, wordOffset });
    he.appendChild(hebrew.container);
    wordOffset = hebrew.nextWordOffset;

    const num = document.createElement("span");
    num.className = "verse-num";
    num.textContent = toHebrewNumeral(v.label);

    const en = document.createElement("div");
    en.className = "english";
    en.textContent = stripSefariaArtifacts(v.en);

    verse.appendChild(num);
    verse.appendChild(he);
    verse.appendChild(en);
    content.appendChild(verse);
  });

  if (animate) {
    document.body.classList.add("reading-animate");
    document.body.classList.remove("reading-loaded");
    scheduleWordReveal(content);
    requestAnimationFrame(() => {
      document.body.classList.add("reading-loaded");
    });
    return;
  }

  document.body.classList.remove("reading-animate");
  document.body.classList.add("reading-loaded");
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
