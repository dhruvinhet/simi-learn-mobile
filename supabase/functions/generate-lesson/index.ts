import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, json } from "../_shared/http.ts";
import { fitDirectionalGeometry, validateLesson, type Issue } from "../_shared/lesson.ts";
import { compileVisualPlan } from "../_shared/visual-compiler.ts";

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
  const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

type Message = { role: "system" | "user" | "assistant"; content: string };

async function callGroq(apiKey: string, messages: Message[], signal: AbortSignal, maxTokens = 6500): Promise<unknown> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b",
      temperature: 0.25,
      max_completion_tokens: maxTokens,
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
  if (typeof content !== "string") throw new Error("Groq returned no content.");
  return parseModelJson(content);
}

async function generateWithKeys(keys: string[], messages: Message[], maxTokens = 6500): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28_000);
    try {
      return await callGroq(keys[i]!, messages, controller.signal, maxTokens);
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number }).status;
      if (status === 429 && i < keys.length - 1) await wait(150 + i * 200);
      else if (status && status < 500 && status !== 429) throw error;
    } finally { clearTimeout(timeout); }
  }
  throw lastError ?? new Error("No generation provider was available.");
}

// ── Pass 1: Narration-first ───────────────────────────────────────────────────
// Ask the model ONLY for the story plan: title, summary, scene narrations,
// captions, learning goals, and duration. No visual elements yet.
// Uses few-shot examples so the model sees exactly what word-count looks like.
function buildNarrationPrompt(topic: string, audience: string, durationSeconds: number, locale: string): Message[] {
  const sceneCount = durationSeconds <= 45 ? 3 : durationSeconds <= 60 ? 4 : 5;
  const secPerScene = Math.round(durationSeconds / sceneCount);
  const minWords = secPerScene * 2;
  const maxWords = Math.ceil(secPerScene * 2.35);

  const fewShotUser1 = `Topic: How do rainbows form
Audience: middle-school | durationSeconds: 45 | locale: en-IN
Scenes: 3 | Seconds per scene: 15 | Min words per narration: 30`;

  const fewShotAssistant1 = JSON.stringify({
    title: "How Rainbows Form",
    summary: "Sunlight enters a raindrop, bends, reflects off the back, and exits at different angles for each color, spreading into a rainbow arc.",
    scenes: [
      { id: "scene-1", durationSeconds: 15, learningGoal: "Understand that white light contains all colors", narration: "Sunlight looks white but it is actually a mixture of every color in the visible spectrum. When light enters a glass prism or a raindrop, the colors separate because each one bends at a slightly different angle.", caption: "White light splits into a spectrum of colors." },
      { id: "scene-2", durationSeconds: 15, learningGoal: "Trace the path of light through a raindrop", narration: "Inside a raindrop, light slows down and bends as it enters, bounces off the curved back wall, then bends again as it exits. This double bending spreads the colors into a fan, with red on the outside and violet on the inside.", caption: "Light bends, reflects, and separates inside the droplet." },
      { id: "scene-3", durationSeconds: 15, learningGoal: "Explain why we see an arc in the sky", narration: "Millions of raindrops at different heights each send one color toward your eye at a precise angle. Red drops sit higher at 42 degrees, violet drops sit lower at 40 degrees, and together they paint a continuous arc of color across the sky.", caption: "Each color reaches your eye from a different height." },
    ],
    quiz: [
      { id: "q1", question: "Why does white sunlight split into colors inside a raindrop?", choices: ["Each color bends at a different angle", "The water absorbs some colors", "Colors travel at different speeds in air", "The raindrop acts as a mirror only"], correctIndex: 0, explanation: "Different wavelengths refract by different amounts — this is dispersion." },
      { id: "q2", question: "Which color appears on the outside edge of a rainbow?", choices: ["Violet", "Green", "Yellow", "Red"], correctIndex: 3, explanation: "Red refracts the least and exits at the shallowest angle, placing it on the outer arc." },
    ],
  });

  const systemMsg = `You are a lesson writer for Simi Learn. Your job is to write the NARRATION PLAN only — no visual elements yet.

Rules:
1. Return JSON with: title, summary, scenes (array), quiz (2 questions).
2. Each scene has: id, durationSeconds, learningGoal, narration, caption.
3. Narration length is ${minWords} to ${maxWords} words per ${secPerScene}-second scene. Count carefully. Both short and long narrations break video timing.
4. Narration must explain the concept causally. Never say "here we see" or "this diagram shows."
5. Give at least one worked, concrete example that a student can follow. For mathematics and programming, choose a specific small input, show its intermediate steps, and state the correct final numeric result; never stop at the base case or call a symbolic formula a worked example. For science, use an observable physical case. For history, use a documented event or established participant and never invent a named family or anecdote. For economics, label invented situations as hypothetical.
6. Each scene adds a new fact or action instead of repeating the previous one. Avoid vague endings and misleading shortcuts. Do not invent statistics, monetary amounts, percentages, named people, or anecdotes for historical or economic claims. Use exact figures only when well-established and necessary; mark illustrative situations as hypothetical.
7. Use exactly ${sceneCount} scenes totalling ${durationSeconds} seconds.
8. Write in ${locale} locale for ${audience} level students.`;

  const userMsg = `Topic: ${topic}
Audience: ${audience} | durationSeconds: ${durationSeconds} | locale: ${locale}
Scenes: ${sceneCount} | Seconds per scene: ~${secPerScene} | Narration words per scene: ${minWords}-${maxWords}`;

  return [
    { role: "system", content: systemMsg },
    { role: "user", content: fewShotUser1 },
    { role: "assistant", content: fewShotAssistant1 },
    { role: "user", content: userMsg },
  ];
}

