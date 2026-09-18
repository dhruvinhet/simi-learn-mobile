import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, json } from "../_shared/http.ts";
import { systemPrompt, validateLesson, type Issue } from "../_shared/lesson.ts";

type RequestBody = { topic: string; audienceLevel: "middle-school" | "high-school" | "college"; durationSeconds: 45 | 60 | 90; locale: string; requestId: string };
const REQUEST_ID = /^[a-z0-9-]{8,80}$/i;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function validRequest(value: unknown): value is RequestBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.topic === "string" && body.topic.trim().length >= 5 && body.topic.length <= 240
    && ["middle-school", "high-school", "college"].includes(String(body.audienceLevel))
    && [45, 60, 90].includes(Number(body.durationSeconds))
    && typeof body.locale === "string" && body.locale.length <= 16
    && typeof body.requestId === "string" && REQUEST_ID.test(body.requestId);
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseModelJson(content: string): unknown {
  const cleaned = content.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
  return JSON.parse(cleaned);
}

async function callGroq(apiKey: string, messages: { role: "system" | "user"; content: string }[], signal: AbortSignal): Promise<unknown> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b",
      temperature: 0.25,
      max_completion_tokens: 6500,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Groq ${response.status}: ${details.slice(0, 300)}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq returned no lesson JSON.");
  return parseModelJson(content);
}

async function generateWithKeys(keys: string[], messages: { role: "system" | "user"; content: string }[]): Promise<unknown> {
  let lastError: unknown;
  for (let index = 0; index < keys.length; index++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      return await callGroq(keys[index]!, messages, controller.signal);
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number }).status;
      if (status === 429 && index < keys.length - 1) await wait(150 + index * 200);
      else if (status && status < 500 && status !== 429) throw error;
    } finally { clearTimeout(timeout); }
  }
  throw lastError ?? new Error("No generation provider was available.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "method_not_allowed", message: "Use POST." }, 405);
  try {
    const body: unknown = await request.json();
    if (!validRequest(body)) return json({ code: "invalid_request", message: "Topic, level, duration, locale, and requestId are required." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ code: "service_configuration", message: "Generation storage is unavailable." }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = request.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    const userResult = accessToken ? await admin.auth.getUser(accessToken) : { data: { user: null } };
    const userId = userResult.data.user?.id ?? null;
    if (!userId) return json({ code: "unauthorized", message: "A valid guest or member session is required." }, 401);
    const clientHash = await digest(userId);

    const { data: existing } = await admin.from("generation_requests").select("response,status").eq("request_id", body.requestId).maybeSingle();
    if (existing?.status === "complete" && existing.response) return json(existing.response);

    const { count } = await admin.from("generation_requests").select("request_id", { count: "exact", head: true }).eq("owner_id", userId).eq("status", "complete");
    let pro = false;
    if (userId) {
      const { data: entitlement } = await admin.from("entitlements").select("expires_at").eq("app_user_id", userId).eq("entitlement_id", "pro").maybeSingle();
      pro = Boolean(entitlement && (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date()));
    }
    const limit = pro ? 30 : 3;
    if ((count ?? 0) >= limit) return json({ code: "quota_exceeded", message: "Lesson allowance reached.", limit }, 429);

    await admin.from("generation_requests").upsert({
      request_id: body.requestId,
      owner_id: userId,
      client_hash: clientHash,
      topic_hash: await digest(body.topic.trim().toLowerCase()),
      status: "processing",
    }, { onConflict: "request_id" });

    const keys = (Deno.env.get("GROQ_API_KEYS") ?? "").split(",").map((key) => key.trim()).filter(Boolean);
    if (!keys.length) return json({ code: "service_configuration", message: "The lesson planner is not configured." }, 503);
    const seed = parseInt((await digest(body.requestId)).slice(0, 8), 16);
    const orderedKeys = keys.map((_, index) => keys[(seed + index) % keys.length]!);
    const userPrompt = `Create a ${body.durationSeconds}-second lesson.
Topic: ${body.topic}
Audience: ${body.audienceLevel}
Locale: ${body.locale}
lessonId: ${body.requestId}
createdAt: ${new Date().toISOString()}`;

    let lesson = await generateWithKeys(orderedKeys, [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]);
    let issues: Issue[] = validateLesson(lesson);
    if (issues.length) {
      lesson = await generateWithKeys(orderedKeys, [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "user", content: `Repair the following candidate. Change only what is needed and return the entire corrected JSON.
Validation failures: ${JSON.stringify(issues)}
Candidate: ${JSON.stringify(lesson)}` },
      ]);
      issues = validateLesson(lesson);
    }
    if (issues.length) {
      await admin.from("generation_requests").update({ status: "rejected", error_code: "quality_gate" }).eq("request_id", body.requestId);
      return json({ code: "quality_gate", message: "The generated lesson did not pass factual and visual checks. No fallback was used.", issues: issues.slice(0, 10) }, 422);
    }
    const { error: saveError } = await admin.from("generation_requests").update({ status: "complete", response: lesson, completed_at: new Date().toISOString() }).eq("request_id", body.requestId);
    if (saveError) return json({ code: "storage_error", message: "The validated lesson could not be saved." }, 503);
    return json(lesson, 200, { "X-Simi-Quality-Gate": "passed" });
  } catch (error) {
    console.error(error);
    if (error instanceof DOMException && error.name === "AbortError") return json({ code: "provider_timeout", message: "The lesson planner timed out. Retry safely with the same requestId." }, 504);
    const status = (error as { status?: number }).status;
    if (status === 429) return json({ code: "provider_busy", message: "All planner organizations are temporarily at capacity." }, 503);
    return json({ code: "generation_failed", message: "The lesson could not be generated safely." }, 500);
  }
});
