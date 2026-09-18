import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "./errors";

describe("toAppError", () => {
  it("preserves a typed product error", () => {
    const error = new AppError("quota", "Limit reached");
    expect(toAppError(error)).toBe(error);
  });
  it("maps network failures to a useful retry", () => {
    const error = toAppError(new Error("fetch timed out"));
    expect(error.code).toBe("network");
    expect(error.retryable).toBe(true);
  });
  it("does not expose unknown internal messages", () => {
    expect(toAppError(new Error("database password leaked")).message).not.toContain("password");
  });
});