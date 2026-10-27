import {
  DIFFICULTY_STEPS,
  difficultyFromKnownCount
} from "../core/difficulty.js";
import { persistUserSettings } from "../core/user-settings.js";

let currentDifficulty = 0;

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

/** Persist preference only (underlines are Known-driven). */
export function setDifficulty(value, { persist = true } = {}) {
  currentDifficulty = value;
  updateTabUI(value);

  if (persist) {
    persistUserSettings({ difficulty: value });
  }
}

/** Highlight the band that matches the user’s known-word count. */
export function syncDifficultyTabsFromKnown(learnedCount) {
  const value = difficultyFromKnownCount(learnedCount);
  currentDifficulty = value;
  updateTabUI(value);
  return value;
}

/** Build non-clickable level tabs; highlight from known count or initial value. */
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
    tab.tabIndex = -1;
    tab.setAttribute("aria-disabled", "true");
    // Not clickable — visual indicator only
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    container.appendChild(tab);
  });

  setDifficulty(initialValue, { persist: false });
  return DIFFICULTY_STEPS;
}

/** No entrance walk — tabs just show the current band. */
export function animateDifficultyTabs() {
  return 0;
}
