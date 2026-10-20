import {
  startPlacement,
  answerPlacement,
  levelLabel,
  isPlacementDone,
  PLACEMENT_TOTAL
} from "../core/placement.js";
import { isLoggedIn } from "../core/auth.js";
import {
  hasChosenDisplayName,
  saveProfileFirstName
} from "../core/profile.js";
import { openAuthPanel } from "./auth-panel.js";

let api = null;
let bound = false;
let state = null;
let answering = false;
let advanceTimer = null;
let needsUsername = false;

const REVEAL_MS = 750;

function els() {
  return {
    panel: document.getElementById("placementPanel"),
    ask: document.getElementById("placementAsk"),
    result: document.getElementById("placementResult"),
    lemma: document.getElementById("placementLemma"),
    choices: document.getElementById("placementChoices"),
    status: document.getElementById("placementStatus"),
    resultTitle: document.getElementById("placementResultTitle"),
    resultLead: document.getElementById("placementResultLead"),
    usernameField: document.getElementById("placementUsernameField"),
    usernameInput: document.getElementById("placementUsername"),
    continueBtn: document.getElementById("placementContinueBtn"),
    closeBtn: document.querySelector("#placementPanel .placement-close")
  };
}

function showAsk() {
  const { ask, result, usernameField, usernameInput } = els();
  if (ask) ask.hidden = false;
  if (result) result.hidden = true;
  if (usernameField) usernameField.hidden = true;
  if (usernameInput) usernameInput.value = "";
  needsUsername = false;
}

function showResult(level) {
  const {
    ask,
    result,
    resultTitle,
    resultLead,
    usernameField,
    usernameInput,
    continueBtn
  } = els();
  if (ask) ask.hidden = true;
  if (result) result.hidden = false;
  const label = levelLabel(level);
  if (resultTitle) {
    resultTitle.textContent = `You are ${label}.`;
  }
  if (resultLead) {
    resultLead.textContent =
      "We’ll start you at that level. You can change it anytime from the difficulty tabs.";
  }

  api?.onPersistLevel?.(level);

  needsUsername = !hasChosenDisplayName();
  if (usernameField) usernameField.hidden = !needsUsername;
  if (usernameInput) {
    usernameInput.value = "";
    if (needsUsername) {
      window.setTimeout(() => usernameInput.focus(), 0);
    }
  }
  if (continueBtn) {
    continueBtn.textContent = needsUsername && !isLoggedIn()
      ? "Create account"
      : "Read three verses";
  }
}

function renderQuestion() {
  const { lemma, choices, status } = els();
  if (!state?.question || !lemma || !choices) return;

  lemma.textContent = state.question.lemma;
  if (status) {
    status.textContent = `${state.asked} of ${state.total || PLACEMENT_TOTAL}`;
  }

  choices.innerHTML = "";
  state.question.choices.forEach((choice, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "placement-choice";
    btn.textContent = choice.gloss;
    btn.addEventListener("click", () => onChoose(index));
    choices.appendChild(btn);
  });

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "placement-choice placement-dont-know";
  skip.textContent = "I don’t know";
  skip.addEventListener("click", () => onDontKnow());
  choices.appendChild(skip);
}

function revealAndAdvance(choiceIndex) {
  if (!state || state.done || answering) return;
  const question = state.question;
  if (!question?.choices?.length) return;
  if (choiceIndex != null && !question.choices[choiceIndex]) return;

  answering = true;
  const { choices } = els();
  const buttons = choices
    ? [...choices.querySelectorAll(".placement-choice")]
    : [];
  buttons.forEach((btn) => {
    btn.disabled = true;
  });

  const glossButtons = buttons.filter(
    (btn) => !btn.classList.contains("placement-dont-know")
  );
  glossButtons.forEach((btn, i) => {
    if (question.choices[i]?.correct) {
      btn.classList.add("is-correct");
    } else {
      btn.classList.add("is-fading");
    }
  });
  const skipBtn = buttons.find((btn) =>
    btn.classList.contains("placement-dont-know")
  );
  if (skipBtn) {
    if (choiceIndex == null) skipBtn.classList.add("is-dont-know");
    else skipBtn.classList.add("is-fading");
  }

  if (advanceTimer) window.clearTimeout(advanceTimer);
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null;
    state = answerPlacement(state, choiceIndex);
    answering = false;
    if (state.done) {
      showResult(state.level);
      return;
    }
    renderQuestion();
  }, REVEAL_MS);
}

function onChoose(index) {
  revealAndAdvance(index);
}

function onDontKnow() {
  revealAndAdvance(null);
}

function finishWithReading(level) {
  closePlacementOverlay();
  if (level != null) {
    api?.onComplete?.(level);
  }
}

async function onContinue() {
  const level = state?.level;
  if (level == null) {
    closePlacementOverlay();
    return;
  }

  if (!needsUsername) {
    finishWithReading(level);
    return;
  }

  const { usernameInput } = els();
  const username = usernameInput?.value?.trim() || "";
  if (!username) {
    usernameInput?.focus();
    return;
  }

  if (isLoggedIn()) {
    try {
      await saveProfileFirstName(username);
    } catch {
      /* still continue into reading */
    }
    finishWithReading(level);
    return;
  }

  closePlacementOverlay();
  openAuthPanel("signup", {
    firstName: username,
    onSuccess: () => api?.onComplete?.(level),
    onClose: () => api?.onComplete?.(level)
  });
}

export function openPlacementOverlay() {
  const { panel } = els();
  if (!panel) return;
  if (advanceTimer) {
    window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }
  answering = false;
  try {
    state = startPlacement();
  } catch (err) {
    console.error(err);
    return;
  }
  showAsk();
  renderQuestion();
  panel.hidden = false;
  document.body.classList.add("placement-open");
}

export function closePlacementOverlay() {
  const { panel } = els();
  if (advanceTimer) {
    window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }
  answering = false;
  needsUsername = false;
  if (panel) panel.hidden = true;
  document.body.classList.remove("placement-open");
  state = null;
}

export function initPlacementOverlay(handlers = {}) {
  api = handlers;
  if (bound) return;
  bound = true;

  const { panel, continueBtn, closeBtn, usernameInput } = els();
  if (!panel) return;

  continueBtn?.addEventListener("click", () => {
    onContinue();
  });

  usernameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onContinue();
    }
  });

  closeBtn?.addEventListener("click", () => {
    closePlacementOverlay();
  });

  panel.querySelector(".placement-backdrop")?.addEventListener("click", () => {
    closePlacementOverlay();
  });
}

export { isPlacementDone };
