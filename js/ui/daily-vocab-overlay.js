import {
  getDailyVocabCache,
  markDailyVocabDismissed,
  markVerseComplete,
  markNeedsPractice,
  shouldOfferDailyVocab
} from "../core/daily-vocab.js";
import { renderPracticeVerse } from "./render.js";
import { hidePopup } from "./popup.js";

let escapeBound = false;
let actionsBound = false;
let currentCache = null;
let currentIndex = 0;
let animating = false;
let advancing = false;

function els() {
  return {
    panel: document.getElementById("dailyVocabPanel"),
    card: document.querySelector("#dailyVocabPanel .daily-vocab-card"),
    list: document.getElementById("dailyVocabList"),
    status: document.getElementById("dailyVocabStatus"),
    prevBtn: document.getElementById("dailyVocabPrevBtn"),
    nextBtn: document.getElementById("dailyVocabNextBtn")
  };
}

function setLoadingState(loading) {
  const { panel } = els();
  panel?.classList.toggle("is-loading", loading);
}

function setStatus(message, { error = false } = {}) {
  const { status } = els();
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("is-error", error);
}

export function hideDailyVocabOverlay() {
  const { panel, card } = els();
  if (panel) panel.hidden = true;
  setLoadingState(false);
  if (card) {
    card.style.height = "";
    card.style.width = "";
    card.style.transform = "";
    card.style.transition = "";
    card.style.overflow = "";
  }
  currentCache = null;
  currentIndex = 0;
  animating = false;
  advancing = false;
  hidePopup();
}

export function showDailyVocabLoading() {
  const { panel, list, prevBtn, nextBtn, card } = els();
  if (!panel) return;
  panel.hidden = false;
  if (card) {
    card.hidden = false;
    card.style.height = "";
    card.style.transition = "";
  }
  setLoadingState(true);
  if (list) list.innerHTML = "";
  if (prevBtn) prevBtn.hidden = true;
  if (nextBtn) nextBtn.hidden = true;
  setStatus("Loading practice words...");
}

function closeAndDismiss() {
  markDailyVocabDismissed();
  hideDailyVocabOverlay();
}

function buildItemElement(item, completed, index) {
  const card = document.createElement("article");
  card.className = "daily-vocab-item";
  card.classList.add(index % 2 === 0 ? "is-tan" : "is-white");
  if (completed.has(item.strongs)) {
    card.classList.add("is-complete");
  }
  card.dataset.strongs = item.strongs;

  const meta = document.createElement("div");
  meta.className = "daily-vocab-item-root";

  const rootWord = document.createElement("span");
  rootWord.className = "word";
  rootWord.lang = "he";
  rootWord.dir = "rtl";
  rootWord.textContent =
    item.lemma || item.surface_example || item.displayRef || "";
  rootWord.dataset.word = rootWord.textContent;
  if (item.strongs) rootWord.dataset.strongs = item.strongs;
  meta.appendChild(rootWord);

  const verseHost = document.createElement("div");
  verseHost.className = "daily-vocab-verse-host";
  renderPracticeVerse(verseHost, item, {
    forceHighlightStrongs: item.strongs,
    forceHighlightSurface: item.targetSurfacePlain || item.targetSurface
  });

  const englishEl = verseHost.querySelector(".english");
  if (englishEl) {
    englishEl.hidden = true;
    englishEl.classList.add("daily-vocab-english");
  }

  const englishToggle = document.createElement("button");
  englishToggle.type = "button";
  englishToggle.className = "daily-vocab-show-english";
  englishToggle.textContent = "Show English";
  englishToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!englishEl) return;
    const showing = !englishEl.hidden;
    englishEl.hidden = showing;
    englishToggle.textContent = showing ? "Show English" : "Hide English";
  });

  const actions = document.createElement("div");
  actions.className = "daily-vocab-item-actions";

  const needBtn = document.createElement("button");
  needBtn.type = "button";
  needBtn.className = "daily-vocab-need-btn is-default";
  needBtn.dataset.strongs = item.strongs;
  needBtn.dataset.outcome = "need";
  needBtn.textContent = "Need practice";
  needBtn.setAttribute("aria-pressed", "true");

  const gotItBtn = document.createElement("button");
  gotItBtn.type = "button";
  gotItBtn.className = "daily-vocab-got-it-btn";
  gotItBtn.dataset.strongs = item.strongs;
  gotItBtn.dataset.outcome = "got";
  gotItBtn.setAttribute("aria-pressed", "false");

  const gotItLabel = document.createElement("span");
  gotItLabel.className = "daily-vocab-got-it-label";
  gotItLabel.textContent = "Got it";

  const gotItCheck = document.createElement("span");
  gotItCheck.className = "daily-vocab-got-it-check";
  gotItCheck.setAttribute("aria-hidden", "true");
  gotItCheck.innerHTML =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><polyline points="4 12 10 18 20 6"></polyline></svg>';

  gotItBtn.appendChild(gotItLabel);
  gotItBtn.appendChild(gotItCheck);

  actions.appendChild(needBtn);
  actions.appendChild(gotItBtn);

  card.appendChild(meta);
  card.appendChild(verseHost);
  card.appendChild(englishToggle);
  card.appendChild(actions);
  return card;
}

