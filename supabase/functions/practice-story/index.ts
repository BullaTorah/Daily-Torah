// Supabase Edge Function: one simple Hebrew practice story via Groq.
// Secret required: GROQ_API_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const MAX_WORDS = 16;
/** Keep prompts under free-tier ~8k TPM (input + completion). */
const MAX_FILLERS = 60;
const MAX_COMPLETION_TOKENS = 8192;

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

function clip(value: unknown, max = 80) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildPrompt(body: {
  words: Array<{
    strongs?: string;
    lemma?: string;
    gloss?: string;
    surface_example?: string;
  }>;
  allowedFillers: Array<{ strongs?: string; lemma?: string }>;
  levelLabel: string;
  fillersUnrestricted: boolean;
  issues: {
    missing: Array<{ strongs?: string; lemma?: string; gloss?: string }>;
    aboveLevel: string[];
    packed: string[];
  } | null;
}) {
  const wordLines = body.words
    .map(
      (w, i) =>
        `${i + 1}. Strong's ${clip(w.strongs, 12)}; lemma: ${clip(w.lemma) || "—"}; gloss: ${clip(w.gloss) || "—"}; example form: ${clip(w.surface_example) || "—"}`
    )
    .join("\n");

  const sentenceCount = Math.min(12, Math.max(4, Math.ceil(body.words.length * 0.75)));
  const fillerRule = body.fillersUnrestricted
    ? `Filler words may be any common Biblical Hebrew. Do not use rare or poetic words except the targets.`
    : `Every word that is not a target MUST be one of the allowed filler lemmas below, or a normal prefix or ending on one of those lemmas. Do not introduce any other root.

Allowed fillers (Strong's then lemma), most common first:
${body.allowedFillers
  .map((w) => `${clip(w.strongs, 12)} ${clip(w.lemma, 40)}`)
  .join("\n")}`;

  let retry = "";
  if (body.issues) {
    const missing = body.issues.missing
      .map(
        (w) =>
          `Strong's ${clip(w.strongs, 12)} (${clip(w.lemma) || "—"}, ${clip(w.gloss) || "—"})`
      )
      .join("; ");
    const above = body.issues.aboveLevel.map((w) => clip(w, 40)).join(", ");
    const packed = body.issues.packed.map((w) => clip(w, 120)).join(" | ");
    retry = `
The previous story failed these checks. Rewrite the whole story.
${missing ? `- Missing targets that must appear: ${missing}` : ""}
${above ? `- These words are not allowed. Do not use them: ${above}` : ""}
${packed ? `- These practice words were crowded into one sentence. Split them so no sentence has more than 2 practice words: ${packed}` : ""}
`;
  }

  return `You write one short, engaging practice story in pointed Biblical Hebrew for a learner at the ${clip(body.levelLabel, 24) || "current"} reading level.

Goal: a clear little narrative with a bit of life — curiosity, a small problem, or a satisfying ending — like a children's reader. NOT a Bible paraphrase and NOT a list of vocabulary drills.

Good style (English example of the feel we want):
"The man was from Seir. He lived in a house. He counted the other houses. There were many houses to the north. He walked there and found a friend."

Bad style (never do this):
- Repeating the same frame: "God X and it was. God Y and it was…"
- Stacking target lemmas with almost no story
- Quoting or retelling real Tanakh verses
- Making every sentence about God / Israel / temple themes just because the glosses sound biblical
- Flat lists with no through-line

Story rules:
- Invent a small everyday scene (travel, home, work, family, animals, weather, a short errand). Biblical-era color is fine but not required. Give it one simple thread: someone wants something, goes somewhere, or notices something.
- Use EVERY target word below once, in a natural inflected form that fits the plot.
- About ${sentenceCount} short sentences. End each Hebrew sentence with ׃.
- Prefer 1 target word per sentence (never more than 2).
- Each sentence should advance the story (who / where / what happens next). Vary subjects and verbs.
- Do not place target words next to each other.
- English must be the same simple story in plain sentences — not a gloss list.
- ${fillerRule}
- Point every Hebrew word.
- tokens follow the Hebrew in order, one object per Hebrew word. Keep the ׃ on the last word of each sentence.
- role is "target" only for the practice words below. Put that word's Strong's id on the token.
- role is "filler" for every other word. When a filler list is given, put that lemma's Strong's id on the token.
${retry}
Target words:
${wordLines}

Respond with ONLY valid JSON (no markdown) shaped like:
{"he":"...","en":"...","tokens":[{"surface":"...","strongs":"1234","role":"target"}]}
Escape every double-quote inside strings. Do not truncate the JSON.`;
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
      let j = i + 1;
      while (j < slice.length && /\s/.test(slice[j])) j++;
      const next = slice[j] || "";
      if (
        next === "," ||
        next === "}" ||
        next === "]" ||
        next === ":" ||
        next === ""
      ) {
        inString = false;
        repaired += ch;
      } else {
        repaired += '\\"';
      }
      continue;
    }
    // Strip other control chars that break JSON.parse
    if (ch === "\n" || ch === "\r" || ch === "\t") {
      repaired += inString ? "\\n" : ch;
      continue;
    }
    if (ch < " ") continue;
    repaired += ch;
  }

  try {
    return tryParse(repaired);
  } catch {
    throw new Error("Model did not return JSON");
  }
}

