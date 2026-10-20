import {
  WALKTHROUGH_STEPS,
  markWalkthroughDone
} from "../core/walkthrough.js";
import { TORAH_STRONGS_TOTAL } from "../core/difficulty.js";
import { hidePopup, setPopupWalkthroughHold, openExplainForWalkthrough, collapseExplainForWalkthrough, getPopupActionRect } from "./popup.js";

let bound = false;
let stepIndex = 0;
/** @type {{ ensureReading?: () => Promise<void>, ensureHome?: () => Promise<void>, openWordPopup?: (word: HTMLElement) => void } | null} */
let api = null;
let spotEl = null;
/** @type {null | (() => DOMRect | null)} */
let spotRectFn = null;
let repositionTimer = null;
/** True when walkthrough forced the signed-out progress bar visible */
let forcedProgressVisible = false;

function els() {
  return {
    panel: document.getElementById("walkthroughPanel"),
    card: document.querySelector("#walkthroughPanel .walkthrough-card"),
    tip: document.getElementById("walkthroughTip"),
    hole: document.getElementById("walkthroughHole"),
    status: document.getElementById("walkthroughStatus"),
    title: document.getElementById("walkthroughTitle"),
    body: document.getElementById("walkthroughBody"),
    visual: document.getElementById("walkthroughVisual"),
    tipStatus: document.getElementById("walkthroughTipStatus"),
    tipTitle: document.getElementById("walkthroughTipTitle"),
    tipBody: document.getElementById("walkthroughTipBody"),
    backBtn: document.getElementById("walkthroughBackBtn"),
    nextBtn: document.getElementById("walkthroughNextBtn"),
    skipBtn: document.getElementById("walkthroughSkipBtn"),
    tipBackBtn: document.getElementById("walkthroughTipBackBtn"),
    tipNextBtn: document.getElementById("walkthroughTipNextBtn"),
    tipSkipBtn: document.getElementById("walkthroughTipSkipBtn"),
    closeBtn: document.querySelector("#walkthroughPanel .walkthrough-close")
  };
}

function restoreForcedProgress() {
  if (!forcedProgressVisible) return;
  forcedProgressVisible = false;
  const progress = document.getElementById("difficultyProgress");
  if (!progress) return;
  progress.hidden = true;
  progress.classList.remove("is-chrome-visible");
}

function prepareDifficultyProgressForTip() {
  const progress = document.getElementById("difficultyProgress");
  const fill = document.getElementById("difficultyProgressFill");
  const meta = document.getElementById("difficultyProgressMeta");
  if (!progress) return;

  const needsForce =
    progress.hidden ||
    progress.getBoundingClientRect().height < 4;
  if (!needsForce) return;

  forcedProgressVisible = true;
  progress.hidden = false;
  progress.classList.add("is-chrome-visible");
  if (fill) {
    fill.style.transition = "none";
    fill.style.width = fill.style.width || "0%";
  }
  if (meta && !meta.textContent.trim()) {
    meta.textContent = `0 / ${TORAH_STRONGS_TOTAL.toLocaleString("en-US")}`;
  }
}

function clearSpot() {
  if (spotEl) {
    spotEl.classList.remove("walkthrough-spot");
    spotEl = null;
  }
  spotRectFn = null;
  restoreForcedProgress();
}

function hideHole() {
  const hole = els().hole;
  if (!hole) return;
  hole.classList.remove("is-visible");
  hole.hidden = true;
  hole.style.top = "";
  hole.style.left = "";
  hole.style.width = "";
  hole.style.height = "";
}

function hideTip() {
  const tip = els().tip;
  if (!tip) return;
  tip.classList.remove("is-visible");
  tip.hidden = true;
  tip.style.visibility = "";
  tip.style.top = "";
  tip.style.left = "";
  tip.style.transform = "";
}

