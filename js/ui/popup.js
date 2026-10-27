import { isAuthConfigured, isLoggedIn } from "../core/auth.js";
import {
  isWordSaved,
  isWordLearned,
  toggleWord,
  markWordLearned,
  onWordBankChange,
  onLearnedWordsChange
} from "../core/word-bank.js";
import {
  explainWord,
  getCachedExplanation
} from "../core/explain-word.js";
import { openAuthPanel } from "./auth-panel.js";

let activeAnchor = null;
let activePopupData = null;
let activeSenseIndex = 0;
/** @type {{ key: string, sections?: object, loading?: boolean, error?: string } | null} */
let activeExplainState = null;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep niqqud; drop trop/meteg that often fall back to a different face in Suez One. */
function forHebrewDisplay(str) {
  return String(str || "")
    .normalize("NFC")
    .replace(/[\u0591-\u05AF\u05BD\u05BF]/g, "");
}

const GRAMMAR_LEAD_IN =
  /(?:[,;:]?\s*)(?:making it|so it reads|so here it means|so it means)\s*$/i;

/** Escape grammar text, rendering **bold** (exact translation) as <strong>. */
function formatGrammarHtml(text, takeaway = "") {
  let source = String(text || "").trim();
  const gloss = String(takeaway || "").trim();

  // Strip unfinished lead-ins like "making it" left by older model replies
  source = source.replace(GRAMMAR_LEAD_IN, "").trim();

  if (gloss) {
    const already =
      source.includes(`**${gloss}**`) ||
      source.toLowerCase().includes(gloss.toLowerCase());
    if (!already) {
      if (source && !/[.!?]$/.test(source)) source = `${source}.`;
      source = `${source}${source ? " " : ""}So here it means **${gloss}**.`;
    } else if (!/\*\*[^*]+\*\*/.test(source)) {
      const idx = source.toLowerCase().lastIndexOf(gloss.toLowerCase());
      if (idx >= 0) {
        source =
          source.slice(0, idx) +
          `**${source.slice(idx, idx + gloss.length)}**` +
          source.slice(idx + gloss.length);
      }
    }
  } else if (!/\*\*[^*]+\*\*/.test(source)) {
    const match = source.match(/"([^"]+)"(?![\s\S]*"[^"]*")/);
    if (match && match.index != null) {
      const start = match.index;
      const end = start + match[0].length;
      source =
        source.slice(0, start) + `**${match[0]}**` + source.slice(end);
    }
  }

  if (!source) return "";

  return source
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) {
        return `<strong class="popup-explain-gloss">${escapeHtml(bold[1])}</strong>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

let holdOpenForWalkthrough = false;

/** Keep the gloss popup open across walkthrough tips (tap → Explain). */
export function setPopupWalkthroughHold(on) {
  holdOpenForWalkthrough = Boolean(on);
}

export function hidePopup() {
  holdOpenForWalkthrough = false;
  const popup = document.getElementById("popup");
  popup.style.display = "none";
  popup.innerHTML = "";
  popup.style.top = "";
  popup.style.left = "";
  popup.style.right = "";
  popup.style.bottom = "";
  popup.style.width = "";
  popup.style.maxWidth = "";
  popup.style.transform = "";
  popup.classList.remove("is-on-white", "is-explain-open");
  if (activeAnchor) {
    activeAnchor.classList.remove("popup-active", "is-on-white");
  }
  activeAnchor = null;
  activePopupData = null;
  activeSenseIndex = 0;
  activeExplainState = null;
}

function syncExplainPopupWidth(popup) {
  const open = Boolean(
    activeExplainState &&
      (activeExplainState.loading ||
        activeExplainState.sections ||
        activeExplainState.error)
  );
  popup.classList.toggle("is-explain-open", open);
}

function explainCacheKey(surface, sense, verseRef) {
  return `${verseRef || ""}|${surface || ""}|${sense?.strongs || ""}`;
}

function getVerseContext(anchor) {
  const verseRef = anchor?.dataset?.verseRef || "";
  const root =
    anchor?.closest(".verse") ||
    anchor?.closest(".daily-vocab-verse-host") ||
    null;
  if (!root) {
    return { verseHe: "", verseEn: "", verseRef };
  }
  const verseHe = root.querySelector(".hebrew")?.textContent?.trim() || "";
  const verseEn = root.querySelector(".english")?.textContent?.trim() || "";
  return { verseHe, verseEn, verseRef };
}

function isDockedPopup() {
  return (
    window.matchMedia("(max-width: 640px)").matches ||
    document.documentElement.classList.contains("mobile-preview")
  );
}

function getColumnBounds() {
  if (activeAnchor?.closest("#dailyVocabList")) {
    const host = activeAnchor.closest(".daily-vocab-verse-host") ||
      document.getElementById("dailyVocabList");
    const rect = host?.getBoundingClientRect();
    if (rect?.width) return rect;
  }

  const content = document.getElementById("content");
  if (!content) return null;

  const rect = content.getBoundingClientRect();
  if (rect.width > 0) return rect;

  const sample = content.querySelector(".verse");
  return sample?.getBoundingClientRect() || null;
}

function positionDockedPopup(popup) {
  const rect = getColumnBounds();

  popup.style.top = "auto";
  popup.style.bottom = "0";
  popup.style.right = "auto";
  popup.style.transform = "";
  popup.style.maxWidth = "none";
  popup.style.boxSizing = "border-box";

  if (rect?.width) {
    popup.style.left = `${rect.left}px`;
    popup.style.width = `${rect.width}px`;
    return;
  }

  popup.style.left = "50%";
  popup.style.width = "var(--text-col)";
  popup.style.transform = "translateX(-50%)";
}

function scheduleDockedPosition(popup) {
  positionDockedPopup(popup);
  requestAnimationFrame(() => positionDockedPopup(popup));
}

function positionPopup(popup, anchor) {
  popup.style.display = "block";

  if (isDockedPopup()) {
    scheduleDockedPosition(popup);
    return;
  }

  popup.style.transform = "";

  popup.style.right = "auto";
  popup.style.bottom = "auto";
  popup.style.width = "";

  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 12;

  const popupRect = popup.getBoundingClientRect();

  let top = rect.top + window.scrollY - popupRect.height;
  let left = rect.left + window.scrollX;

  const minTop = window.scrollY + viewportPadding;
  const minLeft = window.scrollX + viewportPadding;
  const maxLeft =
    window.scrollX + window.innerWidth - popupRect.width - viewportPadding;

  if (top < minTop) {
    top = minTop;
  }

  if (left > maxLeft) {
    left = Math.max(minLeft, maxLeft);
  }

  if (left < minLeft) {
    left = minLeft;
  }

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

function renderWordBankButton(surfaceWord, sense) {
  if (activeAnchor?.closest("#dailyVocabPanel")) return "";
  if (!isAuthConfigured() || !sense.strongs) return "";

  const saved = isWordSaved(sense.strongs);
  const label = saved ? "In Practice" : "Add to Practice words";

  return `<button type="button" class="popup-save-btn${saved ? " saved" : ""}" data-action="word-bank" aria-pressed="${saved ? "true" : "false"}">${label}</button>`;
}

function renderKnowThisButton(sense) {
  if (activeAnchor?.closest("#dailyVocabPanel")) return "";
  if (!isAuthConfigured() || !sense.strongs) return "";

  const known = isWordLearned(sense.strongs);
  const label = known ? "Known" : "Mark as Known";

  return `<button type="button" class="popup-know-btn${known ? " known" : ""}" data-action="know-word"${known ? " disabled" : ""} aria-pressed="${known ? "true" : "false"}">${label}</button>`;
}

function isExplainViewActive() {
  return Boolean(
    activeExplainState &&
      (activeExplainState.loading ||
        activeExplainState.sections ||
        activeExplainState.error)
  );
}

function renderExplainButton(sense) {
  if (!isAuthConfigured()) return "";
  if (!sense?.strongs && !sense?.lemma) return "";
  return `<button type="button" class="popup-explain-btn" data-action="explain" aria-expanded="false">Explain</button>`;
}

function renderExplainColumn(label, part) {
  if (!part?.he) return "";
  const he = forHebrewDisplay(part.he);
  return `<div class="popup-explain-col">
    <div class="popup-explain-label">${escapeHtml(label)}</div>
    <div class="popup-explain-he" lang="he" dir="rtl">${escapeHtml(he)}</div>
    ${part.en ? `<p class="popup-explain-text">${escapeHtml(part.en)}</p>` : ""}
  </div>`;
}

function renderExplainFooter(surfaceWord, sense) {
  const know = renderKnowThisButton(sense);
  const save = renderWordBankButton(surfaceWord, sense);
  return `<div class="popup-explain-actions">
    <button type="button" class="popup-explain-hide-btn" data-action="explain-hide">Hide</button>
    ${know}
    ${save}
  </div>`;
}

function renderExplainView(surfaceWord, sense) {
  if (activeExplainState?.loading) {
    return `<div class="popup-explain is-loading">Explaining…</div>
      ${renderExplainFooter(surfaceWord, sense)}`;
  }
  if (activeExplainState?.error) {
    return `<div class="popup-explain is-error">${escapeHtml(activeExplainState.error)}</div>
      ${renderExplainFooter(surfaceWord, sense)}`;
  }
  const sections = activeExplainState?.sections;
  if (!sections?.root) return "";
  // DOM order Prefix → Root → Suffix; CSS row-reverse shows RTL: Prefix | Root | Suffix
  const note =
    sections.literal || sections.grammar || sections.takeaway
      ? `<div class="popup-explain-note">
          ${
            sections.literal
              ? `<h4 class="popup-explain-literal">${escapeHtml(sections.literal)}</h4>`
              : ""
          }
          ${
            sections.grammar || sections.takeaway
              ? `<p class="popup-explain-grammar">${formatGrammarHtml(
                  sections.grammar,
                  sections.takeaway
                )}</p>`
              : ""
          }
        </div>`
      : "";
  return `<div class="popup-explain-result">
    <div class="popup-explain-grid">
      ${renderExplainColumn("Prefix", sections.prefix)}
      ${renderExplainColumn("Root", sections.root)}
      ${renderExplainColumn("Suffix", sections.suffix)}
    </div>
    ${note}
    ${renderExplainFooter(surfaceWord, sense)}
  </div>`;
}

function renderSenseBody(surfaceWord, sense) {
  if (isExplainViewActive()) {
    return renderExplainView(surfaceWord, sense);
  }

  const displayWord = forHebrewDisplay(sense.lemma || surfaceWord);
  const lines = [
    `<div class="popup-word" lang="he">${escapeHtml(displayWord)}</div>`
  ];

  lines.push(`<div>${escapeHtml(sense.gloss)}</div>`);

  if (sense.rank != null) {
    lines.push(`<div class="popup-meta">Rank ${escapeHtml(sense.rank)}</div>`);
  }

  if (sense.strongs) {
    lines.push(`<div class="popup-meta">Strong's: ${escapeHtml(sense.strongs)}</div>`);
  }

  const actions = [
    renderExplainButton(sense),
    renderKnowThisButton(sense),
    renderWordBankButton(surfaceWord, sense)
  ]
    .filter(Boolean)
    .join("");
  if (actions) {
    lines.push(`<div class="popup-actions">${actions}</div>`);
  }

  return lines.join("");
}

