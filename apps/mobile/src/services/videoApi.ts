import type { Lesson } from "@simi/lesson-schema";
import { Directory, File, Paths } from "expo-file-system";
import { config } from "./config";
import { ensureAuthenticatedUser, supabase } from "./supabase";
import { AppError } from "./errors";

const folder = new Directory(Paths.document, "lesson-videos");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function studioFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new AppError("network", "The video studio is offline. Check your connection and retry. Your lesson is saved.", true);
  }
}

function localFile(lessonId: string): File {
  if (!/^[a-z0-9-]{8,90}$/i.test(lessonId)) throw new AppError("service", "Invalid lesson ID.");
  return new File(folder, lessonId + ".mp4");
}

export function savedVideoUri(lessonId: string): string | null {
  const file = localFile(lessonId);
  return file.exists && file.size > 1024 ? file.uri : null;
}

export async function ensureVideo(lesson: Lesson, onStatus: (message: string) => void): Promise<string> {
  const file = localFile(lesson.lessonId);
  if (file.exists && file.size > 1024) return file.uri;
  const base = config.videoWorkerUrl.replace(/\/$/, "");
  if (!base) throw new AppError("service", "Video rendering is not configured for this build. Set EXPO_PUBLIC_VIDEO_WORKER_URL and restart Expo.");
  if (!supabase) throw new AppError("service", "Simi is not configured.");
  await ensureAuthenticatedUser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError("auth", "Your secure session expired. Reopen Simi and try again.", true);
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  onStatus("Recording narration and composing your video…");
  const create = await studioFetch(base + "/v1/videos", { method: "POST", headers, body: JSON.stringify(lesson) });
  if (!create.ok) throw new AppError("service", "The video studio is unavailable. Please retry.", true);
  const created = await create.json() as { jobId: string };
  if (!/^[a-f0-9-]{36}$/.test(created.jobId)) throw new AppError("service", "The video studio returned an invalid job.", true);
  let complete = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    await delay(2000);
    const poll = await studioFetch(base + "/v1/videos/" + created.jobId, { headers });
    if (!poll.ok) throw new AppError("service", "Could not check video progress.", true);
    const state = await poll.json() as { status: string; message?: string };
    if (state.status === "complete") { complete = true; break; }
    if (state.status === "failed") throw new AppError("service", state.message || "Video rendering failed.", true);
    if (attempt === 10) onStatus("Adding the finishing touches…");
    if (attempt === 30) onStatus("Your video is still rendering. Please keep Simi open.");
  }
  if (!complete) throw new AppError("service", "Video rendering took too long. Please try again.", true);
  onStatus("Saving your MP4 for offline replay…");
  folder.create({ idempotent: true, intermediates: true });
  try {
    const downloaded = await File.downloadFileAsync(base + "/v1/videos/" + created.jobId + "/file", file, {
      headers: { Authorization: "Bearer " + token }, idempotent: true,
    });
    if (downloaded.size <= 1024) throw new Error("Empty video");
    return downloaded.uri;
  } catch {
    if (file.exists) file.delete();
    throw new AppError("service", "The video was created but could not be saved on this phone. Please retry.", true);
  }
}

