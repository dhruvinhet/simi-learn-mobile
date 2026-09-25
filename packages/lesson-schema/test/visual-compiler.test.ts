import { describe, expect, it } from "vitest";
import { compileVisualPlan } from "../../../supabase/functions/_shared/visual-compiler";
import { fitDirectionalGeometry } from "../../../supabase/functions/_shared/lesson";

describe("semantic visual compiler", () => {
  it("places a flow and computes arrows without model coordinates", () => {
    const compiled = compileVisualPlan({ scenes: [{ id: "scene-1", layout: "flow", nodes: [
      { id: "sunlight", label: "Sunlight", shape: "circle" },
      { id: "leaf", label: "Leaf", shape: "rect" },
      { id: "glucose", label: "Glucose", shape: "rect" },
    ] }] });
    const elements = compiled.scenes[0]!.elements as Record<string, unknown>[];
    expect(elements).toHaveLength(5);
    expect(elements[0]!.type).toBe("circle");
    expect(elements[3]!.type).toBe("arrow");
    expect((elements[3]!.width as number)).toBeGreaterThan(0);
    expect((elements[3]!.height as number)).toBe(0);
    expect(elements.every((e) => Number.isFinite(Number(e.x)) && Number.isFinite(Number(e.y)))).toBe(true);
    fitDirectionalGeometry({ scenes: [{ elements }] });
    expect((elements[3]!.width as number)).toBeGreaterThan(0);
  });

  it("prefixes date and number labels with a valid semantic id", () => {
    const plan=compileVisualPlan({ scenes: [{ id:"scene-3", layout:"timeline", nodes:[
      { id:"1955-protest", label:"1955 protest" }, { id:"1956-ruling", label:"1956 ruling" },
    ] }] });
    const elements=plan.scenes[0]!.elements as Record<string, unknown>[];
    expect(String(elements[0]!.id)).toMatch(/^[a-z]/);
    expect(String(elements[1]!.id)).toMatch(/^[a-z]/);
  });

  it("keeps upward and downward stack links in the correct direction", () => {
    const compiled = compileVisualPlan({ scenes: [{ id: "scene-1", layout: "stack", nodes: [
      { id: "top", label: "Top" }, { id: "bottom", label: "Bottom" },
    ], links: [{ from: "bottom", to: "top" }, { from: "top", to: "bottom" }] }] });
    const arrows = (compiled.scenes[0]!.elements as Record<string, unknown>[]).filter((e) => e.type === "arrow");
    expect(arrows).toHaveLength(2);
    expect(Number(arrows[0]!.height)).toBeGreaterThan(0);
    expect(Number(arrows[1]!.height)).toBeLessThan(0);
    fitDirectionalGeometry({ scenes: [{ elements: arrows }] });
    expect(Number(arrows[0]!.height)).toBeGreaterThan(0);
    expect(Number(arrows[1]!.height)).toBeLessThan(0);
  });
});

