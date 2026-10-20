import { listWords } from "./word-bank.js";
import { normalizeStrongs } from "./strongs.js";
import { getSupabase, isLoggedIn } from "./auth.js";
import { DIFFICULTY_STEPS } from "./difficulty.js";
import { selectPracticeWords } from "./daily-vocab.js";
import {
  listRankedLemmas,
  lookupLemmaBySurface
} from "./lookup-tahot.js";

const STORY_WORD_CAP = 16;
/** Keep Groq prompts under free-tier TPM; validation still uses the full rank ceiling. */
const FILLER_PROMPT_CAP = 60;
/** Beginner hides nothing, so stories may only add the most common Torah lemmas. */
const BEGINNER_FILLER_RANK = 40;

function strongsKey(value) {
  const id = normalizeStrongs(value);
  if (!id) return "";
  return id.replace(/^0+/, "") || "0";
}

function levelLabel(level) {
  const match = DIFFICULTY_STEPS.find((step) => step.value === Number(level));
  return match?.label || "Reader";
}

/**
 * Rank ceiling for filler words.
 * null means Advanced: fillers are unrestricted.
 * @param {number} level
 * @returns {number | null}
 */
export function fillerRankCeiling(level) {
  const value = Number(level) || 0;
  if (value <= 0) return BEGINNER_FILLER_RANK;
  if (value >= 999999) return null;
  return value;
}

function normalizeSurface(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\u05D0-\u05EA]/g, "");
}

function toPayloadWord(word) {
  return {
    strongs: strongsKey(word.strongs),
    lemma: word.lemma || "",
    gloss: word.gloss || "",
    surface_example: word.surface_example || word.surfaceExample || ""
  };
}

async function readFunctionError(error) {
  if (!error) return "Could not generate a practice story.";

  try {
    const context = error.context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      if (body?.code === "NO_API_KEY") {
        return "Practice is not configured yet (missing Groq API key on the server).";
      }
      if (body?.error) {
        return body.detail
          ? `${body.error}: ${String(body.detail).slice(0, 200)}`
          : body.error;
      }
    }
    if (context && typeof context.text === "function") {
      const text = await context.text();
      if (text) return text.slice(0, 300);
    }
  } catch {
    /* fall through */
  }

  return error.message || "Could not generate a practice story.";
}

