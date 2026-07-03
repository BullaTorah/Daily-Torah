import { DIFFICULTY_STEPS } from "../core/difficulty.js";
import { setStoredDifficulty } from "../core/storage.js";
import { rerenderCurrent, setRenderState } from "./render.js";

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

export function setDifficulty(value, { persist = true, rerender = true } = {}) {
  currentDifficulty = value;
  setRenderState({ difficulty: value });

  if (persist) {
    setStoredDifficulty(value);
  }

  updateTabUI(value);

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

  setDifficulty(initialValue, { persist: false });

  return DIFFICULTY_STEPS;
}
