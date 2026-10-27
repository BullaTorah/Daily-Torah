import { isLoggedIn } from "../core/auth.js";
import { resolveWord } from "../core/lexicon.js";
import { normalizeStrongs } from "../core/strongs.js";
import { markWordsLearned } from "../core/word-bank.js";
import { openAuthPanel } from "./auth-panel.js";

let bound = false;

export function createVerseBulkActions({ showHeading = false } = {}) {
  const nav = document.createElement("nav");
  nav.className = "verse-bulk-actions";
  nav.setAttribute("aria-label", "Verse word actions");

  if (showHeading) {
    const heading = document.createElement("p");
    heading.className = "verse-bulk-heading";
    heading.textContent = "How did you do?";
    nav.appendChild(heading);
  }

  const knowAll = document.createElement("button");
  knowAll.type = "button";
  knowAll.className = "verse-bulk-btn";
  knowAll.dataset.verseAction = "known-all";
  knowAll.textContent = "Knew all words";
  nav.appendChild(knowAll);

  const knowPlain = document.createElement("button");
  knowPlain.type = "button";
  knowPlain.className = "verse-bulk-btn";
  knowPlain.dataset.verseAction = "known-plain";
  knowPlain.textContent = "Knew highlighted";
  nav.appendChild(knowPlain);

  return nav;
}

function collectVerseEntries(verseEl, predicate) {
  const byId = new Map();
  const words = verseEl.querySelectorAll(".hebrew .word");

  words.forEach((el) => {
    if (!predicate(el)) return;
    const strongs = el.dataset.strongs;
    const id = normalizeStrongs(strongs);
    if (!id || byId.has(id)) return;

    const sense = resolveWord({
      word: el.dataset.word,
      verseRef: el.dataset.verseRef,
      tokenIndex: Number(el.dataset.tokenIndex) || 1,
      strongs
    });

    byId.set(id, {
      strongs: id,
      lemma: sense?.lemma || null,
      gloss: sense?.gloss || null,
      surfaceExample: el.dataset.word || el.textContent || null
    });
  });

  return [...byId.values()];
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle("is-busy", busy);
}

function flashDone(btn, count) {
  const original = btn.textContent;
  btn.classList.add("is-done");
  btn.textContent = count > 0 ? `Added ${count}` : "None to add";
  window.setTimeout(() => {
    btn.classList.remove("is-done");
    btn.textContent = original;
    btn.disabled = false;
  }, 1400);
}

async function handleAction(btn) {
  if (!isLoggedIn()) {
    openAuthPanel();
    return;
  }

  const verse = btn.closest(".verse");
  const action = btn.dataset.verseAction;
  if (!verse || !action) return;

  let entries = [];
  if (action === "known-all") {
    entries = collectVerseEntries(verse, () => true);
  } else if (action === "known-plain") {
    // Highlighted = not yet Known (personalized underlines)
    entries = collectVerseEntries(
      verse,
      (el) => !el.classList.contains("no-highlight")
    );
  } else {
    return;
  }

  setBusy(btn, true);

  try {
    const count = await markWordsLearned(entries, { moveFromBank: true });
    flashDone(btn, count);
  } catch {
    setBusy(btn, false);
  }
}

export function initVerseBulkActions() {
  if (bound) return;
  bound = true;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".verse-bulk-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    handleAction(btn);
  });
}
