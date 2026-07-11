let activeAnchor = null;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function hidePopup() {
  const popup = document.getElementById("popup");
  popup.style.display = "none";
  popup.innerHTML = "";
  popup.style.top = "";
  popup.style.left = "";
  popup.style.right = "";
  popup.style.bottom = "";
  popup.style.width = "";
  popup.style.maxWidth = "";
  popup.style.transform = "";
  if (activeAnchor) {
    activeAnchor.classList.remove("popup-active");
  }
  activeAnchor = null;
}

function isDockedPopup() {
  return (
    window.matchMedia("(max-width: 640px)").matches ||
    document.documentElement.classList.contains("mobile-preview")
  );
}

function getColumnBounds() {
  const content = document.getElementById("content");
  if (!content) return null;

  const rect = content.getBoundingClientRect();
  if (rect.width > 0) return rect;

  const sample = content.querySelector(".verse");
  return sample?.getBoundingClientRect() || null;
}

function positionDockedPopup(popup) {
  const rect = getColumnBounds();

  popup.style.top = "auto";
  popup.style.bottom = "0";
  popup.style.right = "auto";
  popup.style.transform = "";
  popup.style.maxWidth = "none";
  popup.style.boxSizing = "border-box";

  if (rect?.width) {
    popup.style.left = `${rect.left}px`;
    popup.style.width = `${rect.width}px`;
    return;
  }

  popup.style.left = "50%";
  popup.style.width = "var(--text-col)";
  popup.style.transform = "translateX(-50%)";
}

function scheduleDockedPosition(popup) {
  positionDockedPopup(popup);
  requestAnimationFrame(() => positionDockedPopup(popup));
}

function positionPopup(popup, anchor) {
  popup.style.display = "block";

  if (isDockedPopup()) {
    scheduleDockedPosition(popup);
    return;
  }

  popup.style.transform = "";

  popup.style.right = "auto";
  popup.style.bottom = "auto";
  popup.style.width = "";

  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 12;

  const popupRect = popup.getBoundingClientRect();

  let top = rect.top + window.scrollY - popupRect.height;
  let left = rect.left + window.scrollX;

  const minTop = window.scrollY + viewportPadding;
  const minLeft = window.scrollX + viewportPadding;
  const maxLeft =
    window.scrollX + window.innerWidth - popupRect.width - viewportPadding;

  if (top < minTop) {
    top = minTop;
  }

  if (left > maxLeft) {
    left = Math.max(minLeft, maxLeft);
  }

  if (left < minLeft) {
    left = minLeft;
  }

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

function renderSenseBody(surfaceWord, sense) {
  const displayWord = sense.lemma || surfaceWord;
  const lines = [
    `<div class="popup-word"><strong>${escapeHtml(displayWord)}</strong></div>`
  ];

  lines.push(`<div>${escapeHtml(sense.gloss)}</div>`);

  if (sense.strongs) {
    lines.push(`<div class="popup-meta">Strong's: ${escapeHtml(sense.strongs)}</div>`);
  }

  if (sense.rank != null) {
    lines.push(`<div class="popup-meta">Rank ${escapeHtml(sense.rank)}</div>`);
  }

  return lines.join("");
}

function renderPopupContent(word, senses, activeIndex) {
  const parts = [];

  if (senses.length > 1) {
    const tabs = senses
      .map(
        (_, index) =>
          `<button type="button" class="popup-tab${
            index === activeIndex ? " active" : ""
          }" data-index="${index}">${index + 1}</button>`
      )
      .join("");
    parts.push(`<div class="popup-tabs">${tabs}</div>`);
  }

  parts.push(
    `<div class="popup-body">${renderSenseBody(word, senses[activeIndex])}</div>`
  );

  return parts.join("");
}

function bindPopupTabs(popup, word, senses, anchor) {
  popup.querySelectorAll(".popup-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(tab.dataset.index);
      popup.innerHTML = renderPopupContent(word, senses, index);
      bindPopupTabs(popup, word, senses, anchor);
      positionPopup(popup, anchor);
    });
  });
}

export function showPopup(data, anchor) {
  const popup = document.getElementById("popup");

  if (activeAnchor === anchor && popup.style.display === "block") {
    hidePopup();
    return;
  }

  if (activeAnchor && activeAnchor !== anchor) {
    activeAnchor.classList.remove("popup-active");
  }

  activeAnchor = anchor;
  anchor.classList.add("popup-active");

  const senses = data.senses || [
    {
      gloss: data.gloss,
      strongs: data.strongs,
      pron: data.pron,
      rank: data.rank ?? null
    }
  ];

  popup.innerHTML = renderPopupContent(data.word, senses, 0);
  bindPopupTabs(popup, data.word, senses, anchor);
  positionPopup(popup, anchor);
}

export function initPopupHandlers(onWordClick) {
  document.getElementById("content").addEventListener("click", (e) => {
    const word = e.target.closest(".word");
    if (!word || word.classList.contains("no-highlight")) return;

    onWordClick(word);
  });

  document.addEventListener("click", (e) => {
    const popup = document.getElementById("popup");
    if (popup.style.display !== "block") return;
    if (popup.contains(e.target)) return;
    if (e.target.closest(".word")) return;
    hidePopup();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePopup();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!activeAnchor) return;

      const popup = document.getElementById("popup");
      if (popup.style.display !== "block") return;

      if (isDockedPopup()) {
        positionDockedPopup(popup);
        return;
      }

      const popupRect = popup.getBoundingClientRect();
      if (popupRect.bottom <= 0) {
        hidePopup();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "resize",
    () => {
      if (!activeAnchor) return;

      const popup = document.getElementById("popup");
      if (popup.style.display !== "block" || !isDockedPopup()) return;

      positionDockedPopup(popup);
    },
    { passive: true }
  );
}
