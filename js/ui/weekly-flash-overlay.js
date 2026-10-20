import { isLoggedIn } from "../core/auth.js";
import {
  WEEKLY_SET_SIZE,
  advanceWeeklyFlashSet,
  ensureWeeklyFlashSet,
  getWeeklyFlashLabel,
  markWeeklyCardKnown,
  onWeeklyFlashChange
} from "../core/weekly-flashcards.js";
import { openAuthPanel } from "./auth-panel.js";
import { hidePopup } from "./popup.js";

let bound = false;
let index = 0;
let flipped = false;
let setSnapshot = null;

function els() {
  return {
    panel: document.getElementById("weeklyFlashPanel"),
    card: document.querySelector("#weeklyFlashPanel .weekly-flash-card"),
    status: document.getElementById("weeklyFlashStatus"),
    stage: document.getElementById("weeklyFlashStage"),
    done: document.getElementById("weeklyFlashDone"),
    doneLead: document.getElementById("weeklyFlashDoneLead"),
    lemma: document.getElementById("weeklyFlashLemma"),
    gloss: document.getElementById("weeklyFlashGloss"),
    flipBtn: document.getElementById("weeklyFlashFlipBtn"),
    knowBtn: document.getElementById("weeklyFlashKnowBtn"),
    stillBtn: document.getElementById("weeklyFlashStillBtn"),
    prevBtn: document.getElementById("weeklyFlashPrevBtn"),
    nextBtn: document.getElementById("weeklyFlashNextBtn"),
    nextSetBtn: document.getElementById("weeklyFlashNextSetBtn"),
    keepBtn: document.getElementById("weeklyFlashKeepBtn")
  };
}

function setStatus(message, { error = false } = {}) {
  const { status } = els();
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("is-error", Boolean(error));
}

function paint() {
  const {
    stage,
    done,
    doneLead,
    lemma,
    gloss,
    flipBtn,
    knowBtn,
    stillBtn,
    prevBtn,
    nextBtn,
    status
  } = els();

  setSnapshot = ensureWeeklyFlashSet();
  const cards = setSnapshot.cards || [];
  const title = document.getElementById("weeklyFlashTitle");
  if (title) title.textContent = getWeeklyFlashLabel();

  if (!cards.length) {
    if (stage) stage.hidden = true;
    if (done) {
      done.hidden = false;
      if (doneLead) {
        doneLead.textContent =
          "You’ve reached the end of the common-word list. Great work.";
      }
    }
    setStatus("");
    return;
  }

  if (setSnapshot.complete) {
    if (stage) stage.hidden = true;
    if (done) {
      done.hidden = false;
      if (doneLead) {
        doneLead.textContent = `You know all ${WEEKLY_SET_SIZE} words in set ${setSnapshot.setIndex}. Ready for the next ${WEEKLY_SET_SIZE}?`;
      }
    }
    setStatus(`Set ${setSnapshot.setIndex} · ${setSnapshot.knownCount} of ${cards.length} known`);
    return;
  }

  if (done) done.hidden = true;
  if (stage) stage.hidden = false;

  if (index >= cards.length) index = 0;
  if (index < 0) index = cards.length - 1;
  // Prefer an unknown card so "I know this" is clickable
  if (cards[index]?.known) {
    const unknown = cards.findIndex((item) => !item.known);
    if (unknown >= 0) index = unknown;
  }
  const card = cards[index];
  flipped = false;

  if (lemma) {
    lemma.textContent = card.lemma || "";
    lemma.lang = "he";
    lemma.dir = "rtl";
  }
  if (gloss) {
    gloss.textContent = card.gloss || "No gloss available";
    gloss.hidden = true;
  }
  if (flipBtn) flipBtn.textContent = "Show meaning";
  if (knowBtn) {
    knowBtn.disabled = Boolean(card.known);
    knowBtn.textContent = card.known ? "Known" : "I know this";
  }
  if (stillBtn) stillBtn.disabled = false;
  if (prevBtn) prevBtn.hidden = cards.length < 2;
  if (nextBtn) nextBtn.hidden = cards.length < 2;

  if (status) {
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = `Set ${setSnapshot.setIndex} · Word ${index + 1} of ${cards.length} · ${setSnapshot.knownCount} known`;
  }
}

function showFlip(on) {
  const { gloss, flipBtn } = els();
  flipped = Boolean(on);
  if (gloss) gloss.hidden = !flipped;
  if (flipBtn) flipBtn.textContent = flipped ? "Hide meaning" : "Show meaning";
}

function go(delta) {
  const cards = setSnapshot?.cards || [];
  if (!cards.length) return;
  index = (index + delta + cards.length) % cards.length;
  paint();
}

export function hideWeeklyFlashOverlay() {
  const { panel } = els();
  if (panel) panel.hidden = true;
  flipped = false;
  hidePopup();
}

export async function openWeeklyFlashOverlay() {
  if (!isLoggedIn()) {
    openAuthPanel();
    return;
  }

  const { panel } = els();
  if (!panel) return;

  index = 0;
  flipped = false;
  panel.hidden = false;
  hidePopup();

  try {
    paint();
  } catch (err) {
    setStatus(err?.message || "Could not load the next 10 words.", {
      error: true
    });
  }
}

export function initWeeklyFlashOverlay() {
  if (bound) return;
  bound = true;

  const {
    panel,
    flipBtn,
    knowBtn,
    stillBtn,
    prevBtn,
    nextBtn,
    nextSetBtn,
    keepBtn
  } = els();
  if (!panel) return;

  panel.querySelectorAll("[data-weekly-flash-close]").forEach((btn) => {
    btn.addEventListener("click", () => hideWeeklyFlashOverlay());
  });

  flipBtn?.addEventListener("click", () => showFlip(!flipped));

  knowBtn?.addEventListener("click", async () => {
    const card = setSnapshot?.cards?.[index];
    if (!card || card.known) return;
    knowBtn.disabled = true;
    try {
      const beforeIndex = index;
      await markWeeklyCardKnown(card.strongs);
      setSnapshot = ensureWeeklyFlashSet();
      if (setSnapshot.complete) {
        paint();
        return;
      }
      const cards = setSnapshot.cards || [];
      let next = cards.findIndex((item, i) => i > beforeIndex && !item.known);
      if (next < 0) next = cards.findIndex((item) => !item.known);
      index = next >= 0 ? next : beforeIndex;
      paint();
    } catch (err) {
      knowBtn.disabled = false;
      if (/sign in/i.test(err?.message || "")) {
        hideWeeklyFlashOverlay();
        openAuthPanel();
        return;
      }
      setStatus(err?.message || "Could not save that word.", { error: true });
    }
  });

  stillBtn?.addEventListener("click", () => {
    go(1);
  });

  prevBtn?.addEventListener("click", () => go(-1));
  nextBtn?.addEventListener("click", () => go(1));

  nextSetBtn?.addEventListener("click", () => {
    try {
      const result = advanceWeeklyFlashSet();
      if (result.exhausted) {
        paint();
        return;
      }
      index = 0;
      paint();
    } catch (err) {
      setStatus(err?.message || "Could not open the next set.", { error: true });
    }
  });

  keepBtn?.addEventListener("click", () => hideWeeklyFlashOverlay());

  document.addEventListener("keydown", (e) => {
    if (panel.hidden) return;
    if (e.key === "Escape") hideWeeklyFlashOverlay();
  });

  onWeeklyFlashChange(() => {
    // Avoid fighting an in-progress "I know this" save/paint cycle
    if (!panel.hidden && !knowBtn?.disabled) paint();
  });
}
