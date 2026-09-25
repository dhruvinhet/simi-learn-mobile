import type { Lesson } from "@simi/lesson-schema";
import { Directory, File, Paths } from "expo-file-system";
import { config } from "./config";
import { ensureAuthenticatedUser, supabase } from "./supabase";
import { AppError } from "./errors";

const folder = new Directory(Paths.document, "lesson-videos");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cachedWorkingBaseUrl: string | null = null;

async function resilientStudioFetch(
  path: string,
  init: RequestInit,
  candidates: string[] = config.videoWorkerCandidateUrls
): Promise<{ response: Response; baseUrl: string }> {
  const orderedCandidates = cachedWorkingBaseUrl
    ? [cachedWorkingBaseUrl, ...candidates.filter((u) => u !== cachedWorkingBaseUrl)]
    : candidates;

  let lastError: unknown;

  for (const base of orderedCandidates) {
    const fullUrl = base + path;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(fullUrl, init);
        cachedWorkingBaseUrl = base;
        return { response, baseUrl: base };
      } catch (err) {
        lastError = err;
        await delay(300 * (attempt + 1));
      }
    }
  }

  throw new AppError(
    "network",
    "The video studio is offline. Check that the video worker is running and retry. Your lesson is saved.",
    true
  );
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
  if (!config.videoWorkerCandidateUrls.length) {
    throw new AppError("service", "Video rendering is not configured for this build. Set EXPO_PUBLIC_VIDEO_WORKER_URL and restart Expo.");
  }
  if (!supabase) throw new AppError("service", "Simi is not configured.");
  await ensureAuthenticatedUser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError("auth", "Your secure session expired. Reopen Simi and try again.", true);
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  onStatus("Recording narration and composing your video…");

  const { response: createRes, baseUrl } = await resilientStudioFetch("/v1/videos", {
    method: "POST",
    headers,
    body: JSON.stringify(lesson),
  });

  if (!createRes.ok) throw new AppError("service", "The video studio is unavailable. Please retry.", true);
  const created = (await createRes.json()) as { jobId: string };
  if (!/^[a-f0-9-]{36}$/.test(created.jobId)) throw new AppError("service", "The video studio returned an invalid job.", true);

  let complete = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    await delay(2000);
    const { response: pollRes } = await resilientStudioFetch(`/v1/videos/${created.jobId}`, { headers });
    if (!pollRes.ok) throw new AppError("service", "Could not check video progress.", true);
    const state = (await pollRes.json()) as { status: string; message?: string };
    if (state.status === "complete") {
      complete = true;
      break;
    }
    if (state.status === "failed") throw new AppError("service", state.message || "Video rendering failed.", true);
    if (attempt === 10) onStatus("Adding the finishing touches…");
    if (attempt === 30) onStatus("Your video is still rendering. Please keep Simi open.");
  }

  if (!complete) throw new AppError("service", "Video rendering took too long. Please try again.", true);
  onStatus("Saving your MP4 for offline replay…");
  folder.create({ idempotent: true, intermediates: true });

  try {
    const downloaded = await File.downloadFileAsync(`${baseUrl}/v1/videos/${created.jobId}/file`, file, {
      headers: { Authorization: "Bearer " + token },
      idempotent: true,
    });
    if (downloaded.size <= 1024) throw new Error("Empty video");
    return downloaded.uri;
  } catch {
    if (file.exists) file.delete();
    throw new AppError("service", "The video was created but could not be saved on this phone. Please retry.", true);
  }
}