function renderPopupContent(word, senses, activeIndex) {
  const parts = [];
  const explainView = isExplainViewActive();

  if (!explainView && senses.length > 1) {
    const tabs = senses
      .map(
        (_, index) =>
          `<button type="button" class="popup-tab${
            index === activeIndex ? " active" : ""
          }" data-index="${index}">${index + 1}</button>`
      )
      .join("");
    parts.push(`<div class="popup-tabs">${tabs}</div>`);
  }

  parts.push(
    `<div class="popup-body">${renderSenseBody(word, senses[activeIndex])}</div>`
  );

  return parts.join("");
}

function rebindPopup(popup, word, senses, activeIndex, anchor) {
  popup.innerHTML = renderPopupContent(word, senses, activeIndex);
  syncExplainPopupWidth(popup);
  bindPopupTabs(popup, word, senses, anchor);
  bindWordBankButton(popup, word, senses, activeIndex, anchor);
  bindKnowThisButton(popup, word, senses, activeIndex, anchor);
  bindExplainButton(popup, word, senses, activeIndex, anchor);
  bindExplainHideButton(popup, word, senses, activeIndex, anchor);
  positionPopup(popup, anchor);
  // Reposition after width transition so floating popup stays above the word
  window.setTimeout(() => positionPopup(popup, anchor), 360);
}

