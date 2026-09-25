import type { GenerateLessonRequest, Lesson } from "@simi/lesson-schema";
import { validateLesson } from "@simi/lesson-schema";
import fixture from "../../../../fixtures/orbits.json";
import { config } from "./config";
import { AppError } from "./errors";
import { ensureAuthenticatedUser, supabase } from "./supabase";
import { testDevicePass } from "./testDevicePass";

export async function generateLesson(request: GenerateLessonRequest): Promise<Lesson> {
  if (config.fixtureMode) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { ...(fixture as unknown as Lesson), lessonId: request.requestId, audienceLevel: request.audienceLevel, locale: request.locale, createdAt: new Date().toISOString() };
  }
  if (!supabase) throw new AppError("service", "Simi is not configured yet. Add the Supabase public values or enable fixture mode.");
  await ensureAuthenticatedUser();
  const devicePass = await testDevicePass();
  const { data, error } = await supabase.functions.invoke("generate-lesson", {
    body: request,
    ...(devicePass ? { headers: { "x-simi-test-device": devicePass } } : {}),
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 401) throw new AppError("auth", "Your secure session expired. Reopen Simi and try again.", true);
    if (status === 402 || status === 429) throw new AppError("quota", "You have used your available lessons. Upgrade or wait for your allowance to reset.");
    throw new AppError("service", "Simi could not build this lesson right now. Please try again.", true);
  }
  const validation = validateLesson(data);
  if (!validation.ok) throw new AppError("invalid_lesson", "The lesson did not meet Simi's quality checks. Please retry; no generic fallback was shown.", true);
  return validation.value;
}

export async function submitLessonFeedback(payload: Record<string, unknown>): Promise<void> {
  if (!supabase || config.fixtureMode) return;
  await ensureAuthenticatedUser();
  const { error } = await supabase.functions.invoke("lesson-feedback", { body: payload });
  if (error) console.warn("Feedback event was not recorded", error.message);
}