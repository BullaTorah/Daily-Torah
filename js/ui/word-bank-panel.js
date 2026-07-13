import {
  listWords,
  onWordBankChange,
  removeWord
} from "../core/word-bank.js";
import { isLoggedIn } from "../core/auth.js";
import { openAuthPanel } from "./auth-panel.js";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getElements() {
  return {
    panel: document.getElementById("wordBankPanel"),
    list: document.getElementById("wordBankList"),
    empty: document.getElementById("wordBankEmpty"),
    guest: document.getElementById("wordBankGuest")
  };
}

function closePanel() {
  const { panel } = getElements();
  if (panel) panel.hidden = true;
}

function openPanel() {
  const { panel } = getElements();
  if (panel) panel.hidden = false;
  renderWordBank();
}

function renderWordBank() {
  const { list, empty, guest } = getElements();
  if (!list) return;

  if (!isLoggedIn()) {
    list.innerHTML = "";
    if (empty) empty.hidden = true;
    if (guest) guest.hidden = false;
    return;
  }

  if (guest) guest.hidden = true;

  const words = listWords();

  if (!words.length) {
    list.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  list.innerHTML = words
    .map(
      (item) => `
      <li class="word-bank-item" data-strongs="${escapeHtml(item.strongs)}">
        <div class="word-bank-item-main">
          <div class="word-bank-lemma">${escapeHtml(item.lemma || item.surface_example || "—")}</div>
          <div class="word-bank-gloss">${escapeHtml(item.gloss || "—")}</div>
          <div class="word-bank-meta">Strong's ${escapeHtml(item.strongs)}</div>
        </div>
        <button type="button" class="word-bank-remove" aria-label="Remove from word bank">Remove</button>
      </li>`
    )
    .join("");

  list.querySelectorAll(".word-bank-remove").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const item = e.target.closest(".word-bank-item");
      const strongs = item?.dataset.strongs;
      if (!strongs) return;

      btn.disabled = true;
      try {
        await removeWord(strongs);
      } catch {
        btn.disabled = false;
      }
    });
  });
}

export function initWordBankPanel() {
  const { panel } = getElements();

  panel?.querySelectorAll("[data-word-bank-close]").forEach((btn) => {
    btn.addEventListener("click", closePanel);
  });

  document.getElementById("wordBankSignInBtn")?.addEventListener("click", () => {
    closePanel();
    openAuthPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) {
      closePanel();
    }
  });

  onWordBankChange(() => {
    if (panel && !panel.hidden) {
      renderWordBank();
    }
  });
}

export function showWordBankPanel() {
  openPanel();
}

export function refreshWordBankPanel() {
  renderWordBank();
}
