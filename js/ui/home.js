import { isLoggedIn } from "../core/auth.js";
import { countLearnedWords, listWords, onLearnedWordsChange, onWordBankChange } from "../core/word-bank.js";
import {
  TORAH_STRONGS_TOTAL,
  TORAH_PROGRESS_BOUNDARIES,
  TORAH_PROGRESS_SECTIONS,
  learnedProgressPercent,
  progressTickPercent,
  progressSectionPercent
} from "../core/difficulty.js";
import { shouldAutoOpenWalkthrough } from "../core/walkthrough.js";
import { openAuthPanel } from "./auth-panel.js";
import { isPlacementDone } from "../core/placement.js";
import { openWalkthrough } from "./walkthrough-overlay.js";

let api = null;
let revealing = false;
let difficultyEntranceTimer = null;
let difficultyCountRaf = null;

function els() {
  return {
    overlay: document.getElementById("homeOverlay"),
    signInBtn: document.getElementById("homeSignInBtn"),
    walkthroughBtn: document.getElementById("homeWalkthroughBtn"),
    progress: document.getElementById("homeProgress"),
    progressMeta: document.getElementById("homeProgressMeta"),
    progressFill: document.getElementById("homeProgressFill"),
    progressMarkers: document.getElementById("homeProgressMarkers"),
    placementBtn: document.getElementById("homePlacementBtn"),
    threeBtn: document.getElementById("homeThreeBtn"),
    todayBtn: document.getElementById("homeTodayBtn"),
    practiceBtn: document.getElementById("homePracticeBtn"),
    storyBtn: document.getElementById("homeStoryBtn"),
    weeklyFlashBtn: document.getElementById("homeWeeklyFlashBtn"),
    loadingHint: document.getElementById("homeLoadingHint")
  };
}

/** Paint a Torah-scale progress bar (shared by home, feedback, difficulty bar). */
export function paintTorahProgress({
  metaEl,
  fillEl,
  markersEl,
  learned = 0,
  animateFrom = null,
  showLabels = true
} = {}) {
  const count = Number(learned) || 0;
  const pct = learnedProgressPercent(count);

  if (metaEl) {
    metaEl.textContent = `${count.toLocaleString("en-US")} / ${TORAH_STRONGS_TOTAL.toLocaleString("en-US")}`;
  }

  const markerKey = `sections-${TORAH_PROGRESS_SECTIONS.map((s) => s.label).join("-")}-${showLabels ? "labels" : "ticks"}`;
  if (markersEl && markersEl.dataset.ready !== markerKey) {
    const ticks = TORAH_PROGRESS_BOUNDARIES.map((_, index) => {
      const edge =
        index === 0
          ? " is-start"
          : index === TORAH_PROGRESS_BOUNDARIES.length - 1
            ? " is-end"
            : "";
      return `<span class="torah-progress-tick${edge}" style="left:${progressTickPercent(index)}%"></span>`;
    }).join("");
    const labels = showLabels
      ? TORAH_PROGRESS_SECTIONS.map(
          (section, index) =>
            `<span class="torah-progress-section-label" style="left:${progressSectionPercent(index)}%">${section.label}</span>`
        ).join("")
      : "";
    markersEl.innerHTML = ticks + labels;
    markersEl.dataset.ready = markerKey;
  }

  if (!fillEl) return;

  if (animateFrom != null) {
    fillEl.style.transition = "none";
    fillEl.style.width = `${learnedProgressPercent(animateFrom)}%`;
    void fillEl.offsetWidth;
    fillEl.style.transition = "";
  }
  fillEl.style.width = `${pct}%`;
}

export function isHomeOpen() {
  return document.body.classList.contains("home-open");
}

export function showHomeOverlay() {
  const { overlay } = els();
  document.body.classList.add("home-open");
  document.body.classList.remove("home-dismissed");
  if (overlay) {
    overlay.hidden = false;
    overlay.classList.remove("is-dismissing");
  }
  refreshHomeChrome();
  if (api?.isReadingReady?.()) {
    setHomeReadingReady(true);
  }
}

function setCtasEnabled(enabled) {
  const { placementBtn, threeBtn, todayBtn, practiceBtn, storyBtn, weeklyFlashBtn } =
    els();
  [placementBtn, threeBtn, todayBtn].forEach((btn) => {
    if (btn && !btn.hidden) btn.disabled = !enabled;
  });
  if (practiceBtn && !practiceBtn.hidden) {
    practiceBtn.disabled = !enabled && revealing;
  }
  if (storyBtn && !storyBtn.hidden) {
    storyBtn.disabled = !enabled && revealing;
  }
  if (weeklyFlashBtn && !weeklyFlashBtn.hidden) {
    weeklyFlashBtn.disabled = !enabled && revealing;
  }
}

