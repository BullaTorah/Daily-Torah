import { DIFFICULTY_STEPS } from "../core/difficulty.js";
import { persistUserSettings } from "../core/user-settings.js";
import { rerenderCurrent, setRenderState } from "./render.js";

const DIFFICULTY_TAB_BASE_GAP_MS = 100;
const DIFFICULTY_TAB_GAP_MULTIPLIER = 1.25;

let currentDifficulty = 0;
let difficultyTabAnimTimers = [];

export function getCurrentDifficulty() {
  return currentDifficulty;
}

function updateTabUI(value) {
  document.querySelectorAll("#difficultyTabs .segment-tab").forEach((tab) => {
    const active = Number(tab.dataset.value) === value;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function clearDifficultyTabAnimation() {
  difficultyTabAnimTimers.forEach((id) => clearTimeout(id));
  difficultyTabAnimTimers = [];
}

/** Walk the active tab from Beginner up to target (same cadence as aliyah numbers). */
export function animateDifficultyTabs(targetValue = currentDifficulty) {
  clearDifficultyTabAnimation();

  const targetIndex = DIFFICULTY_STEPS.findIndex((s) => s.value === targetValue);
  const finalIndex = targetIndex < 0 ? 0 : targetIndex;
  const finalValue = DIFFICULTY_STEPS[finalIndex].value;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    updateTabUI(finalValue);
    return 0;
  }

  updateTabUI(DIFFICULTY_STEPS[0].value);
  if (finalIndex <= 0) return 0;

  let delay = 0;
  let gap = DIFFICULTY_TAB_BASE_GAP_MS;

  for (let step = 1; step <= finalIndex; step += 1) {
    delay += gap;
    const value = DIFFICULTY_STEPS[step].value;
    difficultyTabAnimTimers.push(setTimeout(() => updateTabUI(value), delay));
    gap *= DIFFICULTY_TAB_GAP_MULTIPLIER;
  }

  return delay;
}

export function setDifficulty(value, { persist = true, rerender = true, animate = false } = {}) {
  currentDifficulty = value;
  setRenderState({ difficulty: value });

  if (persist) {
    persistUserSettings({ difficulty: value });
  }

  if (animate) {
    animateDifficultyTabs(value);
  } else {
    clearDifficultyTabAnimation();
    updateTabUI(value);
  }

  if (rerender) {
    rerenderCurrent();
  }
}

export function initSlider(initialValue) {
  const container = document.getElementById("difficultyTabs");
  if (!container) return DIFFICULTY_STEPS;

  container.innerHTML = "";

  DIFFICULTY_STEPS.forEach((step, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "segment-tab";
    tab.dataset.value = String(step.value);
    tab.textContent = step.label;
    tab.setAttribute("role", "tab");
    tab.id = `difficulty-tab-${index}`;
    tab.addEventListener("click", () => setDifficulty(step.value));
    container.appendChild(tab);
  });

  setDifficulty(initialValue, { persist: false, rerender: false });

  return DIFFICULTY_STEPS;
}