function segmentsForExplain(sense, anchor) {
  if (Array.isArray(sense?.segments) && sense.segments.length) {
    return sense.segments;
  }
  try {
    const fromDom = JSON.parse(anchor?.dataset?.segments || "[]");
    return Array.isArray(fromDom) ? fromDom : [];
  } catch {
    return [];
  }
}

function bindExplainHideButton(popup, word, senses, activeIndex, anchor) {
  const btn = popup.querySelector("[data-action='explain-hide']");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    activeExplainState = null;
    rebindPopup(popup, word, senses, activeIndex, anchor);
  });
}

function bindExplainButton(popup, word, senses, activeIndex, anchor) {
  const btn = popup.querySelector("[data-action='explain']");
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!isLoggedIn()) {
      hidePopup();
      openAuthPanel();
      return;
    }

    await runExplain(word, senses, activeIndex, anchor);
  });
}

async function runExplain(word, senses, activeIndex, anchor, { allowDemo = false } = {}) {
  const popup = document.getElementById("popup");
  if (!popup || !anchor) return;

  const sense = senses[activeIndex];
  const segments = segmentsForExplain(sense, anchor);
  const translation =
    sense?.translation ||
    anchor?.dataset?.translation ||
    sense?.gloss ||
    "";
  const { verseHe, verseEn, verseRef } = getVerseContext(anchor);
  const key = explainCacheKey(word, sense, verseRef);

  const cached = getCachedExplanation({
    verseRef,
    surface: word,
    strongs: sense?.strongs
  });

  if (cached) {
    activeExplainState = { key, sections: cached };
    rebindPopup(popup, word, senses, activeIndex, anchor);
    return;
  }

  if (activeExplainState?.loading && activeExplainState.key === key) return;

  activeExplainState = { key, loading: true };
  rebindPopup(popup, word, senses, activeIndex, anchor);

  try {
    if (!isLoggedIn() && allowDemo) {
      // Walkthrough demo for guests — same layout as a real Explain
      const surface = forHebrewDisplay(word) || word;
      activeExplainState = {
        key,
        sections: {
          prefix: null,
          root: {
            he: surface,
            en: sense?.gloss || "Core meaning of this word."
          },
          suffix: null,
          literal: sense?.gloss || "A plain sense of this form.",
          grammar:
            "In a real Explain, this note shows how the form works in the verse.",
          takeaway: sense?.gloss || null
        }
      };
      rebindPopup(popup, word, senses, activeIndex, anchor);
      return;
    }

    const sections = await explainWord({
      surface: word,
      lemma: sense?.lemma || "",
      gloss: sense?.gloss || "",
      strongs: sense?.strongs || "",
      morph: sense?.morph || "",
      segments,
      translation,
      verseHe,
      verseEn,
      verseRef
    });
    if (activeExplainState?.key !== key) return;
    activeExplainState = { key, sections };
    rebindPopup(popup, word, senses, activeIndex, anchor);
  } catch (err) {
    if (activeExplainState?.key !== key) return;
    if (allowDemo) {
      const surface = forHebrewDisplay(word) || word;
      activeExplainState = {
        key,
        sections: {
          prefix: null,
          root: {
            he: surface,
            en: sense?.gloss || "Core meaning of this word."
          },
          suffix: null,
          literal: sense?.gloss || "A plain sense of this form.",
          grammar:
            "In a real Explain, this note shows how the form works in the verse.",
          takeaway: sense?.gloss || null
        }
      };
    } else {
      activeExplainState = {
        key,
        error: err?.message || "Could not explain this word."
      };
    }
    rebindPopup(popup, word, senses, activeIndex, anchor);
  }
}

