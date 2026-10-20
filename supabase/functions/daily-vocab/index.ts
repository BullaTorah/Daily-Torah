// Supabase Edge Function: generate simple biblical practice sentences via Groq.
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

function buildPrompt(
  words: Array<{
    strongs?: string;
    lemma?: string;
    gloss?: string;
    surface_example?: string;
    surfaceExample?: string;
  }>
) {
  const wordLines = words
    .map(
      (w, i) =>
        `${i + 1}. Strong's ${w.strongs}; lemma: ${w.lemma || "—"}; gloss: ${w.gloss || "—"}; example form: ${w.surface_example || w.surfaceExample || "—"}`
    )
    .join("\n");

  return `You write short Biblical Hebrew practice sentences for Torah learners.

For EACH word below, write ONE short sentence in pointed Biblical Hebrew that uses that word (or a natural inflected form of it).

Rules:
- Content must be factually accurate about Bible (Tanakh) people, places, objects, or events. No modern or invented stories.
- Keep the rest of the sentence in SIMPLE, common Biblical Hebrew so only the target vocabulary word is likely hard.
- Hebrew sentence: at most 6 words. One simple clause only — no lists, no relative clauses, no long name strings.
- Prefer a short subject–verb–object pattern.
- English translation must be equally brief (one short sentence).
- Provide a clear, natural English translation.
- Return the exact Hebrew surface form of the target word as it appears in your sentence (target_surface).
- Prefer common forms of the target word.

Words:
${wordLines}

Respond with ONLY valid JSON (no markdown) shaped like:
{"sentences":[{"strongs":"1234","he":"...","en":"...","target_surface":"..."}]}
One object per input word, same strongs ids, same order.`;
}

function extractJson(text: string) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Model did not return JSON");
  }
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
    const words = Array.isArray(body?.words) ? body.words.slice(0, 3) : [];
    if (!words.length) {
      return jsonResponse({ error: "No words provided" }, 400);
    }

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a careful Biblical Hebrew tutor. Output only JSON matching the user's schema. No markdown fences."
          },
          { role: "user", content: buildPrompt(words) }
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
    const sentences = Array.isArray(parsed?.sentences) ? parsed.sentences : [];

    if (!sentences.length) {
      return jsonResponse(
        { error: "Empty model response", detail: String(content).slice(0, 300) },
        502
      );
    }

    return jsonResponse({ sentences });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