function unionClientRects(
  elements,
  { padX = 8, padTop = 8, padBottom = 8 } = {}
) {
  const rects = elements
    .filter(Boolean)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return null;

  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return {
    top: top - padTop,
    left: left - padX,
    width: right - left + padX * 2,
    height: bottom - top + padTop + padBottom,
    bottom: bottom + padBottom,
    right: right + padX
  };
}

function getReadingSelectRect() {
  // Title through Diaspora/Israel — clip to the buttons, not #controls padding
  return unionClientRects(
    [
      document.getElementById("title"),
      document.querySelector("#controls .aliyah-section"),
      document.getElementById("diasporaTabs")
    ],
    { padX: 4, padTop: 4, padBottom: 0 }
  );
}

function getDifficultyRect() {
  // Clip to the tab row itself — not the full-bleed bar or tip-2 width
  return unionClientRects([document.getElementById("difficultyTabs")], {
    padX: 0,
    padTop: 0,
    padBottom: 0
  });
}

function getDifficultyProgressRect() {
  const tabs = getDifficultyRect();
  const content = unionClientRects(
    [
      document.querySelector("#difficultyProgress .difficulty-progress-track"),
      document.querySelector("#difficultyProgress .difficulty-progress-meta"),
      document.getElementById("difficultyProgress")
    ],
    { padX: 0, padTop: 0, padBottom: 0 }
  );
  if (!content && !tabs) return null;

  // Start flush under the level buttons; +20px wider than tabs; 10px below content
  const baseLeft = tabs ? tabs.left : content.left;
  const baseWidth = tabs ? tabs.width : content.width;
  const widen = 20;
  const padBottom = 10;
  const left = baseLeft - widen / 2;
  const width = baseWidth + widen;
  const top = tabs ? tabs.bottom : content.top;
  const bottom = (content ? content.bottom : top) + padBottom;
  return {
    top,
    left,
    width,
    height: bottom - top,
    bottom,
    right: left + width
  };
}

function getHomeStartRect() {
  // CTAs mentioned in tip 9 — only visible ones
  return unionClientRects(
    [
      document.getElementById("homePlacementBtn"),
      document.getElementById("homeThreeBtn"),
      document.getElementById("homeTodayBtn"),
      document.getElementById("homeSignInBtn")
    ],
    { padX: 8, padTop: 8, padBottom: 8 }
  );
}

function rectForAnchor(anchor) {
  if (anchor === "reading-controls") return getReadingSelectRect();
  if (anchor === "difficulty-controls") return getDifficultyRect();
  if (anchor === "difficulty-progress") return getDifficultyProgressRect();
  if (anchor === "home-start") return getHomeStartRect();
  return null;
}

function positionHoleFromRect(rect) {
  const hole = els().hole;
  if (!hole || !rect) return;

  hole.hidden = false;
  hole.style.top = `${Math.round(rect.top)}px`;
  hole.style.left = `${Math.round(rect.left)}px`;
  hole.style.width = `${Math.round(rect.width)}px`;
  hole.style.height = `${Math.round(rect.height)}px`;
}

function positionHole(anchor) {
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  positionHoleFromRect({
    top: rect.top - 4,
    left: rect.left - 6,
    width: rect.width + 12,
    height: rect.height + 8
  });
}

function findSpotlightWord() {
  return (
    document.querySelector("#content .word:not(.no-highlight)") ||
    document.querySelector("#content .word")
  );
}

/** Wait until entrance reveal has finished (every word shown). */
async function waitForReadingRevealDone(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const words = document.querySelectorAll("#content .word");
    if (words.length) {
      const pending = document.querySelectorAll(
        "#content .word.word-reveal:not(.word-shown)"
      );
      if (pending.length === 0) {
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
        return;
      }
    }
    await new Promise((r) => window.setTimeout(r, 50));
  }
}

