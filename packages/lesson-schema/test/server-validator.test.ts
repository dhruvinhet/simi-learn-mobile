import { describe, expect, it } from "vitest";
import { fitDirectionalGeometry, validateLesson as validateServerLesson } from "../../../supabase/functions/_shared/lesson";

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
  it("normalizes common color syntax before native rendering", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.elements[0]!.fill = "#abc";
    lesson.scenes[0]!.elements[1]!.fill = "orange";
    fitDirectionalGeometry(lesson);
    expect(lesson.scenes[0]!.elements[0]!.fill).toBe("#aabbcc");
    expect(lesson.scenes[0]!.elements[1]!.fill).toBe("#ffa500");
    expect(validateServerLesson(lesson)).toEqual([]);
  });  it("fits an arrow endpoint inside the canvas without a fallback card", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.elements.push({ id: "direction-arrow", type: "arrow", x: 8, y: 50, width: 50, height: 0, fill: "#55DDE0" } as never);
    const fitted = fitDirectionalGeometry(lesson) as typeof lesson;
    expect((fitted.scenes[0]!.elements[2]! as unknown as { width: number }).width).toBe(8);
    expect(validateServerLesson(fitted)).toEqual([]);
  });  it("rejects narration references that are not visible", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.visualReferences = ["missing-object"];
    expect(validateServerLesson(lesson).some((value) => value.code === "alignment")).toBe(true);
  });
  it("rejects blank composite cards and missing primitive geometry", () => {
    const lesson = structuredClone(base);
    (lesson.scenes[0]!.elements[0]! as { type: string }).type = "chart";
    expect(validateServerLesson(lesson).some((value) => value.code === "element_type")).toBe(true);
    (lesson.scenes[0]!.elements[0]! as { type: string; radius?: number }).type = "circle";
    Reflect.deleteProperty(lesson.scenes[0]!.elements[0]!, "radius");
    expect(validateServerLesson(lesson).some((value) => value.code === "geometry")).toBe(true);
  });
});