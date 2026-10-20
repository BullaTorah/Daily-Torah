import { getSupabase, isLoggedIn } from "./auth.js";

const cache = new Map();

function cacheKey({ verseRef, surface, strongs }) {
  return `v12|${verseRef || ""}|${surface || ""}|${strongs || ""}`;
}

function enOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") return String(value.en || "").trim();
  return "";
}

function heOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") return String(value.he || "").trim();
  return "";
}

function normalizePart(value) {
  const he = heOf(value);
  const en = enOf(value);
  if (!he) return null;
  return { he, en };
}

function normalizeExplanation(data, surface = "") {
  const rootHe = heOf(data?.root) || surface;
  const rootEn = enOf(data?.root);
  if (!rootHe) return null;

  const literal = String(data?.literal || "").trim();
  const grammar = String(data?.grammar || "").trim();
  const takeaway = String(data?.takeaway || "").trim();

  return {
    root: { he: rootHe, en: rootEn || "Core meaning of this word." },
    prefix: normalizePart(data?.prefix),
    suffix: normalizePart(data?.suffix),
    literal: literal || null,
    grammar: grammar || null,
    takeaway: takeaway || null
  };
}

async function readFunctionError(error) {
  if (!error) return "Could not explain this word.";

  try {
    const context = error.context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      if (body?.code === "NO_API_KEY") {
        return "Explain is not configured yet (missing Groq API key on the server).";
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

  return error.message || "Could not explain this word.";
}

/**
 * @returns {Promise<{
 *   root: { he: string, en: string },
 *   prefix: { he: string, en: string }|null,
 *   suffix: { he: string, en: string }|null,
 *   literal: string|null,
 *   grammar: string|null,
 *   takeaway: string|null
 * }>}
 */
export async function explainWord(payload = {}) {
  if (!isLoggedIn()) {
    throw new Error("Sign in to use Explain.");
  }

  const key = cacheKey(payload);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Sign in to use Explain.");
  }

  const segments = Array.isArray(payload.segments) ? payload.segments : [];

  const { data, error } = await supabase.functions.invoke("explain-word", {
    body: {
      surface: payload.surface || "",
      lemma: payload.lemma || "",
      gloss: payload.gloss || "",
      strongs: payload.strongs || "",
      morph: payload.morph || "",
      segments,
      translation: payload.translation || payload.gloss || "",
      verseHe: payload.verseHe || "",
      verseEn: payload.verseEn || "",
      verseRef: payload.verseRef || ""
    }
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  if (data?.error) {
    if (data.code === "NO_API_KEY") {
      throw new Error(
        "Explain is not configured yet (missing Groq API key on the server)."
      );
    }
    throw new Error(
      data.detail
        ? `${data.error}: ${String(data.detail).slice(0, 200)}`
        : data.error || "Could not explain this word."
    );
  }

  const explanation = normalizeExplanation(data, payload.surface || "");
  if (!explanation) {
    throw new Error("No explanation returned.");
  }

  cache.set(key, explanation);
  return explanation;
}

export function getCachedExplanation(payload = {}) {
  return cache.get(cacheKey(payload)) || null;
}
