/**
 * Prefer Jewish-audience wording for the Tetragrammaton.
 * Main gloss: "The Eternal, the ineffable name of God."
 * Running text: "the Eternal" (not the Christian form "Jehovah").
 * Leaves Strong’s personal name “Hashem, an Israelite” alone.
 */
export function formatDivineNameEnglish(text) {
  let value = String(text || "");
  if (!value) return value;

  // Personal name H2044 — not the divine name
  if (/^Hashem,\s*an Israelite/i.test(value.trim())) {
    return value;
  }

  // Canonical Tetragrammaton gloss (H3068 and close variants)
  if (
    /^(?:Hashem|Jehovah|The Eternal),?\s*(?:Jewish national name of God|the ineffable name of God)\.?$/i.test(
      value.trim()
    )
  ) {
    return "The Eternal, the ineffable name of God.";
  }

  value = value.replace(/Jehovah/gi, (match) =>
    match === match.toUpperCase()
      ? "THE ETERNAL"
      : match[0] === "J"
        ? "the Eternal"
        : "the Eternal"
  );

  // Divine-name Hashem from prior wording (not the Israelite personal name)
  value = value.replace(/\bHashem\b/g, "the Eternal");

  // Clean doubled articles: "the the Eternal" → "the Eternal"
  value = value.replace(/\bthe\s+the Eternal\b/g, "the Eternal");
  // Title-case compound names: "the Eternal-Jireh" → "The Eternal-Jireh"
  value = value.replace(
    /(?:^|,\s*)the Eternal-/g,
    (m) => m.replace("the Eternal-", "The Eternal-")
  );

  return value;
}
