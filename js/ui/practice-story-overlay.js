import { hidePopup } from "./popup.js";

let escapeBound = false;
let loadStory = null;
let requestId = 0;

function els() {
  return {
    panel: document.getElementById("practiceStoryPanel"),
    status: document.getElementById("practiceStoryStatus"),
    lead: document.getElementById("practiceStoryLead"),
    note: document.getElementById("practiceStoryNote"),
    hebrew: document.getElementById("practiceStoryHebrew"),
    english: document.getElementById("practiceStoryEnglish"),
    missing: document.getElementById("practiceStoryMissing"),
    newBtn: document.getElementById("practiceStoryNewBtn")
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

export function hidePracticeStoryOverlay() {
  const { panel } = els();
  if (panel) panel.hidden = true;
  requestId += 1;
  setLoadingState(false);
  hidePopup();
}

function leadFor(story) {
  if (story.beginnerFillers) {
    return "A short story using your practice words. Other words are limited to the 40 most common Torah words.";
  }
  if (story.fillersUnrestricted) {
    return "A short story using your practice words. Other words are common Biblical Hebrew.";
  }
  return `A short story using your practice words. Other words stay at your ${story.levelLabel} level or below.`;
}

function noteFor(story) {
  const parts = [];
  if (story.omittedCount > 0) {
    const left = story.omittedCount === 1 ? "1 more was" : `${story.omittedCount} more were`;
    parts.push(
      `This story uses ${story.usedCount} of your practice words. ${left} left out.`
    );
  }
  if (story.tokens?.some((token) => token.problem)) {
    parts.push("Marked words are outside your reading level.");
  }
  return parts.join(" ");
}

function renderStory(story) {
  const { lead, note, hebrew, english, missing, newBtn } = els();
  if (lead) lead.textContent = leadFor(story);

  if (note) {
    const text = noteFor(story);
    note.hidden = !text;
    note.textContent = text;
  }

  if (hebrew) {
    hebrew.replaceChildren();
    (story.tokens || []).forEach((token) => {
      const el = document.createElement("span");
      const isTarget = token.role === "target" && !token.problem;
      el.className = isTarget ? "word" : "practice-token";
      if (token.problem) el.classList.add("is-problem");
      el.lang = "he";
      el.dir = "rtl";
      el.textContent = token.surface;
      if (isTarget) {
        el.dataset.word = token.surface;
        if (token.strongs) el.dataset.strongs = token.strongs;
      }
      hebrew.appendChild(el);
      hebrew.appendChild(document.createTextNode(" "));
    });
  }

  if (english) english.textContent = story.en || "";

  if (missing) {
    const names = (story.missing || [])
      .map((word) => word.lemma || word.strongs)
      .filter(Boolean);
    missing.hidden = !names.length;
    missing.textContent = names.length
      ? `Not in this story: ${names.join(", ")}`
      : "";
  }

  if (newBtn) {
    newBtn.hidden = false;
    newBtn.disabled = false;
  }
}

async function run() {
  const { panel, newBtn } = els();
  if (!panel || !loadStory) return;

  const id = ++requestId;
  panel.hidden = false;
  panel.classList.remove("is-error");
  setLoadingState(true);
  if (newBtn) {
    newBtn.hidden = true;
    newBtn.disabled = true;
  }
  setStatus("Writing your practice story...");
  hidePopup();

  try {
    const story = await loadStory();
    if (id !== requestId) return;
    if (!story?.tokens?.length) {
      panel.classList.add("is-error");
      setLoadingState(false);
      setStatus("No practice words yet.", { error: true });
      if (newBtn) newBtn.hidden = true;
      return;
    }
    setLoadingState(false);
    setStatus("");
    renderStory(story);
  } catch (err) {
    if (id !== requestId) return;
    panel.classList.add("is-error");
    setLoadingState(false);
    setStatus(err?.message || "Could not generate a practice story.", {
      error: true
    });
    if (newBtn) {
      newBtn.hidden = false;
      newBtn.disabled = false;
    }
  }
}

export function startPracticeStory() {
  run();
}

export function initPracticeStoryOverlay({ loadStory: load }) {
  loadStory = load;
  const { panel, newBtn } = els();
  if (!panel) return;

  panel.querySelectorAll("[data-practice-story-close]").forEach((btn) => {
    btn.addEventListener("click", hidePracticeStoryOverlay);
  });

  newBtn?.addEventListener("click", () => {
    run();
  });

  if (!escapeBound) {
    escapeBound = true;
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        const open = document.getElementById("practiceStoryPanel");
        if (!open || open.hidden) return;
        const popup = document.getElementById("popup");
        if (popup && popup.style.display === "block") {
          e.stopPropagation();
          hidePopup();
          return;
        }
        e.stopPropagation();
        hidePracticeStoryOverlay();
      },
      true
    );
  }
}