/** Force-open Explain during the walkthrough (demo for guests). */
export async function openExplainForWalkthrough() {
  if (!activePopupData || !activeAnchor) return;
  setPopupWalkthroughHold(true);
  await runExplain(
    activePopupData.word,
    activePopupData.senses,
    activeSenseIndex,
    activeAnchor,
    { allowDemo: true }
  );
}

/** Collapse Explain back to the simple gloss popup. */
export function collapseExplainForWalkthrough() {
  if (!activePopupData || !activeAnchor) return;
  const popup = document.getElementById("popup");
  if (!popup) return;
  activeExplainState = null;
  rebindPopup(
    popup,
    activePopupData.word,
    activePopupData.senses,
    activeSenseIndex,
    activeAnchor
  );
}

/** Client rect for a popup action button (explain | word-bank). */
export function getPopupActionRect(action) {
  const btn = document.querySelector(`#popup [data-action='${action}']`);
  if (!btn) return null;
  const rect = btn.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  const padX = 6;
  const padY = 4;
  return {
    top: rect.top - padY,
    left: rect.left - padX,
    width: rect.width + padX * 2,
    height: rect.height + padY * 2,
    bottom: rect.bottom + padY,
    right: rect.right + padX
  };
}

function bindWordBankButton(popup, word, senses, activeIndex, anchor) {
  const btn = popup.querySelector("[data-action='word-bank']");
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!isLoggedIn()) {
      hidePopup();
      openAuthPanel();
      return;
    }

    const sense = senses[activeIndex];
    if (!sense?.strongs) return;

    btn.disabled = true;

    try {
      await toggleWord({
        strongs: sense.strongs,
        lemma: sense.lemma,
        gloss: sense.gloss,
        surfaceExample: word
      });

      rebindPopup(popup, word, senses, activeIndex, anchor);
    } catch {
      btn.disabled = false;
    }
  });
}