async function waitForRegionReady(anchor, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (anchor === "difficulty-progress") {
      const progress = document.getElementById("difficultyProgress");
      const rect = rectForAnchor(anchor);
      if (progress && !progress.hidden && rect && rect.height > 8) return;
    } else {
      const aliyah = document.getElementById("aliyahTabs");
      const difficulty = document.getElementById("difficultyTabs");
      const hasTabs =
        anchor === "difficulty-controls"
          ? difficulty && difficulty.children.length > 0
          : aliyah && aliyah.children.length > 0;
      const rect = rectForAnchor(anchor);
      if (hasTabs && rect && rect.height > 20) return;
    }
    await new Promise((r) => window.setTimeout(r, 50));
  }
}

const REGION_ANCHORS = new Set([
  "reading-controls",
  "difficulty-controls",
  "difficulty-progress"
]);

function positionTipFromRect(rect, { force = false } = {}) {
  const tip = els().tip;
  if (!tip || !rect) return;
  if (tip.hidden && !force) return;

  const gap = 12;
  const pad = 12;
  const tipWidth = tip.offsetWidth || Math.min(340, window.innerWidth - 24);
  const tipHeight = tip.offsetHeight || 200;

  let top = rect.bottom + gap;
  let left = rect.left + rect.width / 2 - tipWidth / 2;

  if (top + tipHeight > window.innerHeight - pad) {
    top = rect.top - tipHeight - gap;
  }
  if (top < pad) top = pad;

  left = Math.max(pad, Math.min(left, window.innerWidth - tipWidth - pad));

  tip.style.transform = "";
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
}

function positionTip(anchor, { force = false } = {}) {
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  positionTipFromRect(rect, { force });
}

function placeSpotlightChromeFromRect(rect, { fadeIn = false } = {}) {
  if (!rect) return;
  const { hole, tip } = els();

  // Only drop opacity when first showing — keep the scrim steady tip-to-tip
  if (fadeIn) {
    if (hole) hole.classList.remove("is-visible");
    if (tip) tip.classList.remove("is-visible");
  }

  positionHoleFromRect(rect);
  if (!tip) return;

  if (fadeIn) {
    tip.style.visibility = "hidden";
    tip.hidden = false;
    positionTipFromRect(rect, { force: true });
    tip.style.visibility = "";
    requestAnimationFrame(() => {
      hole?.classList.add("is-visible");
      tip.classList.add("is-visible");
    });
    return;
  }

  tip.hidden = false;
  tip.classList.add("is-visible");
  hole?.classList.add("is-visible");
  positionTipFromRect(rect, { force: true });
}

function placeSpotlightChrome(anchor, { fadeIn = false, padBottom = 4 } = {}) {
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const padTop = 4;
  const padX = 6;
  placeSpotlightChromeFromRect(
    {
      top: rect.top - padTop,
      left: rect.left - padX,
      width: rect.width + padX * 2,
      height: rect.height + padTop + padBottom,
      bottom: rect.bottom + padBottom,
      right: rect.right + padX
    },
    { fadeIn }
  );
}

function ensureSpotlightPopup(word, { open, openExplain, collapseExplain } = {}) {
  if (!open || !word) {
    if (!open) {
      setPopupWalkthroughHold(false);
      hidePopup();
    }
    return Promise.resolve();
  }
  setPopupWalkthroughHold(true);
  api?.openWordPopup?.(word);

  if (collapseExplain) {
    collapseExplainForWalkthrough();
  }
  if (openExplain) {
    return openExplainForWalkthrough();
  }
  return Promise.resolve();
}

function scheduleReposition() {
  if (repositionTimer) window.clearTimeout(repositionTimer);
  repositionTimer = window.setTimeout(() => {
    if (spotRectFn) {
      const rect = spotRectFn();
      if (rect) {
        positionHoleFromRect(rect);
        positionTipFromRect(rect);
      }
      return;
    }
    if (!spotEl) return;
    positionHole(spotEl);
    positionTip(spotEl);
  }, 50);
}

