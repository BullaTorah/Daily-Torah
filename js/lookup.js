
function normalize(w) {
  return (w || "")
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/־/g, "")
    .replace(/[.,:;!?()\[\]"']/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function stripPrefixes(word) {
  let w = word; // already normalized upstream

  const prefixes = ["ו","ב","ל","כ","מ","ה","ש"];

  if (prefixes.includes(w[0])) {
    const candidate = w.slice(1);

    // prevent destroying real roots like בני → בני (NOT ני)
    if (candidate.length >= 3) {
      return candidate;
    }
  }

  return w;
}

function toStrongId(id) {
  if (!id) return null;
  const match = String(id).match(/\d+/);
  return match ? match[0] : null;
}

