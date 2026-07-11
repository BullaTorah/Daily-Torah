const ROOT_RE = /\{H(\d+)[A-Z]?\}/g;
const PREFIX_RE = /^H9\d{3}$/;

/**
 * Parse TAHOT dStrongs column.
 * Examples:
 *   H9009/{H1697G}        -> prefixes [9009], root 1697
 *   H9002/H9009/{H1697L}  -> prefixes [9002, 9009], root 1697
 *   {H1254A}              -> root 1254
 */
export function parseDStrongs(raw) {
  const value = String(raw || "").trim();
  const roots = [];
  let match;

  while ((match = ROOT_RE.exec(value)) !== null) {
    roots.push(match[1]);
  }

  const parts = value
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const prefixes = [];
  for (const part of parts) {
    const bare = part.replace(/[{}]/g, "");
    if (PREFIX_RE.test(bare) && !part.includes("{")) {
      prefixes.push(bare.replace(/^H/, ""));
    }
  }

  const root = roots[roots.length - 1] || null;

  return {
    raw: value,
    root,
    roots,
    prefixes
  };
}