function updateNavButtons() {
  const { prevBtn, nextBtn } = els();
  if (!currentCache?.items?.length) return;
  if (prevBtn) prevBtn.hidden = currentIndex <= 0;
  if (nextBtn) {
    nextBtn.hidden = false;
    const isLast = currentIndex >= currentCache.items.length - 1;
    nextBtn.textContent = isLast ? "Done" : "Next";
  }
}

function renderCurrent({ animateFrom = null, direction = "next" } = {}) {
  const { list } = els();
  if (!list || !currentCache?.items?.length) return;

  const completed = new Set(currentCache.completed || []);
  const item = currentCache.items[currentIndex];
  if (!item) return;

  const incoming = buildItemElement(item, completed, currentIndex);

  if (!animateFrom) {
    list.innerHTML = "";
    list.appendChild(incoming);
    updateNavButtons();
    return;
  }

  animating = true;
  const outgoing = animateFrom;
  const dirClass = direction === "prev" ? "is-dir-prev" : null;
  list.style.minHeight = `${Math.max(outgoing.offsetHeight, 280)}px`;
  outgoing.classList.add("is-leaving");
  incoming.classList.add("is-entering");
  if (dirClass) {
    outgoing.classList.add(dirClass);
    incoming.classList.add(dirClass);
  }
  list.appendChild(incoming);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      outgoing.classList.add("is-leave-active");
      incoming.classList.add("is-enter-active");
    });
  });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    outgoing.remove();
    incoming.classList.remove("is-entering", "is-enter-active", "is-dir-prev");
    list.style.minHeight = "";
    animating = false;
    advancing = false;
    updateNavButtons();
  };

  incoming.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 550);
}

function goNext() {
  if (animating || !currentCache?.items?.length) return;

  if (currentIndex >= currentCache.items.length - 1) {
    closeAndDismiss();
    return;
  }

  const { list } = els();
  const currentEl = list?.querySelector(".daily-vocab-item");
  currentIndex += 1;
  hidePopup();
  renderCurrent({ animateFrom: currentEl, direction: "next" });
}

function goPrev() {
  if (animating || !currentCache?.items?.length || currentIndex <= 0) return;

  const { list } = els();
  const currentEl = list?.querySelector(".daily-vocab-item");
  currentIndex -= 1;
  hidePopup();
  renderCurrent({ animateFrom: currentEl, direction: "prev" });
}

function advanceAfterOutcome(delayMs) {
  if (advancing) return;
  advancing = true;
  window.setTimeout(() => {
    goNext();
  }, delayMs);
}

