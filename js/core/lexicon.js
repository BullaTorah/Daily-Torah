import { initLookup, resolveSense, lookupSenses as lookupLegacySenses } from "./lookup.js";
import {
  initTahotLookup,
  ensureTahotBooks,
  attachTahotTokens,
  resolveTahotSense,
  lookupTahotSenses
} from "./lookup-tahot.js";

const LEXICON_KEY = "torah-reader:lexicon";

let mode = "tahot";

export function resolveLexiconMode() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("lexicon");

  if (fromQuery === "tahot" || fromQuery === "legacy") {
    try {
      localStorage.setItem(LEXICON_KEY, fromQuery);
    } catch {
      /* ignore */
    }
    return fromQuery;
  }

  try {
    return localStorage.getItem(LEXICON_KEY) || "tahot";
  } catch {
    return "tahot";
  }
}

export function getLexiconMode() {
  return mode;
}

export async function initLexicon(options = {}) {
  const {
    mode: requestedMode = resolveLexiconMode(),
    legacyData,
    tahotData,
    verses,
    loadJSON
  } = options;

  mode = requestedMode;

  if (mode === "tahot") {
    initTahotLookup({
      glossData: tahotData?.gloss || legacyData?.gloss,
      frequencyData: tahotData?.frequency
    });

    if (verses?.length && loadJSON) {
      await ensureTahotBooks(verses, loadJSON);
      return attachTahotTokens(verses);
    }

    return verses || [];
  }

  if (legacyData) {
    initLookup(legacyData.wordLookup, legacyData.gloss, legacyData.frequency);
  }

  return verses || [];
}

export function resolveWord(ctx) {
  if (mode === "tahot") {
    return resolveTahotSense(ctx);
  }

  return resolveSense(ctx?.word || "");
}

export function lookupSenses(ctx) {
  if (mode === "tahot") {
    return lookupTahotSenses(ctx);
  }

  return lookupLegacySenses(ctx?.word || ctx);
}
