
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

function stripNiqqud(str) {
  return (str || "")
    // vowel points + cantillation marks
    .replace(/[\u0591-\u05C7]/g, "")
    // remove paseq (׀)
    .replace(/\u05C0/g, "")
    .trim();
}

function normalizeLemmaId(id) {
  if (!id) return null;
  return id
    .replace(/^[a-z]\//i, "")
    .replace(/\s+[a-z]$/i, "")
    .trim();
}

function isValidLemma(v) {
  if (!v) return false;
  if (/^[0-9]+$/.test(v)) return true;
  if (/^[0-9]+\s?[a-z]?$/i.test(v)) return true;
  if (/^[a-z]$/i.test(v)) return false;
  return true;
}

function lookup(word) {
  const cleanWord = normalize(word);

  // STEP 1: try direct match
  let strongs = WORD_LOOKUP[cleanWord];

  // STEP 2: fallback — strip prefix once safely
  if (!strongs) {
    const stripped = stripPrefixes(cleanWord);
    strongs = WORD_LOOKUP[stripped];
  }

  console.log("LOOKUP TRACE:", {
    word,
    cleanWord,
    strongs
  });

  if (!strongs) {
    return {
      lemma: null,
      gloss: "Unknown word",
      strongs: null
    };
  }

  const entry =
    LEXICON[String(strongs)] ||
    LEXICON[String(strongs).replace(/^0+/, "")];

  const strongId = toStrongId(strongs);

return {
  strongs: strongId,
  lemma: entry?.lemma || null,
  gloss: entry?.gloss || "—"
};
}
