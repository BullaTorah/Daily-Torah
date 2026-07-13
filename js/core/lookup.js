let wordLookup = {};
let lexicon = {};
let frequency = {};
let lemmaKeyIndex = new Map();
let consonantalIndex = new Map();
let senseCache = new Map();

export function initLookup(lookupData, glossData, freqData) {
  wordLookup = lookupData;
  lexicon = glossData;
  frequency = freqData || {};
  senseCache = new Map();
  buildIndexes();
}

function buildIndexes() {
  lemmaKeyIndex = new Map();
  consonantalIndex = new Map();

  for (const [id, entry] of Object.entries(lexicon)) {
    if (!entry?.lemma || isEditorialDuplicate(entry)) continue;

    const matchKey = lemmaMatchKey(entry.lemma);
    const clean = normalize(entry.lemma);

    if (!lemmaKeyIndex.has(matchKey)) lemmaKeyIndex.set(matchKey, []);
    lemmaKeyIndex.get(matchKey).push(id);

    if (!consonantalIndex.has(clean)) consonantalIndex.set(clean, []);
    consonantalIndex.get(clean).push(id);
  }
}

function normalize(w) {
  return (w || "")
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/־/g, "")
    .replace(/[.,:;!?()\[\]"'{}]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function lemmaMatchKey(w) {
  return stripCantillation(w || "")
    .replace(/[.,:;!?()\[\]"'{}]/g, "")
    .replace(/־/g, "")
    .replace(/\s+/g, "")
    .trim()
    .normalize("NFKD");
}

function hasNiqqud(word) {
  return /[\u05B0-\u05BD\u05BF-\u05C7]/.test(String(word || ""));
}

function stripPrefixes(word) {
  const prefixes = ["ו", "ב", "ל", "כ", "מ", "ה", "ש"];
  if (prefixes.includes(word[0])) {
    const candidate = word.slice(1);
    if (candidate.length >= 3) return candidate;
  }
  return word;
}

function toStrongId(id) {
  const match = String(id || "").match(/\d+/);
  return match ? match[0] : null;
}

function isCompoundLookupValue(value) {
  return String(value || "").includes("+");
}

function stripSefariaFootnotes(text) {
  return String(text || "")
    .replace(/<sup[^>]*class=["']footnote-marker["'][^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<i[^>]*class=["']footnote["'][^>]*>[\s\S]*?<\/i>/gi, "");
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&(?:thinsp|ensp|emsp|zwnj|zwj|#160|#8201|#8194|#8195);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || "").replace(/<[^>]*>/g, ""));
}

function stripParentheses(text) {
  let result = String(text || "");
  while (/\([^()]*\)/.test(result)) {
    result = result.replace(/\([^()]*\)/g, "");
  }
  return result;
}

function stripCurlyBraces(text) {
  let result = String(text || "");
  while (/\{[^{}]*\}/.test(result)) {
    result = result.replace(/\{[^{}]*\}/g, "");
  }
  return result;
}

function stripEditorialNotes(text) {
  return String(text || "").replace(
    /\b(Lit\.|Heb\.|Par\.|Cf\.|v\.|vv\.)[^.;—]*[.;—]?/gi,
    ""
  );
}

/** Remove cantillation and non-vowel Hebrew marks; keep niqqud and reading dots. */
function stripCantillation(text) {
  return String(text || "")
    .replace(/[\u0591-\u05AF\u05BD]/g, "")
    .replace(/[\u05C0\u05C3]/g, "");
}

export function cleanHebrewText(text) {
  if (!text) return "";

  let cleaned = stripHtml(text);
  cleaned = stripParentheses(cleaned);
  cleaned = stripCurlyBraces(cleaned);
  cleaned = stripEditorialNotes(cleaned);
  cleaned = stripCantillation(cleaned);
  cleaned = cleaned.replace(/[a-zA-Z*]/g, "");
  cleaned = cleaned.replace(/&+/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export function stripSefariaArtifacts(text) {
  if (!text) return "";

  let cleaned = stripSefariaFootnotes(text);
  cleaned = stripHtml(cleaned);
  cleaned = stripParentheses(cleaned);
  cleaned = stripCurlyBraces(cleaned);
  cleaned = stripEditorialNotes(cleaned);
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

function isEditorialDuplicate(entry) {
  return String(entry?.gloss || "").startsWith("{");
}

function buildSense(strongs) {
  const entry =
    lexicon[String(strongs)] ||
    lexicon[String(strongs).replace(/^0+/, "")];
  const id = toStrongId(strongs);
  const freq = frequency[String(id)] || null;

  return {
    strongs: id,
    lemma: entry?.lemma || null,
    gloss: entry?.gloss || "—",
    pron: entry?.pron || null,
    rank: freq?.rank ?? null
  };
}

function sensesFromIds(ids) {
  const senses = [];
  const seen = new Set();

  for (const id of ids) {
    const sense = buildSense(id);
    if (!sense.strongs || seen.has(sense.strongs)) continue;
    seen.add(sense.strongs);
    senses.push(sense);
  }

  return senses;
}

function findSensesByLemmaKey(matchKey) {
  return sensesFromIds(lemmaKeyIndex.get(matchKey) || []);
}

function findSensesByLemmaKeys(keys) {
  const ids = [];

  for (const key of keys) {
    const matches = lemmaKeyIndex.get(key);
    if (matches) ids.push(...matches);
  }

  return sensesFromIds(ids);
}

function findSensesByConsonantalKey(clean) {
  return sensesFromIds(consonantalIndex.get(clean) || []);
}

function generateLemmaCandidates(word) {
  const key = lemmaMatchKey(word);
  const candidates = new Set([key]);

  const add = (value) => {
    const normalized = lemmaMatchKey(value);
    if (normalized) candidates.add(normalized);
  };

  if (/וֹת$/.test(key)) {
    const stem = key.replace(/וֹת$/, "");
    add(stem + "וָה");
    add(stem + "ָה");
    add(stem + "ה");
  } else if (/ֹת$/.test(key)) {
    const stem = key.replace(/ֹת$/, "");
    add(stem + "ָה");
    add(stem + "ה");
  } else if (/ים$/.test(key)) {
    const stem = key.replace(/ים$/, "");
    add(stem);
    add(stem + "ה");
    add(stem + "ָה");
  }

  return [...candidates];
}

function sharedVowelPrefixLength(a, b) {
  const left = lemmaMatchKey(a);
  const right = lemmaMatchKey(b);
  let index = 0;

  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function vowelPrefixScore(word, entry) {
  return sharedVowelPrefixLength(word, entry.lemma);
}

function pickBestSense(senses) {
  if (senses.length === 0) return null;
  return [...senses].sort(
    (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)
  )[0];
}

function pickBestByVowelPrefix(word, senses) {
  if (senses.length === 0) return null;

  return [...senses].sort((a, b) => {
    const entryA = lexicon[String(a.strongs)] || {};
    const entryB = lexicon[String(b.strongs)] || {};
    const prefixDiff =
      vowelPrefixScore(word, entryB) - vowelPrefixScore(word, entryA);

    if (prefixDiff !== 0) return prefixDiff;
    return (a.rank ?? Infinity) - (b.rank ?? Infinity);
  })[0];
}

function lookupConsonantalFromWordLookup(word, allowCompound = false) {
  const clean = normalize(word);
  const stripped = normalize(stripPrefixes(word));

  for (const key of [clean, stripped]) {
    const value = wordLookup[key];
    if (!value) continue;
    if (!allowCompound && isCompoundLookupValue(value)) continue;
    return value;
  }

  return null;
}

function lookupFromWordLookup(word, allowCompound = false) {
  const vowelKey = lemmaMatchKey(word);
  const clean = normalize(word);
  const stripped = normalize(stripPrefixes(word));
  const keys = [vowelKey];

  if (!hasNiqqud(word)) {
    keys.push(clean, stripped);
  }

  const candidates = keys.map((key) => wordLookup[key]).filter(Boolean);

  for (const value of candidates) {
    if (!allowCompound && isCompoundLookupValue(value)) continue;
    return value;
  }

  return allowCompound ? candidates[0] || null : null;
}

const UNKNOWN_SENSE = {
  strongs: null,
  gloss: "Unknown word",
  pron: null,
  rank: null
};

function resolveSenseInner(word) {
  const matchKey = lemmaMatchKey(word);
  const clean = normalize(word);
  const stripped = normalize(stripPrefixes(word));
  const vocalized = hasNiqqud(word);

  let best = pickBestSense(findSensesByLemmaKey(matchKey));
  if (best) {
    const wlId = lookupConsonantalFromWordLookup(word, false);
    if (wlId && String(wlId) !== String(best.strongs)) {
      const wlSense = buildSense(wlId);
      if (
        wlSense.rank != null &&
        best.rank != null &&
        wlSense.rank < best.rank &&
        (best.rank - wlSense.rank > 100 || wlSense.rank <= 100)
      ) {
        return wlSense;
      }
    }
    return best;
  }

  best = pickBestSense(findSensesByLemmaKeys(generateLemmaCandidates(word)));
  if (best) return best;

  const strongsFromLookup = lookupFromWordLookup(word, false);
  if (strongsFromLookup) {
    return buildSense(strongsFromLookup);
  }

  if (vocalized) {
    const candidateKeys = new Set(generateLemmaCandidates(word));
    const consonantalMatches = [
      ...findSensesByConsonantalKey(clean),
      ...findSensesByConsonantalKey(stripped)
    ];
    const unique = [];
    const seen = new Set();

    for (const sense of consonantalMatches) {
      if (!sense.strongs || seen.has(sense.strongs)) continue;
      seen.add(sense.strongs);
      unique.push(sense);
    }

    const candidateMatches = unique.filter((sense) => {
      const entry = lexicon[String(sense.strongs)] || {};
      return candidateKeys.has(lemmaMatchKey(entry.lemma));
    });

    best = pickBestSense(candidateMatches);
    if (best) return best;

    best = pickBestByVowelPrefix(word, unique);
    if (best) {
      if (best.rank == null) {
        const inflectedLookup = lookupConsonantalFromWordLookup(word, false);
        if (inflectedLookup) {
          const wlSense = buildSense(inflectedLookup);
          if (wlSense.rank != null) return wlSense;
        }
      }
      return best;
    }

    const inflectedLookup = lookupConsonantalFromWordLookup(word, false);
    if (inflectedLookup) {
      return buildSense(inflectedLookup);
    }
  } else {
    best = pickBestSense(findSensesByConsonantalKey(clean));
    if (best) return best;

    best = pickBestSense(findSensesByConsonantalKey(stripped));
    if (best) return best;
  }

  const compoundLookup = lookupFromWordLookup(word, true);
  if (compoundLookup) {
    return buildSense(compoundLookup);
  }

  return { ...UNKNOWN_SENSE };
}

export function resolveSense(word) {
  if (senseCache.has(word)) {
    return senseCache.get(word);
  }

  const sense = resolveSenseInner(word);
  senseCache.set(word, sense);
  return sense;
}

function sortSenses(senses, resolved) {
  return [...senses].sort((a, b) => {
    if (resolved?.strongs) {
      if (a.strongs === resolved.strongs) return -1;
      if (b.strongs === resolved.strongs) return 1;
    }
    return (a.rank ?? Infinity) - (b.rank ?? Infinity);
  });
}

function collectPopupSenses(word) {
  const matchKey = lemmaMatchKey(word);
  const candidateKeys = generateLemmaCandidates(word);
  const seen = new Set();
  let senses = [];

  const addSense = (sense) => {
    if (!sense?.strongs || seen.has(sense.strongs)) return;
    seen.add(sense.strongs);
    senses.push(sense);
  };

  for (const sense of findSensesByLemmaKey(matchKey)) addSense(sense);
  for (const sense of findSensesByLemmaKeys(candidateKeys)) addSense(sense);

  if (hasNiqqud(word)) {
    const candidateKeySet = new Set(candidateKeys);
    const clean = normalize(word);
    const consonantal = [
      ...findSensesByConsonantalKey(clean),
      ...findSensesByConsonantalKey(normalize(stripPrefixes(word)))
    ];

    for (const sense of consonantal) {
      if (seen.has(sense.strongs)) continue;

      const entry = lexicon[String(sense.strongs)] || {};
      if (candidateKeySet.has(lemmaMatchKey(entry.lemma))) {
        addSense(sense);
      }
    }
  }

  return senses;
}

export function lookupSenses(word) {
  const resolved = resolveSense(word);
  let senses = collectPopupSenses(word);

  if (resolved.strongs && !senses.some((s) => s.strongs === resolved.strongs)) {
    senses.push(resolved);
  }

  if (senses.length === 0) {
    senses = [{ ...UNKNOWN_SENSE }];
  }

  return { senses: sortSenses(senses, resolved) };
}

export function lookup(word) {
  const sense = resolveSense(word);

  if (!sense.strongs) {
    return {
      lemma: null,
      gloss: "Unknown word",
      strongs: null,
      xlit: null,
      pron: null
    };
  }

  const entry =
    lexicon[String(sense.strongs)] ||
    lexicon[String(sense.strongs).replace(/^0+/, "")];

  return {
    strongs: sense.strongs,
    lemma: entry?.lemma || null,
    gloss: sense.gloss,
    xlit: entry?.xlit || null,
    pron: sense.pron
  };
}
