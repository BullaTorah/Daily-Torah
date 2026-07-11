/** Strip cantillation, punctuation; keep letters and niqqud. */
export function stripCantillation(text) {
  return String(text || "")
    .replace(/[\u0591-\u05AF\u05BD]/g, "")
    .replace(/[\u05C0\u05C3]/g, "");
}

/** Consonantal form for alignment (no niqqud, no punctuation). */
export function consonantal(text) {
  return stripCantillation(String(text || ""))
    .normalize("NFKD")
    .replace(/[\u05B0-\u05BD\u05BF-\u05C7]/g, "")
    .replace(/־/g, "")
    .replace(/[.,:;!?()\[\]"'{}\\]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Surface form shown in the reader (no slashes, sof pasuq, section marks). */
export function displaySurface(hebrewField) {
  return stripCantillation(String(hebrewField || ""))
    .replace(/[\\/]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Split TAHOT Hebrew field into morpheme segments. */
export function splitSegments(hebrewField) {
  return String(hebrewField || "")
    .split("/")
    .map((part) => part.replace(/\\.+$/, "").trim())
    .filter(Boolean);
}