// ── Pass 2: Spatial Diagramming & Geometric Visuals ──────────────────────────
// Given the approved narrations, ask the model to design the visual scene geometry
// (curves, vectors, physical contours, particles, formulas) in 0-100 coordinates.
function buildVisualPrompt(narrationPlan: unknown): Message[] {
  const systemMsg = `You are a master scientific visual illustrator and diagram designer for Simi Learn. Return JSON only.
Your goal is to design RICH, SPATIAL, PHYSICAL educational diagrams that visually explain concepts without abstract boxes or boring flowcharts.

Canvas Coordinate System:
- Normalized canvas space: x in [8, 92], y in [12, 88].
- Top-left is (0, 0); bottom-right is (100, 100).
- Center is (50, 50).

Elements you can create:
1. "path": Physical profiles, curves, contours, streamlines, trajectories, or waves.
   Provide "points": [x1, y1, x2, y2, x3, y3, ...] (at least 3 coordinate pairs).
2. "arrow": Force vectors, motion, flow directions, rays, or transitions.
   Specify tip at (x, y); tail offset (width, height); "text" for vector label (e.g. "Lift", "Gravity", "Thrust", "Velocity").
3. "circle": Bodies, centers of mass, particles, atoms, cells, droplets, or focal sources.
   Specify center (x, y), "radius" (typically 6 to 18), "text", "color".
4. "rect": Physical substrates, layers, containers, or computing blocks.
   Specify (x, y, width, height), "text", "color".
5. "text": Concise mathematical formulas, physical equations, pressure gradients, or numeric values.
   Specify (x, y), "text" (e.g. "L = ½ ρ v² S C_L", "ΔP = P_lower - P_upper", "F = m · a").

RULES:
1. Represent the PHYSICAL PHENOMENON directly:
   - For Aerodynamics: draw the curved airfoil ("path"), upper & lower streamlines ("path" or "arrow"), and 4 aerodynamic forces ("arrow": Lift ↑, Weight ↓, Thrust →, Drag ←).
   - For Astronomy / Orbits: draw central body ("circle"), orbit trajectory ("circle" or "path"), orbiting planet ("circle"), tangential velocity ("arrow"), centripetal gravity ("arrow").
   - For Biology / Photosynthesis: draw leaf or cell surface ("path" or "rect"), incoming solar energy ("arrow"), water/CO2 absorption ("arrow"), oxygen/glucose release ("arrow").
   - For Computing / Transformers: draw token embeddings ("rect"), attention matrix connections ("arrow" / "path"), feedforward layer ("rect").
   - For Mathematics / Physics: whenever numerical steps or formulas are narrated, DISPLAY the exact equation or formula card ("text" / "rect").
2. DO NOT create generic empty boxes with numbers "01, 02, 03".
3. Use 3 to 8 visual elements per scene.
4. Color palette: Mint "#B9E5CC", Gold "#E8BE79", Cyan "#A9DFEA", Lavender "#C8C1DC", Coral "#E5A69B".

Return format:
{
  "scenes": [
    {
      "id": "scene-id",
      "composition": "aerodynamics",
      "elements": [
        { "id": "airfoil-wing", "type": "path", "points": [25, 52, 45, 42, 70, 52, 45, 56, 25, 52], "color": "#A9DFEA", "text": "Cambered Wing" },
        { "id": "streamline-upper", "type": "path", "points": [15, 38, 45, 32, 78, 44], "color": "#B9E5CC", "text": "High Speed / Low Pressure" },
        { "id": "force-lift", "type": "arrow", "x": 48, "y": 24, "width": 0, "height": -20, "color": "#E8BE79", "text": "Lift (L)" },
        { "id": "equation-bernoulli", "type": "text", "x": 30, "y": 80, "color": "#F6F2E9", "text": "ΔP = P_lower - P_upper" }
      ]
    }
  ]
}`;

  const examplePlan = {
    title: "How Airfoils Create Lift",
    scenes: [
      { id: "scene-1", narration: "An airfoil is shaped with a curved upper surface and a flatter bottom. As air meets the leading edge, it divides into two flows." },
      { id: "scene-2", narration: "Air rushing over the curved top accelerates, creating lower pressure above than below. This difference generates an upward aerodynamic lift force." }
    ]
  };

  const exampleVisual = {
    scenes: [
      {
        id: "scene-1",
        composition: "spatial",
        elements: [
          { id: "leading-air", type: "arrow", "x": 24, "y": 50, "width": -14, "height": 0, "color": "#B9E5CC", "text": "Airflow Inflow" },
          { id: "airfoil-body", type: "path", "points": [26, 50, 48, 40, 74, 52, 48, 55, 26, 50], "color": "#A9DFEA", "text": "Cambered Airfoil" },
          { id: "upper-streamline", type: "path", "points": [16, 38, 46, 30, 80, 42], "color": "#B9E5CC", "text": "Upper Streamline" },
          { id: "lower-streamline", type: "path", "points": [16, 62, 48, 62, 80, 58], "color": "#A9DFEA", "text": "Lower Streamline" }
        ]
      },
      {
        id: "scene-2",
        composition: "spatial",
        elements: [
          { id: "airfoil-body", type: "path", "points": [26, 50, 48, 40, 74, 52, 48, 55, 26, 50], "color": "#A9DFEA", "text": "Airfoil" },
          { id: "lift-vector", type: "arrow", "x": 48, "y": 20, "width": 0, "height": -22, "color": "#E8BE79", "text": "Lift (Upward Force)" },
          { id: "weight-vector", type: "arrow", "x": 48, "y": 74, "width": 0, "height": 22, "color": "#E5A69B", "text": "Weight (Gravity)" },
          { id: "bernoulli-card", type: "rect", "x": 24, "y": 78, "width": 52, "height": 12, "color": "#C8C1DC", "text": "ΔP = P_bottom - P_top > 0" }
        ]
      }
    ]
  };

  return [
    { role: "system", content: systemMsg },
    { role: "user", content: `Topic and narration plan:\n${JSON.stringify(examplePlan)}` },
    { role: "assistant", content: JSON.stringify(exampleVisual) },
    { role: "user", content: `Topic and narration plan:\n${JSON.stringify(narrationPlan)}` },
  ];
}