function fillTipCopy(step) {
  const { tipStatus, tipTitle, tipBody, tipBackBtn, tipNextBtn } = els();
  const total = WALKTHROUGH_STEPS.length;
  if (tipStatus) tipStatus.textContent = `${stepIndex + 1} of ${total}`;
  if (tipTitle) tipTitle.textContent = step.title;
  if (tipBody) tipBody.textContent = step.body;
  if (tipBackBtn) tipBackBtn.hidden = stepIndex === 0;
  if (tipNextBtn) {
    tipNextBtn.textContent = step.nextLabel
      ? step.nextLabel
      : stepIndex >= total - 1
        ? "Finish"
        : "Next";
  }
}

function isSpotlightChromeVisible() {
  const { panel, hole } = els();
  return Boolean(
    panel &&
      !panel.hidden &&
      panel.classList.contains("is-spotlight") &&
      hole &&
      !hole.hidden &&
      hole.classList.contains("is-visible")
  );
}

async function showSpotlight(step) {
  const { panel, card, tip } = els();
  if (!panel) return;

  const continuing = isSpotlightChromeVisible();

  clearSpot();
  if (card) card.hidden = true;
  panel.classList.add("is-spotlight");

  // First spotlight: stay out of the way until ready, then fade in.
  // Later tips: keep the dim overlay up and only move the cutout/tip.
  if (!continuing) {
    hideTip();
    hideHole();
    panel.hidden = true;
  }

  const needsReading =
    step.anchor === "first-underline" ||
    step.anchor === "popup-save" ||
    REGION_ANCHORS.has(step.anchor);
  if (needsReading && api?.ensureReading) {
    await api.ensureReading();
  }

  if (step.anchor === "home-start" && api?.ensureHome) {
    setPopupWalkthroughHold(false);
    hidePopup();
    await api.ensureHome();
  }

  fillTipCopy(step);

  if (step.anchor === "home-start") {
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
    // Home layout can settle after chrome refresh
    await new Promise((r) => window.setTimeout(r, 80));

    spotRectFn = () => getHomeStartRect();
    const rect = getHomeStartRect();
    panel.hidden = false;
    if (!rect) {
      if (tip) {
        tip.hidden = false;
        tip.style.top = "50%";
        tip.style.left = "50%";
        tip.style.transform = "translate(-50%, -50%)";
        tip.classList.add("is-visible");
      }
      return;
    }
    placeSpotlightChromeFromRect(rect, { fadeIn: !continuing });
    return;
  }

  if (REGION_ANCHORS.has(step.anchor)) {
    if (step.anchor === "difficulty-progress") {
      prepareDifficultyProgressForTip();
    }
    await waitForRegionReady(step.anchor);
    window.scrollTo(0, 0);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );

    spotRectFn = () => rectForAnchor(step.anchor);
    const rect = rectForAnchor(step.anchor);
    panel.hidden = false;
    if (!rect) {
      if (tip) {
        tip.hidden = false;
        tip.style.top = "50%";
        tip.style.left = "50%";
        tip.style.transform = "translate(-50%, -50%)";
        tip.classList.add("is-visible");
      }
      return;
    }
    placeSpotlightChromeFromRect(rect, { fadeIn: !continuing });
    return;
  }

  await waitForReadingRevealDone();

  const word = findSpotlightWord();
  panel.hidden = false;

  if (!word) {
    if (tip) {
      tip.hidden = false;
      tip.style.top = "50%";
      tip.style.left = "50%";
      tip.style.transform = "translate(-50%, -50%)";
      tip.classList.add("is-visible");
    }
    return;
  }

  spotEl = word;
  word.classList.add("walkthrough-spot");
  word.scrollIntoView({ block: "center", behavior: "auto" });

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  await ensureSpotlightPopup(word, {
    open: Boolean(step.openPopup),
    openExplain: Boolean(step.openExplain),
    collapseExplain: Boolean(step.collapseExplain)
  });

  // Popup width animates when Explain opens/closes
  if (step.openExplain || step.collapseExplain) {
    await new Promise((r) => window.setTimeout(r, 380));
  }

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (step.anchor === "popup-save") {
    spotRectFn = () => getPopupActionRect("word-bank");
    const rect = getPopupActionRect("word-bank");
    if (rect) {
      placeSpotlightChromeFromRect(rect, { fadeIn: !continuing });
    } else {
      placeSpotlightChrome(word, {
        fadeIn: !continuing,
        padBottom: step.underlinePadBottom ?? 4
      });
    }
    return;
  }

  spotRectFn = null;
  placeSpotlightChrome(word, {
    fadeIn: !continuing,
    padBottom: step.underlinePadBottom ?? 4
  });
}

