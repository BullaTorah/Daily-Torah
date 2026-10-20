const STORAGE_KEY = "bulla-theme";

export const THEMES = [
  { id: "original", label: "Day Study" },
  { id: "olive-scroll", label: "Olive Scroll" },
  { id: "night-study", label: "Night Study" },
  { id: "signal-red", label: "Signal Red" },
  { id: "electric-indigo", label: "Electric Blue" }
];

const SELECT_IDS = ["themeSelect", "themeSelectHome", "themeSelectHeader"];

export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "stone-ink" || saved === "citrus-black") {
    return "original";
  }
  if (THEMES.some((t) => t.id === saved)) return saved;
  return "original";
}

function syncSelects(theme) {
  for (const id of SELECT_IDS) {
    const select = document.getElementById(id);
    if (select && select.value !== theme) select.value = theme;
  }
}

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : "original";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
  syncSelects(theme);
}

function bindSelect(select) {
  if (!select) return;
  select.innerHTML = THEMES.map(
    (t) => `<option value="${t.id}">${t.label}</option>`
  ).join("");
  select.value = getTheme();
  select.addEventListener("change", () => applyTheme(select.value));
}

export function initTheme() {
  applyTheme(getTheme());
  for (const id of SELECT_IDS) {
    bindSelect(document.getElementById(id));
  }
}