function messageText(message: Record<string, unknown> | null | undefined) {
  if (!message || typeof message !== "object") return "";
  const content = message.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text || "");
        }
        return "";
      })
      .join("");
    if (joined.trim()) return joined;
  }
  // Do not use message.reasoning — for gpt-oss that is planning prose, not the story JSON.
  return "";
}

function asWordList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((row) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return {
      strongs: clip(item.strongs, 16),
      lemma: clip(item.lemma, 80),
      gloss: clip(item.gloss, 80),
      surface_example: clip(item.surface_example || item.surfaceExample, 80)
    };
  }).filter((item) => item.strongs);
}

function asIssues(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const missing = Array.isArray(raw.missing)
    ? raw.missing.slice(0, MAX_WORDS).map((row) => {
      const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
      return {
        strongs: clip(item.strongs, 16),
        lemma: clip(item.lemma, 80),
        gloss: clip(item.gloss, 80)
      };
    }).filter((item) => item.strongs || item.lemma)
    : [];
  const aboveLevel = Array.isArray(raw.aboveLevel)
    ? raw.aboveLevel.slice(0, 40).map((item) => clip(item, 40)).filter(Boolean)
    : [];
  const packed = Array.isArray(raw.packed)
    ? raw.packed.slice(0, 12).map((item) => clip(item, 120)).filter(Boolean)
    : [];
  if (!missing.length && !aboveLevel.length && !packed.length) return null;
  return { missing, aboveLevel, packed };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(payload: Record<string, unknown>, groqKey: string) {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    lastRes = groqRes;
    if (groqRes.status !== 429) return groqRes;

    const retryAfter = Number(groqRes.headers.get("retry-after") || "8");
    const waitMs = Math.min(25_000, Math.max(2_000, retryAfter * 1000));
    await sleep(waitMs);
  }
  return lastRes as Response;
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
    const words = asWordList(body?.words, MAX_WORDS);
    if (!words.length) {
      return jsonResponse({ error: "No words provided" }, 400);
    }

    const allowedFillers = asWordList(body?.allowedFillers, MAX_FILLERS).map((item) => ({
      strongs: item.strongs,
      lemma: item.lemma
    })).filter((item) => item.lemma);
    const fillersUnrestricted = Boolean(body?.fillersUnrestricted);

    const prompt = buildPrompt({
      words,
      allowedFillers,
      levelLabel: clip(body?.levelLabel, 24),
      fillersUnrestricted,
      issues: asIssues(body?.issues)
    });

    const groqPayload = {
      model: GROQ_MODEL,
      temperature: 0.3,
      // Keep chain-of-thought out of content so completion tokens go to JSON
      reasoning_effort: "low",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: "system",
          content:
            "You write engaging practice stories in pointed Biblical Hebrew. Prioritize a clear everyday narrative with a simple through-line over biblical themes. Never output vocabulary drills or repeated 'and it was' frames. Your entire reply must be one JSON object with keys he (string), en (string), and tokens (array). No markdown. No planning text."
        },
        { role: "user", content: prompt }
      ]
    };

    const groqRes = await callGroq(groqPayload, groqKey);

    if (!groqRes.ok) {
      const detail = await groqRes.text();
      const rateLimited = groqRes.status === 429;
      const jsonFailed = /json_validate_failed|Failed to validate JSON/i.test(detail);
      return jsonResponse(
        {
          error: rateLimited
            ? "Groq rate limit — wait a moment and try again"
            : jsonFailed
              ? "Model failed to build JSON — try again"
              : "Groq request failed",
          detail: detail.slice(0, 500),
          code: rateLimited ? "RATE_LIMIT" : jsonFailed ? "BAD_JSON" : undefined
        },
        rateLimited ? 429 : 502
      );
    }

    const groqJson = await groqRes.json();
    const choice = groqJson?.choices?.[0] || {};
    const message = choice.message || {};
    const finishReason = String(choice.finish_reason || "");
    const content = messageText(message);
    if (!content.trim() || !content.includes("{")) {
      return jsonResponse(
        {
          error: "Model returned no JSON story",
          detail: String(content || `finish_reason=${finishReason || "unknown"}`).slice(
            0,
            400
          ),
          code: "EMPTY_CONTENT"
        },
        502
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(content) as Record<string, unknown>;
    } catch {
      return jsonResponse(
        {
          error: "Model did not return JSON",
          detail: String(content).slice(0, 400),
          code: "BAD_JSON"
        },
        502
      );
    }
    // Incomplete JSON from hitting the token cap
    if (finishReason === "length" && (!parsed?.he || !Array.isArray(parsed?.tokens))) {
      return jsonResponse(
        {
          error: "Story was cut off — try again",
          detail: String(content).slice(0, 300),
          code: "TRUNCATED"
        },
        502
      );
    }
    const he = String(parsed?.he || "").trim();
    const en = String(parsed?.en || "").trim();
    const tokens = Array.isArray(parsed?.tokens) ? parsed.tokens : [];

    if (!he || !tokens.length) {
      return jsonResponse(
        { error: "Empty model response", detail: String(content).slice(0, 300) },
        502
      );
    }

    return jsonResponse({
      he,
      en,
      tokens: tokens.slice(0, 400).map((row) => {
        const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
        const role = item.role === "target" ? "target" : "filler";
        return {
          surface: clip(item.surface, 80),
          strongs: clip(item.strongs, 16),
          role
        };
      }).filter((item) => item.surface)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