function showCard(step) {
  const {
    panel,
    card,
    tip,
    status,
    title,
    body,
    visual,
    backBtn,
    nextBtn
  } = els();
  if (!panel) return;

  clearSpot();
  hideTip();
  hideHole();
  setPopupWalkthroughHold(false);
  hidePopup();
  panel.hidden = false;
  panel.classList.remove("is-spotlight");
  if (card) card.hidden = false;

  const total = WALKTHROUGH_STEPS.length;
  if (status) status.textContent = `${stepIndex + 1} of ${total}`;
  if (title) title.textContent = step.title;
  if (body) body.textContent = step.body;

  if (visual) {
    visual.hidden = true;
    visual.innerHTML = "";
  }

  if (backBtn) backBtn.hidden = stepIndex === 0;
  if (nextBtn) {
    if (stepIndex >= total - 1) {
      nextBtn.textContent = "Finish";
    } else if (step.nextLabel) {
      nextBtn.textContent = step.nextLabel;
    } else {
      nextBtn.textContent = "Next";
    }
  }
}

async function renderStep() {
  const step = WALKTHROUGH_STEPS[stepIndex];
  if (!step) return;

  if (step.mode === "spotlight") {
    await showSpotlight(step);
  } else {
    showCard(step);
  }
}

function finish() {
  markWalkthroughDone();
  closeWalkthrough();
}

export function closeWalkthrough() {
  const { panel, card } = els();
  clearSpot();
  hideTip();
  hideHole();
  setPopupWalkthroughHold(false);
  hidePopup();
  if (panel) {
    panel.hidden = true;
    panel.classList.remove("is-spotlight");
  }
  if (card) card.hidden = false;
  stepIndex = 0;
}

export async function openWalkthrough({ fromStart = true } = {}) {
  const { panel } = els();
  if (!panel) return;
  if (fromStart) stepIndex = 0;
  panel.hidden = false;
  await renderStep();
}

async function goNext() {
  if (stepIndex >= WALKTHROUGH_STEPS.length - 1) {
    finish();
    return;
  }
  stepIndex += 1;
  await renderStep();
}

async function goBack() {
  if (stepIndex <= 0) return;
  stepIndex -= 1;
  await renderStep();
}

export function initWalkthroughOverlay(handlers = {}) {
  if (bound) {
    api = handlers;
    return;
  }
  bound = true;
  api = handlers;

  const {
    panel,
    backBtn,
    nextBtn,
    skipBtn,
    tipBackBtn,
    tipNextBtn,
    tipSkipBtn,
    closeBtn
  } = els();
  if (!panel) return;

  panel.querySelector(".walkthrough-backdrop")?.addEventListener("click", () => {
    // In spotlight mode, don't dismiss on backdrop—context is the point
    if (panel.classList.contains("is-spotlight")) return;
    finish();
  });

  closeBtn?.addEventListener("click", () => finish());
  skipBtn?.addEventListener("click", () => finish());
  tipSkipBtn?.addEventListener("click", () => finish());

  backBtn?.addEventListener("click", () => goBack());
  tipBackBtn?.addEventListener("click", () => goBack());
  nextBtn?.addEventListener("click", () => goNext());
  tipNextBtn?.addEventListener("click", () => goNext());

  window.addEventListener("resize", scheduleReposition, { passive: true });
  window.addEventListener("scroll", scheduleReposition, { passive: true });
}
