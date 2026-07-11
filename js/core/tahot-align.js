import { consonantal, displaySurface, cleanTahotSurface } from "./normalize-hebrew.js";

function tahotConsonantal(token) {
  const surface = cleanTahotSurface(token.surface || displaySurface(token.hebrew));
  return consonantal(surface);
}

function sefariaConsonantal(surface) {
  return consonantal(surface);
}

function tokensConsonantallyMatch(surface, tahotToken) {
  const left = sefariaConsonantal(surface);
  const right = tahotConsonantal(tahotToken);
  if (!left || !right) return false;
  return left === right;
}

/**
 * Align Sefaria token strings to TAHOT verse tokens by consonantal form.
 * Returns one entry per Sefaria token (display order preserved).
 */
export function alignVerseTokens(sefariaTokens, tahotTokens) {
  if (!tahotTokens?.length) {
    return sefariaTokens.map((surface, index) => ({
      index: index + 1,
      surface,
      tahot: null,
      aligned: false
    }));
  }

  const aligned = [];
  let tahotIdx = 0;

  for (let i = 0; i < sefariaTokens.length; i++) {
    const surface = sefariaTokens[i];
    let match = null;

    if (
      tahotIdx < tahotTokens.length &&
      tokensConsonantallyMatch(surface, tahotTokens[tahotIdx])
    ) {
      match = tahotTokens[tahotIdx];
      tahotIdx += 1;
    } else {
      const searchEnd = Math.min(tahotTokens.length, tahotIdx + 4);
      for (let j = tahotIdx; j < searchEnd; j++) {
        if (tokensConsonantallyMatch(surface, tahotTokens[j])) {
          match = tahotTokens[j];
          tahotIdx = j + 1;
          break;
        }
      }
    }

    aligned.push({
      index: i + 1,
      surface,
      tahot: match,
      aligned: Boolean(match)
    });
  }

  return aligned;
}

export function summarizeAlignment(verses) {
  let total = 0;
  let matched = 0;
  const gaps = [];

  for (const verse of verses) {
    for (const token of verse.tokens || []) {
      total += 1;
      if (token.aligned) {
        matched += 1;
      } else if (gaps.length < 20) {
        gaps.push({
          ref: verse.ref,
          surface: token.surface
        });
      }
    }
  }

  return {
    total,
    matched,
    rate: total ? matched / total : 1,
    gaps
  };
}