function bindItemActions() {
  if (actionsBound) return;
  actionsBound = true;

  const { list, prevBtn, nextBtn } = els();

  list?.addEventListener("click", (e) => {
    const needBtn = e.target.closest(".daily-vocab-need-btn");
    const gotBtn = e.target.closest(".daily-vocab-got-it-btn");
    if (!needBtn && !gotBtn) return;
    e.stopPropagation();

    const actionBtns = list.querySelectorAll(
      ".daily-vocab-need-btn, .daily-vocab-got-it-btn"
    );
    actionBtns.forEach((el) => {
      el.disabled = true;
    });

    if (needBtn) {
      const strongs = needBtn.dataset.strongs;
      const next = markNeedsPractice(strongs);
      if (next) currentCache = next;
      needBtn.classList.remove("is-default");
      needBtn.classList.add("is-selected");
      needBtn.setAttribute("aria-pressed", "true");
      needBtn
        .closest(".daily-vocab-item")
        ?.querySelector(".daily-vocab-got-it-btn")
        ?.setAttribute("aria-pressed", "false");
      advanceAfterOutcome(320);
      return;
    }

    if (gotBtn) {
      const strongs = gotBtn.dataset.strongs;
      const next = markVerseComplete(strongs);
      if (next) currentCache = next;
      const needSibling = gotBtn
        .closest(".daily-vocab-item")
        ?.querySelector(".daily-vocab-need-btn");
      needSibling?.classList.remove("is-default", "is-selected");
      needSibling?.setAttribute("aria-pressed", "false");
      gotBtn.classList.add("is-celebrating");
      gotBtn.setAttribute("aria-pressed", "true");
      gotBtn.setAttribute("aria-label", "Got it");
      advanceAfterOutcome(480);
    }
  });

  prevBtn?.addEventListener("click", () => goPrev());
  nextBtn?.addEventListener("click", () => goNext());
}

export function showDailyVocabOverlay(cache) {
  const { panel, card } = els();
  if (!panel || !card || !cache?.items?.length) return;

  currentCache = cache;
  currentIndex = 0;
  animating = false;
  advancing = false;
  panel.hidden = false;
  card.hidden = false;

  const fromRect = card.getBoundingClientRect();

  panel.classList.remove("is-loading");
  setStatus("");
  renderCurrent();
  bindItemActions();

  const toRect = card.getBoundingClientRect();
  const toHeight = card.scrollHeight;
  const toWidth = toRect.width;
  const deltaY = fromRect.top - toRect.top;

  // FLIP: keep the loading box visually in place, then grow + slide up together.
  card.style.height = `${fromRect.height}px`;
  card.style.width = `${fromRect.width}px`;
  card.style.transform = `translateY(${deltaY}px)`;
  card.style.overflow = "hidden";
  void card.offsetHeight;

  const ease = "0.5s cubic-bezier(0.22, 1, 0.36, 1)";
  card.style.transition = `height ${ease}, width ${ease}, transform ${ease}`;
  card.style.height = `${toHeight}px`;
  card.style.width = `${toWidth}px`;
  card.style.transform = "translateY(0)";

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    card.style.height = "";
    card.style.width = "";
    card.style.transform = "";
    card.style.transition = "";
    card.style.overflow = "";
  };

  card.addEventListener("transitionend", (e) => {
    if (
      e.propertyName === "height" ||
      e.propertyName === "width" ||
      e.propertyName === "transform"
    ) {
      finish();
    }
  });
  window.setTimeout(finish, 650);
}

export function showDailyVocabError(message) {
  const { panel, list, prevBtn, nextBtn, card } = els();
  if (!panel) return;
  panel.hidden = false;
  if (card) {
    card.hidden = false;
    card.style.height = "";
    card.style.transition = "";
  }
  setLoadingState(true);
  if (list) list.innerHTML = "";
  if (prevBtn) prevBtn.hidden = true;
  if (nextBtn) nextBtn.hidden = true;
  setStatus(message || "Could not load practice verses.", { error: true });
}

export function initDailyVocabOverlay() {
  const { panel } = els();
  if (!panel) return;

  panel.querySelectorAll("[data-daily-vocab-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeAndDismiss());
  });

  if (!escapeBound) {
    escapeBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (panel.hidden) return;
      closeAndDismiss();
    });
  }
}

export function isDailyVocabVisible() {
  const { panel } = els();
  return Boolean(panel && !panel.hidden);
}

export { shouldOfferDailyVocab, getDailyVocabCache };