// ── Merge narration plan + visual plan into a full lesson ────────────────────
function mergePlans(narration: Record<string, unknown>, visuals: Record<string, unknown>, requestId: string, durationSeconds: number, topic: string, audience: string, locale: string): Record<string, unknown> {
  const narrationScenes = (narration.scenes as Record<string, unknown>[]) ?? [];
  const visualScenes = ((visuals.scenes ?? []) as Record<string, unknown>[]);
  const visualMap = new Map(visualScenes.map((s, idx) => [
    String(s.id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || `scene${idx + 1}`,
    s
  ]));

  const merged = narrationScenes.map((ns, index) => {
    const key = String(ns.id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || `scene${index + 1}`;
    const vs = visualMap.get(key) ?? visualScenes[index] ?? {};
    const elements = Array.isArray(vs.elements) && vs.elements.length >= 2
      ? vs.elements
      : [
          { id: `concept-${index + 1}-subject`, type: "circle", x: 42, y: 46, radius: 14, text: String(ns.learningGoal ?? topic).slice(0, 22), color: "#B9E5CC", fill: "#B9E5CC", style: "editorial" },
          { id: `concept-${index + 1}-action`, type: "arrow", x: 68, y: 46, width: -16, height: 0, text: String(ns.caption ?? "Key idea").slice(0, 20), color: "#E8BE79", fill: "#E8BE79", style: "editorial" },
        ];
    const visualReferences = Array.isArray(vs.visualReferences) && vs.visualReferences.length > 0
      ? vs.visualReferences
      : elements.map((e: Record<string, unknown>) => String(e.id));
    return {
      id: ns.id,
      learningGoal: ns.learningGoal,
      narration: ns.narration,
      caption: ns.caption,
      durationSeconds: ns.durationSeconds,
      composition: (vs as Record<string, unknown>).composition ?? "spatial",
      elements,
      animations: Array.isArray(vs.animations) && vs.animations.length > 0
        ? vs.animations
        : elements.map((e: Record<string, unknown>, i: number) => ({ targetId: e.id, kind: "highlight", startMs: i * 2000, durationMs: 2000 })),
      visualReferences,
    };
  });

  return {
    schemaVersion: 1,
    lessonId: requestId,
    title: narration.title,
    topic,
    audienceLevel: audience,
    locale,
    estimatedSeconds: durationSeconds,
    summary: narration.summary,
    scenes: merged,
    quiz: narration.quiz,
    createdAt: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "method_not_allowed", message: "Use POST." }, 405);
  let qaAccess = false;
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
    // A private QA pass is bound to one authenticated account and one app install.
    // No pass is shipped in the bundle; all other users keep the normal quota.
    const devicePass = request.headers.get("x-simi-test-device") ?? "";
    const qaUser = Deno.env.get("SIMI_QA_USER_ID") ?? "";
    const qaPassHash = Deno.env.get("SIMI_QA_DEVICE_PASS_SHA256") ?? "";
    qaAccess = userId === qaUser && /^[a-f0-9]{64}$/.test(devicePass)
      && qaPassHash.length === 64 && await digest(devicePass) === qaPassHash;
    const limit = pro ? 30 : 3;
    if (!qaAccess && (count ?? 0) >= limit) return json({ code: "quota_exceeded", message: "Lesson allowance reached.", limit }, 429);

    await admin.from("generation_requests").upsert({
      request_id: body.requestId,
      owner_id: userId,
      client_hash: clientHash,
      topic_hash: await digest(body.topic.trim().toLowerCase()),
      status: "processing",
    }, { onConflict: "request_id" });

    const keys = (Deno.env.get("GROQ_API_KEYS") ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    if (!keys.length) return json({ code: "service_configuration", message: "The lesson planner is not configured." }, 503);
    const seed = parseInt((await digest(body.requestId)).slice(0, 8), 16);
    const orderedKeys = keys.map((_, i) => keys[(seed + i) % keys.length]!);

    // ── Pass 1: Narration plan ───────────────────────────────────────────────
    const narrationMessages = buildNarrationPrompt(body.topic, body.audienceLevel, body.durationSeconds, body.locale);
    const narrationPlan = await generateWithKeys(orderedKeys, narrationMessages, 3000) as Record<string, unknown>;

    // Validate narration word counts before proceeding to visuals
    const sceneCount = body.durationSeconds <= 45 ? 3 : body.durationSeconds <= 60 ? 4 : 5;
    const secPerScene = Math.round(body.durationSeconds / sceneCount);
    const minWords = secPerScene * 2;
    const maxWords = Math.ceil(secPerScene * 2.35);
    const narrationScenes = (narrationPlan.scenes as Record<string, unknown>[]) ?? [];
    const outOfRangeScenes = narrationScenes.filter((s) => {
      const words = String(s.narration ?? "").trim().split(/\s+/).filter(Boolean).length;
      return words < minWords || words > maxWords;
    });

    // Repair only narrations outside the spoken-time budget.
    if (outOfRangeScenes.length > 0) {
      const repairs = outOfRangeScenes.map((s) => {
        const words = String(s.narration ?? "").trim().split(/\s+/).filter(Boolean).length;
        return `Scene ${s.id}: has ${words} words, needs ${minWords}-${maxWords}. Current: "${s.narration}"`;
      }).join("\n");

      const repairMessages: Message[] = [
        ...narrationMessages,
        { role: "assistant", content: JSON.stringify(narrationPlan) },
        { role: "user", content: `The following narrations do not fit the scene time. Rewrite ONLY those narrations to ${minWords}-${maxWords} words each. Preserve the concrete example and its correct result, compressing redundant phrases. Keep all other scenes unchanged. Return the complete JSON.\n\n${repairs}` },
      ];
      const repaired = await generateWithKeys(orderedKeys, repairMessages, 3000) as Record<string, unknown>;
      // Merge repaired narrations in
      if (Array.isArray(repaired.scenes)) {
        const repairedMap = new Map((repaired.scenes as Record<string, unknown>[]).map((s) => [s.id, s]));
        narrationPlan.scenes = narrationScenes.map((s) => repairedMap.get(s.id as string) ?? s);
      }
      if (repaired.title) narrationPlan.title = repaired.title;
      if (repaired.summary) narrationPlan.summary = repaired.summary;
      if (repaired.quiz) narrationPlan.quiz = repaired.quiz;
    }

    // Unrequested percentages and monetary figures often sound authoritative
    // but are hard to verify. Rewrite them qualitatively before visuals exist.
    const requestedStatistic = /%|percent|percentage|dollar|\$|how many|how much/i.test(body.topic);
    const unsupportedStatistics = !requestedStatistic && Array.isArray(narrationPlan.scenes)
      ? (narrationPlan.scenes as Record<string, unknown>[]).filter((scene) =>
          /\b\d+(?:\.\d+)?\s*(?:%|percent)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|ninety|seventy|eighty)\s+percent\b|\$\s*\d+/i.test(String(scene.narration ?? "")))
      : [];
    if (unsupportedStatistics.length) {
      const corrected = await generateWithKeys(orderedKeys, [
        { role: "system", content: `Return JSON only: {"scenes":[{"id":"scene-id","narration":"rewritten text"}]}. Rewrite each supplied narration to ${minWords}-${maxWords} words. Remove exact percentages and monetary figures that were not asked for. Keep established dates, durations, people, and causal meaning. Do not invent new numbers, names, or anecdotes.` },
        { role: "user", content: JSON.stringify({ scenes: unsupportedStatistics.map((scene) => ({ id: scene.id, narration: scene.narration })) }) },
      ], 1200) as Record<string, unknown>;
      if (Array.isArray(corrected.scenes)) {
        const byId = new Map((corrected.scenes as Record<string, unknown>[]).map((scene) => [scene.id, scene.narration]));
        narrationPlan.scenes = (narrationPlan.scenes as Record<string, unknown>[]).map((scene) => ({
          ...scene,
          narration: typeof byId.get(scene.id) === "string" ? byId.get(scene.id) : scene.narration,
        }));
      }
    }

    // ── Pass 2: Visual layout ────────────────────────────────────────────────
    const visualMessages = buildVisualPrompt(narrationPlan);
    let semanticPlan = await generateWithKeys(orderedKeys, visualMessages, 2000);
    let visualPlan = compileVisualPlan(semanticPlan, narrationPlan as any);

    // ── Merge into full lesson ───────────────────────────────────────────────
    let lesson: unknown = mergePlans(narrationPlan, visualPlan, body.requestId, body.durationSeconds, body.topic, body.audienceLevel, body.locale);
    lesson = fitDirectionalGeometry(lesson);

    // ── Validate + one repair if needed ────────────────────────────────────
    let issues: Issue[] = validateLesson(lesson);
    if (issues.length) {
      // Targeted repair: re-run only the visual pass with the issues listed
      const repairVisualMessages: Message[] = [
        ...visualMessages,
        { role: "assistant", content: JSON.stringify(semanticPlan) },
        { role: "user", content: `Fix the visual diagram elements for these validation errors. Return only the complete corrected { scenes: [...] } with valid elements and bounded coordinates (0 to 100).\n\nErrors:\n${issues.map((i) => `${i.path}: ${i.message}`).join("\n")}` },
      ];
      semanticPlan = await generateWithKeys(orderedKeys, repairVisualMessages, 2000);
      visualPlan = compileVisualPlan(semanticPlan, narrationPlan as any);
      lesson = mergePlans(narrationPlan, visualPlan, body.requestId, body.durationSeconds, body.topic, body.audienceLevel, body.locale);
      lesson = fitDirectionalGeometry(lesson);
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
    if (status === 400 || status === 401 || status === 403) return json({ code: "provider_rejected", message: "The lesson provider rejected the request.", providerStatus: status, diagnostic: String(error).slice(0, 400) }, 503);
    if (error instanceof SyntaxError) return json({ code: "provider_invalid_json", message: "The lesson provider returned invalid JSON." }, 502);
    if (error instanceof TypeError) return json({ code: "internal_type_error", message: "The lesson service could not process the provider response." }, 500);
    if (error instanceof ReferenceError) return json({ code: "internal_reference_error", message: "The lesson service needs a configuration fix." }, 500);
    return json({ code: "generation_failed", message: "The lesson could not be generated safely." }, 500);
  }
});