export function setHomeReadingReady(ready) {
  const { loadingHint } = els();
  if (loadingHint) loadingHint.hidden = ready;
  if (!revealing) setCtasEnabled(ready);
}

function difficultyProgressEls() {
  return {
    progress: document.getElementById("difficultyProgress"),
    fill: document.getElementById("difficultyProgressFill"),
    meta: document.getElementById("difficultyProgressMeta")
  };
}

function initDifficultyBarSticky() {
  const wrap = document.getElementById("difficultySticky");
  if (!wrap || wrap.dataset.stickyBound === "1") return;
  wrap.dataset.stickyBound = "1";

  let ticking = false;
  const syncStuck = () => {
    ticking = false;
    wrap.classList.toggle("is-stuck", wrap.getBoundingClientRect().top <= 0.5);
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(syncStuck);
    },
    { passive: true }
  );
  window.addEventListener("resize", syncStuck, { passive: true });
  syncStuck();
}

const DIFFICULTY_CHROME_FADE_MS = 550;
const DIFFICULTY_FILL_MS = 2000;

export function cancelDifficultyProgressEntrance() {
  if (difficultyEntranceTimer != null) {
    window.clearTimeout(difficultyEntranceTimer);
    difficultyEntranceTimer = null;
  }
  if (difficultyCountRaf != null) {
    window.cancelAnimationFrame(difficultyCountRaf);
    difficultyCountRaf = null;
  }
}

