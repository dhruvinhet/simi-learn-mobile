export type Issue = { path: string; code: string; message: string };
const TYPES = new Set(["text", "line", "arrow", "circle", "rect", "path"]);
const ID = /^[a-z][a-z0-9-]{1,47}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const NAMED_COLORS: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", blue: "#0000ff",
  green: "#008000", yellow: "#ffff00", orange: "#ffa500", purple: "#800080",
  cyan: "#00ffff", magenta: "#ff00ff", pink: "#ffc0cb", gray: "#808080",
  grey: "#808080", navy: "#000080", teal: "#008080", gold: "#ffd700",
  brown: "#a52a2a", lime: "#00ff00",
};
function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim().toLowerCase();
  if (HEX.test(color)) return color;
  if (color === "transparent" || color === "none") return undefined;
  if (/^#[0-9a-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map((part) => part + part).join("");
  if (/^#[0-9a-f]{8}$/.test(color)) return color.slice(0, 7);
  const rgb = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (rgb) {
    const channels = rgb.slice(1).map(Number);
    if (channels.every((channel) => channel <= 255)) return "#" + channels.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  }
  return NAMED_COLORS[color] ?? value as string;
}

// Clip only directional endpoints; this preserves the teaching element while
// preventing an otherwise valid scene from being rejected for overshoot.
export function fitDirectionalGeometry(input: unknown): unknown {
  if (!object(input) || !Array.isArray(input.scenes)) return input;
  for (const scene of input.scenes) {
    if (!object(scene) || !Array.isArray(scene.elements)) continue;
    for (const element of scene.elements) {
      if (!object(element)) continue;
      for (const key of ["color", "fill"]) {
        if (element[key] === undefined) continue;
        const normalized = normalizeColor(element[key]);
        if (normalized === undefined) delete element[key];
        else element[key] = normalized;
      }
      if (element.type === "path" && Array.isArray(element.points)) {
        const coordinates = element.points.flatMap((point: unknown) => {
          if (Array.isArray(point) && point.length >= 2) return [point[0], point[1]];
          if (object(point) && typeof point.x === "number" && typeof point.y === "number") return [point.x, point.y];
          return [point];
        });
        if (coordinates.length >= 4 && coordinates.length % 2 === 0 && coordinates.every((value: unknown) => typeof value === "number" && Number.isFinite(value)))
          element.points = coordinates.map((value: number) => Math.max(0, Math.min(100, value)));
      }
      if (element.type !== "line" && element.type !== "arrow") continue;
      if (typeof element.x !== "number" || typeof element.y !== "number" || typeof element.width !== "number") continue;
      const tipX = element.x;
      const endX = element.type === "line" ? tipX + element.width : tipX - element.width;
      const boundedX = Math.max(0, Math.min(100, endX));
      element.width = element.type === "line" ? boundedX - tipX : tipX - boundedX;
      const endY = element.y + (typeof element.height === "number" ? element.height : 0);
      element.height = Math.max(0, Math.min(100, endY)) - element.y;
    }
  }
  return input;
}

export function validateLesson(input: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!object(input)) return [{ path: "$", code: "lesson_type", message: "Lesson must be an object." }];
  if (input.schemaVersion !== 1) issues.push({ path: "schemaVersion", code: "schema_version", message: "schemaVersion must equal 1." });
  for (const field of ["lessonId", "title", "topic", "audienceLevel", "locale", "summary", "createdAt"]) {
    if (typeof input[field] !== "string" || !(input[field] as string).trim()) issues.push({ path: field, code: "required", message: field + " is required." });
  }
  if (!Array.isArray(input.scenes) || input.scenes.length < 3 || input.scenes.length > 5) {
    issues.push({ path: "scenes", code: "scene_count", message: "Use 3 to 5 scenes." });
  } else {
    input.scenes.forEach((scene, sceneIndex) => {
      const path = `scenes[${sceneIndex}]`;
      if (!object(scene)) { issues.push({ path, code: "scene_type", message: "Scene must be an object." }); return; }
      for (const field of ["id", "learningGoal", "narration", "caption"]) {
        if (typeof scene[field] !== "string" || !(scene[field] as string).trim()) issues.push({ path: path + "." + field, code: "required", message: field + " is required." });
      }
      if (typeof scene.narration === "string" && scene.narration.length > 900) issues.push({ path: path + ".narration", code: "length", message: "Narration is too long." });
      if (typeof scene.narration === "string" && typeof scene.durationSeconds === "number") {
        const wordCount = scene.narration.trim().split(/\s+/).filter(Boolean).length;
        const minWords = Math.floor(scene.durationSeconds * 1.5);
        if (wordCount < minWords) issues.push({ path: path + ".narration", code: "narration_too_short", message: `Narration has ${wordCount} words but needs at least ${minWords} for a ${scene.durationSeconds}s scene (1.5 words/sec minimum).` });
        const maxWords = Math.ceil(scene.durationSeconds * 2.7);
        if (wordCount > maxWords) issues.push({ path: path + ".narration", code: "narration_too_long", message: `Narration has ${wordCount} words but needs at most ${maxWords} for a ${scene.durationSeconds}s scene.` });
      }
      if (typeof scene.caption === "string" && scene.caption.length > 160) issues.push({ path: path + ".caption", code: "length", message: "Caption is too long." });
      if (typeof scene.durationSeconds !== "number" || scene.durationSeconds < 7 || scene.durationSeconds > 30) issues.push({ path: path + ".durationSeconds", code: "duration", message: "Duration must be 7 to 30 seconds." });
      const ids = new Set<string>();
      if (!Array.isArray(scene.elements) || scene.elements.length < 2 || scene.elements.length > 12) {
        issues.push({ path: path + ".elements", code: "complexity", message: "Use 2 to 12 elements." });
      } else scene.elements.forEach((element, elementIndex) => {
        const ep = `${path}.elements[${elementIndex}]`;
        if (!object(element)) { issues.push({ path: ep, code: "element_type", message: "Element must be an object." }); return; }
        if (typeof element.id !== "string" || !ID.test(element.id)) issues.push({ path: ep + ".id", code: "invalid_id", message: "Use a semantic kebab-case id." });
        else if (ids.has(element.id)) issues.push({ path: ep + ".id", code: "duplicate_id", message: "Element ids must be unique within a scene." });
        else ids.add(element.id);
        if (!TYPES.has(String(element.type))) issues.push({ path: ep + ".type", code: "element_type", message: "Unsupported element type." });
        for (const key of ["x", "y"]) if (typeof element[key] !== "number" || (element[key] as number) < 0 || (element[key] as number) > 100) issues.push({ path: ep + "." + key, code: "bounds", message: key + " must be 0 to 100." });
        for (const key of ["width", "height", "radius"]) { const value = element[key]; const directional = (element.type === "line" || element.type === "arrow") && key !== "radius"; if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || (value as number) < (directional ? -100 : 0) || (value as number) > 100)) issues.push({ path: ep + "." + key, code: "size", message: "Element size is invalid." }); }
        for (const key of ["color", "fill"]) if (element[key] !== undefined && (typeof element[key] !== "string" || !HEX.test(element[key] as string))) issues.push({ path: ep + "." + key, code: "color", message: "Use six-digit hex colors." });
        if (typeof element.text === "string" && element.text.length > 80) issues.push({ path: ep + ".text", code: "length", message: "Visual text is too long." });
        if (element.type === "text" && (typeof element.text !== "string" || !element.text.trim())) issues.push({ path: ep + ".text", code: "missing_text", message: "Text elements need visible text." });
        if (element.type === "circle" && (typeof element.radius !== "number" || element.radius <= 0 || (element.x as number) - element.radius < 0 || (element.x as number) + element.radius > 100 || (element.y as number) - element.radius < 0 || (element.y as number) + element.radius > 100)) issues.push({ path: ep + ".radius", code: "geometry", message: "Circle must fit in the canvas." });
        if (element.type === "rect" && (typeof element.width !== "number" || element.width <= 0 || typeof element.height !== "number" || element.height <= 0 || (element.x as number) + element.width > 100 || (element.y as number) + (element.height ?? 0) > 100 || (element.y as number) + (element.height ?? 0) < 0)) issues.push({ path: ep, code: "geometry", message: "Rectangle must fit in the canvas." });
        if ((element.type === "line" || element.type === "arrow") && (typeof element.width !== "number" || (element.height !== undefined && typeof element.height !== "number") || (element.x as number) + (element.type === "line" ? element.width : -element.width) < 0 || (element.x as number) + (element.type === "line" ? element.width : -element.width) > 100 || (element.y as number) + (element.height ?? 0) > 100 || (element.y as number) + (element.height ?? 0) < 0)) issues.push({ path: ep, code: "geometry", message: "Line or arrow must fit in the canvas." });
        if (element.type === "path" && (!Array.isArray(element.points) || element.points.length < 4 || element.points.length % 2 !== 0 || element.points.some((point: unknown) => typeof point !== "number" || point < 0 || point > 100))) issues.push({ path: ep + ".points", code: "geometry", message: "Path needs visible, bounded point pairs." });
      });
      const boxes = Array.isArray(scene.elements) ? (scene.elements as unknown[]).filter((element): element is Record<string, unknown> => object(element) && element.type === "rect" && typeof element.text === "string" && Boolean(element.text.trim())) : [];
      for (let first = 0; first < boxes.length; first++) for (let second = first + 1; second < boxes.length; second++) {
        const a = boxes[first]!, b = boxes[second]!;
        if (![a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height].every((value) => typeof value === "number" && Number.isFinite(value))) continue;
        const overlapWidth = Math.max(0, Math.min((a.x as number) + (a.width as number), (b.x as number) + (b.width as number)) - Math.max(a.x as number, b.x as number));
        const overlapHeight = Math.max(0, Math.min((a.y as number) + (a.height as number), (b.y as number) + (b.height as number)) - Math.max(a.y as number, b.y as number));
        const smallerArea = Math.min((a.width as number) * (a.height as number), (b.width as number) * (b.height as number));
        if (smallerArea > 0 && overlapWidth * overlapHeight / smallerArea > 0.12)
          issues.push({ path: path + ".elements", code: "overlapping_concepts", message: "Labeled concept boxes overlap. Separate them into a readable flow." });
      }
      if (!Array.isArray(scene.visualReferences) || scene.visualReferences.length < 1) issues.push({ path: path + ".visualReferences", code: "alignment", message: "List the visible ids explained by the narration." });
      else scene.visualReferences.forEach((reference, index) => {
        if (typeof reference !== "string" || !ids.has(reference)) issues.push({ path: `${path}.visualReferences[${index}]`, code: "alignment", message: "Narration references must resolve to visible ids." });
      });
      if (!Array.isArray(scene.animations) || scene.animations.length > 16) issues.push({ path: path + ".animations", code: "animations", message: "Use no more than 16 animations." });
      else scene.animations.forEach((animation, animationIndex) => {
        if (!object(animation) || typeof animation.targetId !== "string" || !ids.has(animation.targetId)) issues.push({ path: `${path}.animations[${animationIndex}].targetId`, code: "animation_target", message: "Animation target must be visible." });
      });
    });
  }
  if (!Array.isArray(input.quiz) || input.quiz.length !== 2) issues.push({ path: "quiz", code: "quiz_count", message: "Provide exactly two questions." });
  else input.quiz.forEach((question, index) => {
    if (!object(question) || !Array.isArray(question.choices) || question.choices.length !== 4) issues.push({ path: `quiz[${index}].choices`, code: "choices", message: "Provide four choices." });
    if (!object(question) || !Number.isInteger(question.correctIndex) || (question.correctIndex as number) < 0 || (question.correctIndex as number) > 3) issues.push({ path: `quiz[${index}].correctIndex`, code: "correct_index", message: "correctIndex must be 0 to 3." });
  });
  if (Array.isArray(input.scenes)) {
    const total = input.scenes.reduce((sum, scene) => sum + (object(scene) && typeof scene.durationSeconds === "number" ? scene.durationSeconds : 0), 0);
    if (typeof input.estimatedSeconds !== "number" || Math.abs(total - input.estimatedSeconds) > 3) issues.push({ path: "estimatedSeconds", code: "duration_total", message: "Match total scene duration." });
  }
  const raw = JSON.stringify(input).toLowerCase();
  const misconceptions = [
    /inertia (pulls|pushes|acts) outward/,
    /outward force (balances|equals|cancels) gravity/,
    /gravity is (used up|absent) in orbit/,
    /heavier objects fall faster(?! in air)/,
  ];
  if (misconceptions.some((pattern) => pattern.test(raw))) issues.push({ path: "$", code: "conceptual_error", message: "The explanation contains a known conceptual misconception." });
  return issues;
}
