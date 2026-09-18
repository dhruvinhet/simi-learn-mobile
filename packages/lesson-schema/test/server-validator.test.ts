import { describe, expect, it } from "vitest";
import { validateLesson as validateServerLesson } from "../../../supabase/functions/_shared/lesson";

const base = {
  schemaVersion: 1, lessonId: "lesson-test", title: "A test lesson", topic: "Test topic",
  audienceLevel: "middle-school", locale: "en-IN", estimatedSeconds: 45,
  summary: "A concrete explanation.", createdAt: "2026-09-19T00:00:00.000Z",
  scenes: Array.from({ length: 3 }, (_, index) => ({
    id: "scene-" + index, learningGoal: "Understand one relationship",
    narration: "The blue circle moves toward the labelled center.",
    caption: "Direction changes toward the center.", durationSeconds: 15,
    visualReferences: ["circle-" + index, "center-" + index],
    elements: [
      { id: "circle-" + index, type: "circle", x: 20, y: 50, radius: 5, fill: "#55DDE0" },
      { id: "center-" + index, type: "circle", x: 70, y: 50, radius: 8, fill: "#FFCA62" }
    ],
    animations: [{ targetId: "circle-" + index, kind: "move", startMs: 0, durationMs: 2000 }]
  })),
  quiz: [0, 1].map((index) => ({ id: "q-" + index, question: "What changes?", choices: ["Direction", "Mass", "Color", "Nothing"], correctIndex: 0, explanation: "Direction changes." }))
};

describe("Edge lesson quality gate", () => {
  it("accepts a valid teaching plan", () => expect(validateServerLesson(base)).toEqual([]));
  it("hard-rejects a known force misconception", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.narration = "An outward force balances gravity.";
    expect(validateServerLesson(lesson).some((value) => value.code === "conceptual_error")).toBe(true);
  });
  it("rejects narration references that are not visible", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.visualReferences = ["missing-object"];
    expect(validateServerLesson(lesson).some((value) => value.code === "alignment")).toBe(true);
  });
});