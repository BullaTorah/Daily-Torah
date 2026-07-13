/** Normalize Strong's to numeric id string (e.g. "H3478" → "3478"). */
export function normalizeStrongs(strongs) {
  const match = String(strongs || "").match(/\d+/);
  return match ? match[0] : null;
}
