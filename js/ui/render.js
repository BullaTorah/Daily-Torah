import { resolveSense, stripSefariaArtifacts, cleanHebrewText } from "../core/lookup.js";
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

function renderHebrew(text) {
  const container = document.createElement("span");
  const cleaned = cleanHebrewText(String(text || ""));

  const parts = cleaned
    .replace(/\s+/g, " ")
    .trim()
    .split(/[\s\u00A0־]+/);

  parts.forEach((raw) => {
    if (!raw) return;

    let token = raw
      .replace(/[.,:;!?"]/g, "")
      .trim();

    if (!token) return;

    const sense = resolveSense(token);
    const rank = sense.rank ?? Infinity;
    const hide = shouldHideWord(rank, currentDifficulty);

    const el = document.createElement("span");
    el.className = hide ? "word no-highlight" : "word";
    el.textContent = token;
    if (!hide) {
      el.dataset.word = token;
    }

    container.appendChild(el);
    container.appendChild(document.createTextNode(" "));
  });

  return container;
}

export function render(title, verses) {
  if (title !== undefined) currentTitle = title;
  if (verses !== undefined) globalVerses = verses;

  document.getElementById("title").textContent = currentTitle;

  const content = document.getElementById("content");
  content.innerHTML = "";
  content.classList.remove("loading", "error");

  globalVerses.forEach((v) => {
    const verse = document.createElement("div");
    verse.className = "verse";

    const he = document.createElement("div");
    he.className = "hebrew";
    he.appendChild(renderHebrew(v.he));

    const num = document.createElement("span");
    num.className = "verse-num";
    num.textContent = toHebrewNumeral(v.label);

    const en = document.createElement("div");
    en.className = "english";
    en.textContent = stripSefariaArtifacts(v.en);

    verse.appendChild(he);
    verse.appendChild(num);
    verse.appendChild(en);
    content.appendChild(verse);
  });
}

export function showLoading(message = "Loading today's reading…") {
  document.getElementById("title").textContent = "Loading Torah…";
  document.getElementById("aliyah-info").textContent = "";

  const content = document.getElementById("content");
  content.innerHTML = `<p class="status-message">${message}</p>`;
  content.classList.add("loading");
  content.classList.remove("error");
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

  document.getElementById("retryBtn").addEventListener("click", onRetry);
}

export function updateAliyahInfo(text) {
  document.getElementById("aliyah-info").textContent = text;
}

export function rerenderCurrent() {
  render(currentTitle, globalVerses);
}
