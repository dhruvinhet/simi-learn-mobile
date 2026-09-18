export type AppErrorCode = "network" | "auth" | "quota" | "invalid_lesson" | "service" | "purchase" | "unknown";

export class AppError extends Error {
  constructor(public readonly code: AppErrorCode, message: string, public readonly retryable = false) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|offline|timed out/i.test(message)) return new AppError("network", "We couldn't reach Simi. Check your connection and try again.", true);
  if (/jwt|session|unauthorized|auth/i.test(message)) return new AppError("auth", "Your session expired. Sign in again or continue as a guest.", true);
  if (/quota|limit|429/i.test(message)) return new AppError("quota", "Your lesson limit has been reached. You can try again when it resets.");
  return new AppError("unknown", "Something interrupted this lesson. Your saved lessons are still available.", true);
}