async function requestStory(words, allowedFillers, levelName, fillersUnrestricted, issues) {
  const supabase = getSupabase();
  if (!supabase || !isLoggedIn()) {
    throw new Error("Sign in to load a practice story.");
  }

  const { data, error } = await supabase.functions.invoke("practice-story", {
    body: {
      words,
      allowedFillers,
      levelLabel: levelName,
      fillersUnrestricted,
      issues
    }
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  if (data?.error) {
    if (data.code === "NO_API_KEY") {
      throw new Error(
        "Practice is not configured yet (missing Groq API key on the server)."
      );
    }
    throw new Error(
      data.detail
        ? `${data.error}: ${String(data.detail).slice(0, 200)}`
        : data.error || "Could not generate a practice story."
    );
  }

  const he = String(data?.he || "").trim();
  const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
  if (!he || !tokens.length) {
    throw new Error("No practice story returned.");
  }

  return {
    he,
    en: String(data?.en || "").trim(),
    tokens
  };
}

function tokensFromStory(story) {
  const given = Array.isArray(story?.tokens) ? story.tokens : [];
  const usable = given
    .map((token) => ({
      surface: String(token?.surface || "").trim(),
      strongs: strongsKey(token?.strongs),
      role: token?.role === "target" ? "target" : "filler"
    }))
    .filter((token) => token.surface);

  if (usable.length) return usable;

  return String(story?.he || "")
    .split(/\s+/)
    .map((surface) => surface.trim())
    .filter(Boolean)
    .map((surface) => ({ surface, strongs: "", role: "filler" }));
}

function fillerIsAllowed(surface, ceiling, allowedIds) {
  if (ceiling == null) return true;
  const sense = lookupLemmaBySurface(surface);
  if (!sense?.strongs) return false;
  const id = strongsKey(sense.strongs);
  if (id && allowedIds.has(id)) return true;
  const rank = Number(sense.rank);
  return rank > 0 && rank <= ceiling;
}

/**
 * Check that every practice word is a target token, and fillers are in range.
 * @param {{ tokens?: Array, he?: string }} story
 * @param {Array} words
 * @param {{ ceiling: number | null, allowedIds: Set<string> }} limits
 */
export function assessStory(story, words, { ceiling, allowedIds }) {
  const targetIds = new Set(
    words.map((word) => strongsKey(word.strongs)).filter(Boolean)
  );
  const seen = new Set();

  const tokens = tokensFromStory(story).map((token) => {
    const letters = normalizeSurface(token.surface);
    if (!letters) {
      return { ...token, role: "filler", problem: null };
    }

    const isTarget =
      token.role === "target" && token.strongs && targetIds.has(token.strongs);
    if (isTarget) {
      seen.add(token.strongs);
      return { ...token, role: "target", problem: null };
    }

    const allowed = fillerIsAllowed(token.surface, ceiling, allowedIds);
    return {
      ...token,
      role: "filler",
      problem: allowed ? null : "above-level"
    };
  });

  const missing = words.filter((word) => !seen.has(strongsKey(word.strongs)));
  const aboveLevel = tokens.filter((token) => token.problem === "above-level");
  const packed = packedSentences(tokens);

  return {
    tokens,
    missing,
    packed,
    ok: missing.length === 0 && aboveLevel.length === 0 && packed.length === 0
  };
}

function packedSentences(tokens) {
  const packed = [];
  let count = 0;
  let surfaces = [];
  const flush = () => {
    if (count > 2) packed.push(surfaces.join(" "));
    count = 0;
    surfaces = [];
  };

  tokens.forEach((token) => {
    if (token.role === "target") {
      count += 1;
      if (token.surface) surfaces.push(token.surface);
    }
    if (/[׃.!?]/.test(token.surface || "")) flush();
  });
  flush();
  return packed.slice(0, 12);
}

function issuesFromAssessment(assessment) {
  return {
    missing: assessment.missing.map((word) => ({
      strongs: strongsKey(word.strongs),
      lemma: word.lemma || "",
      gloss: word.gloss || ""
    })),
    aboveLevel: assessment.tokens
      .filter((token) => token.problem === "above-level")
      .map((token) => token.surface)
      .slice(0, 40),
    packed: assessment.packed || []
  };
}

/**
 * Generate one story that uses the practice list (up to 40 words).
 * Retries once when a target is missing, a filler is above the reading level,
 * or a sentence holds more than two practice words.
 * @param {{ level: number, ensureLexicon?: () => Promise<void> }} options
 */
export async function loadPracticeStory({ level, ensureLexicon }) {
  if (ensureLexicon) await ensureLexicon();

  const all = listWords();
  if (!all.length) return null;

  const selected =
    all.length > STORY_WORD_CAP
      ? selectPracticeWords(STORY_WORD_CAP)
      : [...all];
  const words = selected.map(toPayloadWord).filter((word) => word.strongs);
  if (!words.length) return null;

  const ceiling = fillerRankCeiling(level);
  const fillersUnrestricted = ceiling == null;
  const ranked = fillersUnrestricted ? [] : listRankedLemmas(ceiling);
  if (!fillersUnrestricted && !ranked.length) {
    throw new Error("Word frequencies are not loaded yet.");
  }

  const allowedFillers = ranked.slice(0, FILLER_PROMPT_CAP).map((row) => ({
    strongs: strongsKey(row.strongs),
    lemma: row.lemma
  }));
  const allowedIds = new Set(
    ranked.map((row) => strongsKey(row.strongs)).filter(Boolean)
  );
  const name = levelLabel(level);
  const limits = { ceiling, allowedIds };

  let story = await requestStory(
    words,
    allowedFillers,
    name,
    fillersUnrestricted,
    null
  );
  let assessment = assessStory(story, words, limits);
  if (!assessment.ok) {
    story = await requestStory(
      words,
      allowedFillers,
      name,
      fillersUnrestricted,
      issuesFromAssessment(assessment)
    );
    assessment = assessStory(story, words, limits);
  }

  return {
    he: story.he,
    en: story.en,
    tokens: assessment.tokens,
    missing: assessment.missing.map((word) => ({
      strongs: strongsKey(word.strongs),
      lemma: word.lemma || word.gloss || word.strongs
    })),
    omittedCount: Math.max(0, all.length - words.length),
    usedCount: words.length,
    levelLabel: name,
    beginnerFillers: Number(level) <= 0,
    fillersUnrestricted
  };
}
