import { describe, expect, it } from "vitest";
import { fitDirectionalGeometry, validateLesson as validateServerLesson } from "../../../supabase/functions/_shared/lesson";

const base = {
  schemaVersion: 1, lessonId: "lesson-test", title: "A test lesson", topic: "Test topic",
  audienceLevel: "middle-school", locale: "en-IN", estimatedSeconds: 45,
  summary: "A concrete explanation.", createdAt: "2026-09-19T00:00:00.000Z",
  scenes: Array.from({ length: 3 }, (_, index) => ({
    id: "scene-" + index, learningGoal: "Understand one relationship",
    narration: "The blue circle moves steadily toward the labelled center point. As it gets closer, the distance between them shrinks until the circle reaches the center and comes to a complete stop.",
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
  it("rejects overlapping labeled concept boxes for targeted repair", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.elements.push(
      { id: "step-one", type: "rect", x: 20, y: 20, width: 40, height: 30, text: "Step one" } as never,
      { id: "step-two", type: "rect", x: 30, y: 30, width: 40, height: 30, text: "Step two" } as never,
    );
    expect(validateServerLesson(lesson).some((value) => value.code === "overlapping_concepts")).toBe(true);
  });
  it("rejects narration too long for its scene", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.narration = "The center changes the direction of the moving object. ".repeat(20);
    expect(validateServerLesson(lesson).some((value) => value.code === "narration_too_long")).toBe(true);
  });
  it("hard-rejects a known force misconception", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.narration = "An outward force balances gravity and keeps the satellite in orbit. This centrifugal push exactly cancels the inward pull so the object floats at a fixed distance from the planet.";
    expect(validateServerLesson(lesson).some((value) => value.code === "conceptual_error")).toBe(true);
  });
  it("normalizes paired path coordinates before checking geometry", () => {
    const lesson = structuredClone(base);
    lesson.scenes[0]!.elements.push({ id: "curve", type: "path", x: 50, y: 50, points: [[0, 20], [50, 120], [100, 40]] } as never);
    fitDirectionalGeometry(lesson);
    expect((lesson.scenes[0]!.elements[2]! as unknown as { points: number[] }).points).toEqual([0, 20, 50, 100, 100, 40]);
    expect(validateServerLesson(lesson)).toEqual([]);
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