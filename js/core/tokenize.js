import { cleanHebrewText } from "./lookup.js";

export function tokenizeHebrewVerse(text) {
  const cleaned = cleanHebrewText(String(text || ""));

  return cleaned
    .replace(/\s+/g, " ")
    .trim()
    .split(/[\s\u00A0־&]+/)
    .map((raw) => raw.replace(/[.,:;!?"]/g, "").trim())
    .filter(Boolean);
}
