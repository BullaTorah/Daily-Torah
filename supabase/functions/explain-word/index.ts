// Supabase Edge Function: plain-language root/conjugation explain via Groq.
// Secret required: GROQ_API_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function buildPrompt(payload: {
  surface?: string;
  lemma?: string;
  gloss?: string;
  strongs?: string;
  morph?: string;
  segments?: string[];
  translation?: string;
  verseHe?: string;
  verseEn?: string;
  verseRef?: string;
}) {
  const segmentLine =
    payload.segments && payload.segments.length
      ? payload.segments.join(" | ")
      : "—";

  return `Explain a Biblical Hebrew word for a beginner. Be brief.

Tone: plain sticky-note English. No fluff. Friendly tutor voice.

Part A — split the surface form into Hebrew parts yourself:
- prefix.he = attached letters at the start (article הַ/הָ, preposition בְּ/לְ/כְּ/מִ, conjunction ו, etc.), or null
- root.he = the core stem / lexical body (required)
- suffix.he = ending letters (pronoun/object/feminine/plural ending, etc.), or null
- Every "he" value must be real Hebrew copied from the surface (or a clear substring of it). Do not invent letters.
- prefix.he + root.he + suffix.he (skipping nulls) should reconstruct the surface as closely as possible.
- English "en" for each included part: max ~18 words, plain language.

Part B — a short reading note:
- literal: a short literal English for THIS form in context (headline style), e.g. "And he went", "In the beginning", "The heavens". Not a dictionary dump. 2–6 words preferred.
- grammar: 2–4 short sentences for a beginner about THIS word in THIS verse, then a final summary sentence.
  Voice: everyday English. Fine to use simple words like plural, past, future, he/she, "the".
  Avoid jargon unless you briefly explain it in the same breath (e.g. never bare "construct" — say something like "a construct form, meaning it belongs with the next noun"). Prefer explaining the idea without the label when you can.
  If you mention how this word connects to other words in the verse, name those words specifically in Hebrew and/or English from the verse (e.g. "it pairs with מִבְחַר / 'choicest'"). Never say vague phrases like "nearby words", "the next word", or "other words in the sentence" without naming them.
  Do not invent verse facts. Stay grounded in the Hebrew/English verse given.
  About 40–70 words for grammar (before takeaway).
  End grammar with a short lead-in only, e.g. "making it" / "so it reads" / "so here it means" — do NOT put the English gloss inside grammar.
  takeaway: the exact short English meaning alone (no quotes, no **), e.g. the choicest of. The app will bold this after your lead-in.

Important JSON rules:
- Return valid JSON only. Escape every double-quote inside string values as \\".
- Prefer apostrophes in English prose instead of quotation marks.
- Never put markdown ** inside JSON values.

Hints (optional — you still choose the split):
Known lexicon segments: ${segmentLine}
Segmented gloss: ${payload.translation || payload.gloss || "—"}
Lemma: ${payload.lemma || "—"}
Morphology: ${payload.morph || "—"}
Surface: ${payload.surface || "—"}
Verse: ${payload.verseRef || "—"}
Hebrew verse: ${payload.verseHe || "—"}
English verse: ${payload.verseEn || "—"}

ONLY JSON:
{"prefix":{"he":"...","en":"..."}|null,"root":{"he":"...","en":"..."},"suffix":{"he":"...","en":"..."}|null,"literal":"...","grammar":"...","takeaway":"..."}`;
}

function extractJson(text: string) {
  const raw = String(text || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const tryParse = (value: string) => JSON.parse(value);

  try {
    return tryParse(raw);
  } catch {
    /* continue */
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return JSON");
  }

  let slice = raw.slice(start, end + 1);
  try {
    return tryParse(slice);
  } catch {
    /* repair common model mistakes */
  }

  // Smart quotes → straight quotes outside already-escaped sequences is hard;
  // normalize curly quotes first, then escape bare quotes inside string values.
  slice = slice
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  try {
    return tryParse(slice);
  } catch {
    /* continue */
  }

  // Repair unescaped " inside JSON string values
  let repaired = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (escaped) {
      repaired += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      repaired += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        repaired += ch;
        continue;
      }
      // Look ahead: end of string if next non-space is , } : or ]
      let j = i + 1;
      while (j < slice.length && /\s/.test(slice[j])) j++;
      const next = slice[j] || "";
      if (next === "," || next === "}" || next === "]" || next === ":" || next === "") {
        inString = false;
        repaired += ch;
      } else {
        repaired += '\\"';
      }
      continue;
    }
    repaired += ch;
  }

  try {
    return tryParse(repaired);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    throw new Error(message);
  }
}

function enOf(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String((value as { en?: unknown }).en || "").trim();
  }
  return "";
}

function heOf(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String((value as { he?: unknown }).he || "").trim();
  }
  return "";
}

function partFrom(value: unknown, fallbackHe = "") {
  const he = heOf(value) || fallbackHe;
  const en = enOf(value);
  if (!he && !en) return null;
  if (!he) return null;
  return { he, en: en || "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnon) {
      return jsonResponse({ error: "Supabase env not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnon);
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return jsonResponse(
        { error: "Unauthorized", detail: userError?.message || "No user" },
        401
      );
    }

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      return jsonResponse(
        { error: "GROQ_API_KEY not set", code: "NO_API_KEY" },
        503
      );
    }

    const body = await req.json();
    const surface = String(body?.surface || "").trim();
    if (!surface && !body?.lemma && !body?.strongs) {
      return jsonResponse({ error: "No word provided" }, 400);
    }

    const segments = Array.isArray(body?.segments)
      ? body.segments.map((s: unknown) => String(s || "").trim()).filter(Boolean)
      : [];

    const payload = {
      surface,
      lemma: String(body?.lemma || "").trim(),
      gloss: String(body?.gloss || "").trim(),
      strongs: String(body?.strongs || "").trim(),
      morph: String(body?.morph || "").trim(),
      segments,
      translation: String(body?.translation || body?.gloss || "").trim(),
      verseHe: String(body?.verseHe || "").trim(),
      verseEn: String(body?.verseEn || "").trim(),
      verseRef: String(body?.verseRef || "").trim()
    };

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You explain Biblical Hebrew in tiny plain bites for beginners. Separate the surface into prefix/root/suffix yourself, then add literal, grammar, and takeaway fields. No unexplained jargon. Name specific words when describing relationships. Put the exact English meaning ONLY in takeaway (no quotes/markdown). End grammar with a lead-in like making it. Never write more than one short sentence per en field. Output valid JSON only."
          },
          { role: "user", content: buildPrompt(payload) }
        ]
      })
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text();
      return jsonResponse(
        { error: "Groq request failed", detail: detail.slice(0, 500) },
        502
      );
    }

    const groqJson = await groqRes.json();
    const content = groqJson?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);

    const root = partFrom(parsed?.root, surface);
    if (!root?.he) {
      return jsonResponse({ error: "Model returned no root" }, 502);
    }
    if (!root.en) {
      root.en = payload.gloss || "Core meaning of this word.";
    }

    const prefix = partFrom(parsed?.prefix);
    const suffix = partFrom(parsed?.suffix);
    const literal = String(parsed?.literal || "").trim();
    const grammar = String(parsed?.grammar || "").trim();
    const takeaway = String(parsed?.takeaway || "").trim();

    return jsonResponse({
      root,
      prefix: prefix?.en ? prefix : prefix?.he ? { ...prefix, en: "A prefix on this word." } : null,
      suffix: suffix?.en ? suffix : null,
      literal: literal || null,
      grammar: grammar || null,
      takeaway: takeaway || null
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
