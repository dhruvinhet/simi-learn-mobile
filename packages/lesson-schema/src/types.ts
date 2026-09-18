export const ELEMENT_TYPES = [
  "text", "line", "arrow", "circle", "rect", "path", "icon", "group",
  "chart", "timeline", "comparison", "callout", "highlight",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];
export type AudienceLevel = "middle-school" | "high-school" | "college";

export type VisualElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  color?: string;
  fill?: string;
  points?: number[];
  icon?: "sun" | "planet" | "book" | "lightbulb" | "atom" | "code" | "person" | "check";
  children?: VisualElement[];
};

export type SceneAnimation = {
  targetId: string;
  kind: "fade" | "draw" | "pulse" | "move" | "highlight";
  startMs: number;
  durationMs: number;
  fromX?: number;
  fromY?: number;
};

export type LessonScene = {
  id: string;
  learningGoal: string;
  narration: string;
  caption: string;
  durationSeconds: number;
  elements: VisualElement[];
  animations: SceneAnimation[];
  visualReferences: string[];
};

export type QuizQuestion = {
  id: string;
  question: string;
  choices: [string, string, string, string];
  correctIndex: number;
  explanation: string;
};

export type Lesson = {
  schemaVersion: 1;
  lessonId: string;
  title: string;
  topic: string;
  audienceLevel: AudienceLevel;
  locale: string;
  estimatedSeconds: number;
  summary: string;
  scenes: LessonScene[];
  quiz: [QuizQuestion, QuizQuestion];
  createdAt: string;
};

export type GenerateLessonRequest = {
  topic: string;
  audienceLevel: AudienceLevel;
  durationSeconds: 45 | 60 | 90;
  locale: string;
  requestId: string;
};

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; value: Lesson }
  | { ok: false; issues: ValidationIssue[] };