function bindKnowThisButton(popup, word, senses, activeIndex, anchor) {
  const btn = popup.querySelector("[data-action='know-word']");
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!isLoggedIn()) {
      hidePopup();
      openAuthPanel();
      return;
    }

    const sense = senses[activeIndex];
    if (!sense?.strongs || isWordLearned(sense.strongs)) return;

    btn.disabled = true;

    try {
      await markWordLearned({
        strongs: sense.strongs,
        lemma: sense.lemma,
        gloss: sense.gloss,
        surfaceExample: word
      });
      rebindPopup(popup, word, senses, activeIndex, anchor);
    } catch {
      btn.disabled = false;
    }
  });
}

function bindPopupTabs(popup, word, senses, anchor) {
  popup.querySelectorAll(".popup-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(tab.dataset.index);
      activeSenseIndex = index;
      activeExplainState = null;
      rebindPopup(popup, word, senses, index, anchor);
    });
  });
}

function refreshOpenPopup() {
  if (!activeAnchor || !activePopupData) return;

  const popup = document.getElementById("popup");
  if (popup.style.display !== "block") return;

  const { word, senses } = activePopupData;
  rebindPopup(popup, word, senses, activeSenseIndex, activeAnchor);
}

export function showPopup(data, anchor) {
  const popup = document.getElementById("popup");

  if (activeAnchor === anchor && popup.style.display === "block") {
    if (holdOpenForWalkthrough) return;
    hidePopup();
    return;
  }

  if (activeAnchor && activeAnchor !== anchor) {
    activeAnchor.classList.remove("popup-active", "is-on-white");
  }

  activeAnchor = anchor;
  const onWhite = Boolean(
    anchor.closest(".daily-vocab-item.is-white, .practice-story-card")
  );
  anchor.classList.add("popup-active");
  anchor.classList.toggle("is-on-white", onWhite);
  activeSenseIndex = 0;

  const senses = data.senses || [
    {
      gloss: data.gloss,
      strongs: data.strongs,
      pron: data.pron,
      rank: data.rank ?? null
    }
  ];

  activePopupData = { word: data.word, senses };

  // Always open the simple view; Explain is opt-in (cache still used when they tap Explain)
  activeExplainState = null;

  popup.classList.toggle("is-on-white", onWhite);
  rebindPopup(popup, data.word, senses, activeSenseIndex, anchor);
}

export function initPopupHandlers(onWordClick) {
  onWordBankChange(() => refreshOpenPopup());
  onLearnedWordsChange(() => refreshOpenPopup());

  document.getElementById("content").addEventListener("click", (e) => {
    const word = e.target.closest(".word");
    if (!word) return;

    onWordClick(word);
  });

  document.getElementById("dailyVocabList")?.addEventListener("click", (e) => {
    const word = e.target.closest(".word");
    if (!word) return;

    onWordClick(word);
  });

  document.getElementById("practiceStoryHebrew")?.addEventListener("click", (e) => {
    const word = e.target.closest(".word");
    if (!word) return;

    onWordClick(word);
  });

  // Capture phase so "click off" closes the whole popup even over dense verse text
  document.addEventListener(
    "pointerdown",
    (e) => {
      const popup = document.getElementById("popup");
      if (!popup || popup.style.display !== "block") return;
      if (popup.contains(e.target)) return;

      const word = e.target.closest(".word");
      // Same or different word — leave it to the click → showPopup toggle/switch
      if (word) {
        if (holdOpenForWalkthrough && word === activeAnchor) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Walkthrough is demoing the popup — don't dismiss on outside taps
      if (holdOpenForWalkthrough) return;

      // Click outside the popup: close fully
      hidePopup();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePopup();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!activeAnchor) return;

      const popup = document.getElementById("popup");
      if (popup.style.display !== "block") return;

      if (isDockedPopup()) {
        positionDockedPopup(popup);
        return;
      }

      const popupRect = popup.getBoundingClientRect();
      if (popupRect.bottom <= 0) {
        hidePopup();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "resize",
    () => {
      if (!activeAnchor) return;

      const popup = document.getElementById("popup");
      if (popup.style.display !== "block" || !isDockedPopup()) return;

      positionDockedPopup(popup);
    },
    { passive: true }
  );
}
