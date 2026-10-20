import { isLoggedIn } from "../core/auth.js";
import { shouldHideWord } from "../core/difficulty.js";
import { resolveWord } from "../core/lexicon.js";
import { tokenizeHebrewVerse } from "../core/tokenize.js";
import { normalizeStrongs } from "../core/strongs.js";
import {
  countLearnedWords,
  markWordsLearned
} from "../core/word-bank.js";
import { openAuthPanel } from "./auth-panel.js";
import { paintTorahProgress } from "./home.js";

let api = null;
let bound = false;
let answered = false;

function els() {
  return {
    root: document.getElementById("readingFeedback"),
    panel: document.querySelector("#readingFeedback .reading-feedback-panel"),
    ask: document.querySelector("#readingFeedback [data-step='ask']"),
    encourage: document.querySelector("#readingFeedback [data-step='encourage']"),
    encourageText: document.querySelector(
      "#readingFeedback .reading-feedback-encourage-text"
    ),
    progress: document.querySelector(
      "#readingFeedback .reading-feedback-progress"
    ),
    progressMeta: document.getElementById("feedbackProgressMeta"),
    progressFill: document.getElementById("feedbackProgressFill"),
    progressMarkers: document.getElementById("feedbackProgressMarkers"),
    signin: document.querySelector("#readingFeedback .reading-feedback-signin"),
    signinBtn: document.getElementById("feedbackSignInBtn"),
    continueBtn: document.getElementById("continuePortionBtn")
  };
}

/** Keep feedback outside #content — render() wipes content.innerHTML. */
function mountAfterContent() {
  const content = document.getElementById("content");
  const outro = document.getElementById("readingOutro");
  if (!content || !outro) return;

  if (content.nextElementSibling !== outro) {
    content.insertAdjacentElement("afterend", outro);
  }
}

function hideContinue() {
  const { continueBtn } = els();
  if (continueBtn) continueBtn.hidden = true;
}

function showContinue() {
  const { continueBtn } = els();
  if (!continueBtn) return;
  if (!api?.shouldShowContinue?.()) {
    continueBtn.hidden = true;
    return;
  }
  continueBtn.hidden = false;
}

function collectUnmarkedEntries(verses, difficulty) {
  const byId = new Map();

  for (const verse of verses || []) {
    if (!verse?.he) continue;
    const parts = tokenizeHebrewVerse(verse.he);
    parts.forEach((token, index) => {
      const tokenMeta = verse.tokens?.[index] ?? null;
      const sense = resolveWord({
        word: token,
        verseRef: verse.ref,
        tokenIndex: index + 1,
        strongs: tokenMeta?.strongs ?? null
      });
      if (sense.rank == null) return;
      if (!shouldHideWord(sense.rank, difficulty)) return;

      const id = normalizeStrongs(sense.strongs || tokenMeta?.strongs);
      if (!id || byId.has(id)) return;

      byId.set(id, {
        strongs: id,
        lemma: sense.lemma || null,
        gloss: sense.gloss || null,
        surfaceExample: token
      });
    });
  }

  return [...byId.values()];
}

function resetEncourageModes() {
  const { encourageText, progress, signin } = els();
  if (encourageText) {
    encourageText.hidden = false;
    encourageText.textContent = "Great work!";
  }
  if (progress) progress.hidden = true;
  if (signin) signin.hidden = true;
}

function resetUi() {
  const { root, ask, encourage, panel } = els();
  answered = false;
  if (ask) {
    ask.hidden = false;
    ask.classList.remove("is-leaving");
    ask.removeAttribute("aria-hidden");
  }
  if (encourage) {
    encourage.hidden = true;
    encourage.classList.remove("is-visible");
  }
  resetEncourageModes();
  panel?.classList.remove("is-fading");
  document.querySelectorAll("#readingFeedback [data-rating]").forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-selected", "false");
  });
  if (root) {
    root.hidden = false;
    root.classList.remove("is-gone", "is-sliding-out");
  }
  hideContinue();
}

async function prepareEncourage(rating) {
  const {
    encourageText,
    progress,
    progressMeta,
    progressFill,
    progressMarkers,
    signin
  } = els();

  resetEncourageModes();

  if (rating !== "all") {
    return 900;
  }

  if (!isLoggedIn()) {
    if (encourageText) encourageText.hidden = true;
    if (signin) signin.hidden = false;
    return 1800;
  }

  if (encourageText) encourageText.hidden = true;
  if (progress) progress.hidden = false;

  let before = 0;
  try {
    before = await countLearnedWords();
  } catch {
    before = 0;
  }

  const verses = api?.getDisplayedVerses?.() || [];
  const difficulty = api?.getDifficulty?.() ?? 0;
  const entries = collectUnmarkedEntries(verses, difficulty);

  try {
    await markWordsLearned(entries);
  } catch {
    /* credit is best-effort */
  }

  let after = before;
  try {
    after = await countLearnedWords();
  } catch {
    after = before;
  }

  paintTorahProgress({
    metaEl: progressMeta,
    fillEl: progressFill,
    markersEl: progressMarkers,
    learned: before
  });

  requestAnimationFrame(() => {
    paintTorahProgress({
      metaEl: progressMeta,
      fillEl: progressFill,
      markersEl: progressMarkers,
      learned: after,
      animateFrom: before
    });
  });

  api?.onWordsCredited?.();
  return after > before ? 2400 : 2000;
}

function afterAnswer(rating) {
  const { ask, encourage, root } = els();
  if (!ask || !encourage || !root) return;

  answered = true;
  ask.classList.add("is-leaving");

  window.setTimeout(async () => {
    ask.setAttribute("aria-hidden", "true");
    const holdMs = await prepareEncourage(rating);
    encourage.hidden = false;
    requestAnimationFrame(() => encourage.classList.add("is-visible"));

    window.setTimeout(() => {
      showContinue();
      requestAnimationFrame(() => {
        root.classList.add("is-sliding-out");
        window.setTimeout(() => {
          root.hidden = true;
          root.classList.add("is-gone");
          root.classList.remove("is-sliding-out");
        }, 350);
      });
    }, holdMs);
  }, 280);
}

export function resetReadingFeedback() {
  mountAfterContent();
  resetUi();
}

export function initReadingFeedback(handlers = {}) {
  api = handlers;
  if (bound) return;
  bound = true;

  const { root, continueBtn, signinBtn } = els();
  if (!root) return;

  root.addEventListener("click", (e) => {
    const ratingBtn = e.target.closest("[data-rating]");
    if (!ratingBtn || answered) return;

    root.querySelectorAll("[data-rating]").forEach((btn) => {
      const on = btn === ratingBtn;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    afterAnswer(ratingBtn.getAttribute("data-rating") || "");
  });

  signinBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    openAuthPanel();
  });

  continueBtn?.addEventListener("click", () => {
    api?.onContinue?.();
  });

  resetReadingFeedback();
}
