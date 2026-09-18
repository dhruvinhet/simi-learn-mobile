import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, json } from "../_shared/http.ts";

const allowedEvents = new Set(["lesson_started", "lesson_completed", "quiz_completed", "lesson_replayed", "lesson_rated"]);
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  try {
    const body: unknown = await request.json();
    if (!object(body) || typeof body.lessonId !== "string" || typeof body.event !== "string" || !allowedEvents.has(body.event)) {
      return json({ code: "invalid_event", message: "Unknown lesson feedback event." }, 400);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ code: "service_configuration" }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const accessToken = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const user = accessToken ? (await admin.auth.getUser(accessToken)).data.user : null;
    if (!user) return json({ code: "unauthorized" }, 401);
    const quizScore = typeof body.quizScore === "number" ? Math.max(0, Math.min(2, Math.round(body.quizScore))) : null;
    const rating = typeof body.rating === "number" ? Math.max(1, Math.min(5, Math.round(body.rating))) : null;
    const { error } = await admin.from("lesson_feedback").insert({
      lesson_id: body.lessonId.slice(0, 80),
      owner_id: user?.id ?? null,
      event_name: body.event,
      quiz_score: quizScore,
      quiz_total: quizScore === null ? null : 2,
      rating,
      generation_ms: typeof body.generationMs === "number" ? Math.max(0, Math.min(120000, Math.round(body.generationMs))) : null,
    });
    if (error) throw error;
    return json({ accepted: true }, 202);
  } catch (error) {
    console.error(error);
    return json({ code: "feedback_unavailable", message: "The lesson remains usable; this anonymous event was not stored." }, 503);
  }
});