function growDifficultyFill(learned) {
  const { progress, fill, meta } = difficultyProgressEls();
  if (!progress || !fill || !isLoggedIn()) return;

  const count = Math.max(0, Number(learned) || 0);
  const pct = learnedProgressPercent(count);
  const totalLabel = TORAH_STRONGS_TOTAL.toLocaleString("en-US");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  fill.style.transition = "none";
  fill.style.width = "0%";
  if (meta) meta.textContent = `0 / ${totalLabel}`;
  void fill.offsetWidth;

  if (reducedMotion) {
    fill.style.transition = "";
    fill.style.width = `${pct}%`;
    if (meta) {
      meta.textContent = `${count.toLocaleString("en-US")} / ${totalLabel}`;
    }
    return;
  }

  fill.style.transition = `width ${DIFFICULTY_FILL_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  fill.style.width = `${pct}%`;

  if (!meta || count <= 0) {
    if (meta) {
      meta.textContent = `${count.toLocaleString("en-US")} / ${totalLabel}`;
    }
    return;
  }

  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / DIFFICULTY_FILL_MS);
    const eased = 1 - (1 - t) ** 3;
    const n = Math.round(count * eased);
    meta.textContent = `${n.toLocaleString("en-US")} / ${totalLabel}`;
    if (t < 1) {
      difficultyCountRaf = requestAnimationFrame(tick);
    } else {
      difficultyCountRaf = null;
    }
  };
  difficultyCountRaf = requestAnimationFrame(tick);
}

function playDifficultyProgressEntrance(learned) {
  const { progress, fill, meta } = difficultyProgressEls();
  if (!progress || !fill || !isLoggedIn()) return;

  const totalLabel = TORAH_STRONGS_TOTAL.toLocaleString("en-US");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  progress.hidden = false;
  progress.classList.remove("is-chrome-visible");
  fill.style.transition = "none";
  fill.style.width = "0%";
  if (meta) meta.textContent = `0 / ${totalLabel}`;
  void progress.offsetWidth;

  if (reducedMotion) {
    progress.classList.add("is-chrome-visible");
    growDifficultyFill(learned);
    return;
  }

  requestAnimationFrame(() => {
    progress.classList.add("is-chrome-visible");
  });

  difficultyEntranceTimer = window.setTimeout(() => {
    difficultyEntranceTimer = null;
    growDifficultyFill(learned);
  }, DIFFICULTY_CHROME_FADE_MS);
}

/** Progress bar enters only after Hebrew reveal; fade chrome, then grow fill. */
export function scheduleDifficultyProgressEntrance({ delayMs = 0 } = {}) {
  cancelDifficultyProgressEntrance();
  if (!isLoggedIn()) return;

  const { progress, fill, meta } = difficultyProgressEls();
  if (!progress || !fill) return;

  progress.hidden = true;
  progress.classList.remove("is-chrome-visible");
  fill.style.transition = "none";
  fill.style.width = "0%";
  if (meta) {
    meta.textContent = `0 / ${TORAH_STRONGS_TOTAL.toLocaleString("en-US")}`;
  }

  const run = async () => {
    difficultyEntranceTimer = null;
    let learned = 0;
    try {
      learned = await countLearnedWords();
    } catch {
      learned = 0;
    }
    playDifficultyProgressEntrance(learned);
  };

  if (delayMs <= 0) {
    run();
    return;
  }

  difficultyEntranceTimer = window.setTimeout(run, delayMs);
}

let walkthroughAutoTried = false;

function maybeAutoOpenWalkthrough() {
  // How it works is hidden for now — skip auto-open.
  return;
}

async function refreshHomeChrome() {
  const {
    signInBtn,
    progress,
    progressMeta,
    progressFill,
    progressMarkers,
    placementBtn,
    practiceBtn,
    storyBtn,
    weeklyFlashBtn
  } = els();
  const difficulty = difficultyProgressEls();
  const loggedIn = isLoggedIn();
  const showPlacement = !isPlacementDone();

  if (signInBtn) signInBtn.hidden = loggedIn;

  if (placementBtn) {
    placementBtn.hidden = !showPlacement;
  }

  const showPractice = loggedIn && listWords().length > 0;
  if (practiceBtn) practiceBtn.hidden = !showPractice;
  if (storyBtn) storyBtn.hidden = !showPractice;
  if (weeklyFlashBtn) weeklyFlashBtn.hidden = !loggedIn;

  const practiceCol = document.querySelector(".home-actions-practice");
  if (practiceCol) {
    practiceCol.hidden = !loggedIn;
  }

  if (!loggedIn) {
    if (progress) progress.hidden = true;
    if (difficulty.progress) difficulty.progress.hidden = true;
    maybeAutoOpenWalkthrough();
    return;
  }

  let learned = 0;
  try {
    learned = await countLearnedWords();
  } catch {
    learned = 0;
  }

  if (progress) {
    progress.hidden = false;
    paintTorahProgress({
      metaEl: progressMeta,
      fillEl: progressFill,
      markersEl: progressMarkers,
      learned
    });
  }

  if (difficulty.progress && difficultyEntranceTimer == null && difficultyCountRaf == null) {
    difficulty.progress.hidden = false;
    difficulty.progress.classList.add("is-chrome-visible");
    if (difficulty.fill) difficulty.fill.style.transition = "";
    paintTorahProgress({
      metaEl: difficulty.meta,
      fillEl: difficulty.fill,
      learned
    });
  }
}

function fadeOutOverlay() {
  const { overlay } = els();
  return new Promise((resolve) => {
    if (!overlay) {
      document.body.classList.remove("home-open");
      document.body.classList.add("home-dismissed");
      resolve();
      return;
    }

    overlay.classList.add("is-dismissing");
    const finish = () => {
      document.body.classList.remove("home-open");
      document.body.classList.add("home-dismissed");
      overlay.classList.remove("is-dismissing");
      resolve();
    };

    overlay.addEventListener("transitionend", (e) => {
      if (e.propertyName === "opacity") finish();
    }, { once: true });
    window.setTimeout(finish, 500);
  });
}

async function reveal(mode) {
  if (revealing || !api) return;
  revealing = true;
  setCtasEnabled(false);

  const { loadingHint } = els();
  if (loadingHint) loadingHint.hidden = false;

  try {
    await api.waitUntilReadingReady();
    await api.revealReading(mode);
    await fadeOutOverlay();
  } finally {
    revealing = false;
    setCtasEnabled(true);
    if (loadingHint) loadingHint.hidden = true;
  }
}

/** Dismiss home into reading (used after placement). */
export function startReadingFromHome(mode = "three") {
  return reveal(mode);
}

export function initHomeOverlay(handlers) {
  api = handlers;
  const {
    overlay,
    signInBtn,
    walkthroughBtn,
    placementBtn,
    threeBtn,
    todayBtn,
    practiceBtn,
    storyBtn,
    weeklyFlashBtn
  } = els();

  if (!overlay) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get("read") === "1") {
    document.body.classList.remove("home-open");
    document.body.classList.add("home-dismissed");
    overlay.hidden = true;
  } else {
    showHomeOverlay();
    setHomeReadingReady(false);
  }

  signInBtn?.addEventListener("click", () => openAuthPanel());
  walkthroughBtn?.addEventListener("click", () => {
    openWalkthrough({ fromStart: true });
  });
  placementBtn?.addEventListener("click", () => {
    api?.openPlacement?.();
  });
  threeBtn?.addEventListener("click", () => reveal("three"));
  todayBtn?.addEventListener("click", () => reveal("aliyah"));
  practiceBtn?.addEventListener("click", () => {
    api?.openPractice?.();
  });
  storyBtn?.addEventListener("click", () => {
    api?.openPracticeStory?.();
  });
  weeklyFlashBtn?.addEventListener("click", () => {
    api?.openWeeklyFlash?.();
  });

  onLearnedWordsChange(() => {
    refreshHomeChrome();
  });
  onWordBankChange(() => {
    refreshHomeChrome();
  });

  document.getElementById("siteLogo")?.addEventListener("click", () => {
    showHomeOverlay();
    refreshHomeChrome();
  });

  initDifficultyBarSticky();
  refreshHomeChrome();
}

export function refreshHomeOverlay() {
  refreshHomeChrome();
}
