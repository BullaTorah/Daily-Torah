const THEME_STORAGE_KEY = "bulla-theme";
const HEBREW_FONT_STORAGE_KEY = "bulla-hebrew-font";

export const THEMES = [
  { id: "original", label: "Day Study" },
  { id: "olive-scroll", label: "Olive Scroll" },
  { id: "night-study", label: "Night Study" },
  { id: "signal-red", label: "Signal Red" },
  { id: "electric-indigo", label: "Electric Blue" }
];

export const HEBREW_FONTS = [
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern" },
  { id: "traditional", label: "Traditional" }
];

const THEME_SELECT_IDS = ["themeSelect", "themeSelectHome", "themeSelectHeader"];
const HEBREW_FONT_SELECT_IDS = [
  "hebrewFontSelect",
  "hebrewFontSelectHome",
  "hebrewFontSelectHeader"
];

export function getTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "stone-ink" || saved === "citrus-black") {
    return "original";
  }
  if (THEMES.some((t) => t.id === saved)) return saved;
  return "original";
}

export function getHebrewFont() {
  const saved = localStorage.getItem(HEBREW_FONT_STORAGE_KEY);
  if (HEBREW_FONTS.some((f) => f.id === saved)) return saved;
  return "classic";
}

function syncThemeSelects(theme) {
  for (const id of THEME_SELECT_IDS) {
    const select = document.getElementById(id);
    if (select && select.value !== theme) select.value = theme;
  }
}

function syncHebrewFontSelects(font) {
  for (const id of HEBREW_FONT_SELECT_IDS) {
    const select = document.getElementById(id);
    if (select && select.value !== font) select.value = font;
  }
}

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : "original";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  syncThemeSelects(theme);
}

export function applyHebrewFont(id) {
  const font = HEBREW_FONTS.some((f) => f.id === id) ? id : "classic";
  document.documentElement.setAttribute("data-hebrew-font", font);
  localStorage.setItem(HEBREW_FONT_STORAGE_KEY, font);
  syncHebrewFontSelects(font);
}

function bindThemeSelect(select) {
  if (!select) return;
  select.innerHTML = THEMES.map(
    (t) => `<option value="${t.id}">${t.label}</option>`
  ).join("");
  select.value = getTheme();
  select.addEventListener("change", () => applyTheme(select.value));
}

function bindHebrewFontSelect(select) {
  if (!select) return;
  select.innerHTML = HEBREW_FONTS.map(
    (f) => `<option value="${f.id}">${f.label}</option>`
  ).join("");
  select.value = getHebrewFont();
  select.addEventListener("change", () => applyHebrewFont(select.value));
}

export function initTheme() {
  applyTheme(getTheme());
  applyHebrewFont(getHebrewFont());
  for (const id of THEME_SELECT_IDS) {
    bindThemeSelect(document.getElementById(id));
  }
  for (const id of HEBREW_FONT_SELECT_IDS) {
    bindHebrewFontSelect(document.getElementById(id));
  }
}
