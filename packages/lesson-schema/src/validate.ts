import {
  ELEMENT_TYPES,
  type Lesson,
  type LessonScene,
  type ValidationIssue,
  type ValidationResult,
  type VisualElement,
} from "./types";

const ID = /^[a-z][a-z0-9-]{1,47}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const issue = (path: string, code: string, message: string): ValidationIssue => ({ path, code, message });
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validateElement(element: unknown, path: string, ids: Set<string>, issues: ValidationIssue[]): void {
  if (!isObject(element)) {
    issues.push(issue(path, "element_type", "Visual element must be an object."));
    return;
  }
  const id = element.id;
  if (typeof id !== "string" || !ID.test(id)) issues.push(issue(`${path}.id`, "invalid_id", "Use a short semantic kebab-case ID."));
  else if (ids.has(id)) issues.push(issue(`${path}.id`, "duplicate_id", `Duplicate visual ID: ${id}.`));
  else ids.add(id);
  if (!ELEMENT_TYPES.includes(element.type as never)) issues.push(issue(`${path}.type`, "unsupported_element", "Unsupported visual element type."));

  for (const key of ["x", "y"] as const) {
    const value = element[key];
    if (typeof value !== "number" || value < 0 || value > 100) issues.push(issue(`${path}.${key}`, "bounds", `${key} must be between 0 and 100.`));
  }
  for (const key of ["width", "height", "radius"] as const) {
    const value = element[key];
    if (value !== undefined && (typeof value !== "number" || value < 0 || value > 100)) issues.push(issue(`${path}.${key}`, "size", `${key} must be between 0 and 100.`));
  }
  for (const key of ["color", "fill"] as const) {
    const value = element[key];
    if (value !== undefined && (typeof value !== "string" || !HEX.test(value))) issues.push(issue(`${path}.${key}`, "color", "Colors must use six-digit hex values."));
  }
  if (typeof element.text === "string" && element.text.length > 80) issues.push(issue(`${path}.text`, "text_length", "Visual text must be 80 characters or fewer."));
  if (Array.isArray(element.children)) {
    if (element.children.length > 6) issues.push(issue(`${path}.children`, "complexity", "Groups support at most six children."));
    element.children.forEach((child, index) => validateElement(child, `${path}.children[${index}]`, ids, issues));
  }
}

function validateScene(scene: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `scenes[${index}]`;
  if (!isObject(scene)) {
    issues.push(issue(path, "scene_type", "Scene must be an object."));
    return;
  }
  for (const field of ["id", "learningGoal", "narration", "caption"] as const) {
    if (typeof scene[field] !== "string" || !(scene[field] as string).trim()) issues.push(issue(`${path}.${field}`, "required", `${field} is required.`));
  }
  if (typeof scene.narration === "string" && scene.narration.length > 900) issues.push(issue(`${path}.narration`, "narration_length", "Narration is too long."));
  if (typeof scene.caption === "string" && scene.caption.length > 160) issues.push(issue(`${path}.caption`, "caption_length", "Caption is too long."));
  if (typeof scene.durationSeconds !== "number" || scene.durationSeconds < 7 || scene.durationSeconds > 30) issues.push(issue(`${path}.durationSeconds`, "duration", "Scene duration must be 7–30 seconds."));

  const ids = new Set<string>();
  if (!Array.isArray(scene.elements) || scene.elements.length < 2 || scene.elements.length > 12) issues.push(issue(`${path}.elements`, "complexity", "Each scene needs 2–12 visual elements."));
  else scene.elements.forEach((element, elementIndex) => validateElement(element, `${path}.elements[${elementIndex}]`, ids, issues));

  if (!Array.isArray(scene.animations) || scene.animations.length > 16) issues.push(issue(`${path}.animations`, "animation_count", "A scene supports at most 16 animations."));
  else scene.animations.forEach((animation, animationIndex) => {
    const animationPath = `${path}.animations[${animationIndex}]`;
    if (!isObject(animation) || typeof animation.targetId !== "string" || !ids.has(animation.targetId)) issues.push(issue(`${animationPath}.targetId`, "missing_target", "Animation target must reference an element in the same scene."));
    if (!isObject(animation) || typeof animation.startMs !== "number" || animation.startMs < 0) issues.push(issue(`${animationPath}.startMs`, "animation_time", "Animation start must be non-negative."));
    if (!isObject(animation) || typeof animation.durationMs !== "number" || animation.durationMs < 100 || animation.durationMs > 10_000) issues.push(issue(`${animationPath}.durationMs`, "animation_duration", "Animation duration must be 100–10000 ms."));
  });
  if (!Array.isArray(scene.visualReferences) || scene.visualReferences.length < 1) issues.push(issue(`${path}.visualReferences`, "visual_references", "Narration must reference at least one visible semantic ID."));
  else scene.visualReferences.forEach((reference, referenceIndex) => {
    if (typeof reference !== "string" || !ids.has(reference)) issues.push(issue(`${path}.visualReferences[${referenceIndex}]`, "missing_visual_reference", "Every narration reference must point to a visible element."));
  });
}

export function validateLesson(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(input)) return { ok: false, issues: [issue("$", "lesson_type", "Lesson must be an object.")] };
  if (input.schemaVersion !== 1) issues.push(issue("schemaVersion", "schema_version", "Only schema version 1 is supported."));
  for (const field of ["lessonId", "title", "topic", "locale", "summary", "createdAt"] as const) {
    if (typeof input[field] !== "string" || !(input[field] as string).trim()) issues.push(issue(field, "required", `${field} is required.`));
  }
  if (!Array.isArray(input.scenes) || input.scenes.length < 3 || input.scenes.length > 5) issues.push(issue("scenes", "scene_count", "A lesson must contain 3–5 scenes."));
  else input.scenes.forEach((scene, index) => validateScene(scene, index, issues));

  if (!Array.isArray(input.quiz) || input.quiz.length !== 2) issues.push(issue("quiz", "quiz_count", "A lesson needs exactly two quiz questions."));
  else input.quiz.forEach((question, index) => {
    const path = `quiz[${index}]`;
    if (!isObject(question) || !Array.isArray(question.choices) || question.choices.length !== 4) issues.push(issue(`${path}.choices`, "choices", "Quiz questions need four choices."));
    if (!isObject(question) || !Number.isInteger(question.correctIndex) || (question.correctIndex as number) < 0 || (question.correctIndex as number) > 3) issues.push(issue(`${path}.correctIndex`, "correct_index", "correctIndex must be 0–3."));
  });

  if (Array.isArray(input.scenes)) {
    const total = input.scenes.reduce((sum: number, scene: unknown) => sum + (isObject(scene) && typeof scene.durationSeconds === "number" ? scene.durationSeconds : 0), 0);
    if (typeof input.estimatedSeconds !== "number" || Math.abs(total - input.estimatedSeconds) > 3) issues.push(issue("estimatedSeconds", "duration_total", "Estimated duration must match scene durations."));
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: input as unknown as Lesson };
}

export function visualElementIds(scene: LessonScene): Set<string> {
  const result = new Set<string>();
  const walk = (items: VisualElement[]) => items.forEach((item) => {
    result.add(item.id);
    if (item.children) walk(item.children);
  });
  walk(scene.elements);
  return result;
}

