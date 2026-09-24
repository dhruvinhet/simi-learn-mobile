import { describe, expect, it } from "vitest";
import { validateLesson } from "../src";

const lesson = {
  schemaVersion: 1,
  lessonId: "lesson-1",
  title: "Orbits",
  topic: "Why planets orbit",
  audienceLevel: "middle-school",
  locale: "en-IN",
  estimatedSeconds: 45,
  summary: "Gravity continually bends a planet's forward motion.",
  createdAt: "2026-09-19T00:00:00.000Z",
  scenes: Array.from({ length: 3 }, (_, index) => ({
    id: `scene-${index + 1}`,
    learningGoal: "Connect forward motion and gravity",
    narration: "The planet moves forward while gravity changes its direction.",
    caption: "Forward motion + inward acceleration",
    durationSeconds: 15,
    elements: [
      { id: `sun-${index}`, type: "circle", x: 50, y: 50, radius: 10 },
      { id: `planet-${index}`, type: "circle", x: 78, y: 50, radius: 3 },
    ],
    animations: [{ targetId: `planet-${index}`, kind: "move", startMs: 0, durationMs: 3000 }],
    visualReferences: [`sun-${index}`, `planet-${index}`],
  })),
  quiz: [0, 1].map((index) => ({ id: `q-${index}`, question: "What changes direction?", choices: ["Planet", "Sun", "Nothing", "Space"], correctIndex: 0, explanation: "Gravity changes the planet's velocity." })),
};

describe("validateLesson", () => {
  it("accepts a bounded semantic lesson", () => expect(validateLesson(lesson).ok).toBe(true));
  it("rejects an animation that points to a missing visual", () => {
    const invalid = structuredClone(lesson);
    invalid.scenes[0]!.animations[0]!.targetId = "missing";
    const result = validateLesson(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((value) => value.code === "missing_target")).toBe(true);
  });
  it("rejects out-of-bounds visuals", () => {
    const invalid = structuredClone(lesson);
    invalid.scenes[0]!.elements[0]!.x = 120;
    expect(validateLesson(invalid).ok).toBe(false);
  });
  it("rejects visuals that cannot render a teaching shape", () => {
    const invalid = structuredClone(lesson);
    (invalid.scenes[0]!.elements[0]! as { type: string }).type = "chart";
    expect(validateLesson(invalid).ok).toBe(false);
    (invalid.scenes[0]!.elements[0]! as { type: string; radius?: number }).type = "circle";
    Reflect.deleteProperty(invalid.scenes[0]!.elements[0]!, "radius");
    expect(validateLesson(invalid).ok).toBe(false);
  });
});
