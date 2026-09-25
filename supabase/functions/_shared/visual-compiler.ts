type Node = { id?: unknown; label?: unknown; shape?: unknown; role?: unknown };
type Link = { from?: unknown; to?: unknown; label?: unknown };
type StoryScene = {
  id?: unknown;
  composition?: unknown;
  layout?: unknown;
  elements?: unknown;
  nodes?: unknown;
  links?: unknown;
  animations?: unknown;
  visualReferences?: unknown;
};
type Element = Record<string, unknown>;

const palette = ["#B9E5CC", "#E8BE79", "#A9DFEA", "#C8C1DC", "#E5A69B"];

const slug = (value: string) => {
  const cleaned = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "concept";
  return /^[a-z]/.test(cleaned) ? cleaned : "concept-" + cleaned;
};

const obj = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 24) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

function getCenterAndRadius(e: Element): { cx: number; cy: number; radius: number } {
  const kind = String(e.type);
  if (kind === "circle") {
    return { cx: Number(e.x), cy: Number(e.y), radius: Number(e.radius || 8) };
  }
  const w = Number(e.width || 20);
  const h = Number(e.height || 14);
  return { cx: Number(e.x) + w / 2, cy: Number(e.y) + h / 2, radius: Math.hypot(w, h) / 2 };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function arrowBetween(from: Element, to: Element, id: string, label: string, obstacles: Element[] = []): Element {
  const a = getCenterAndRadius(from);
  const b = getCenterAndRadius(to);
  let dx = b.cx - a.cx;
  let dy = b.cy - a.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  let tailX = a.cx + ux * (a.radius + 1);
  let tailY = a.cy + uy * (a.radius + 1);
  let tipX = b.cx - ux * (b.radius + 1);
  let tipY = b.cy - uy * (b.radius + 1);

  // Autonomous collision avoidance: test if arrow pierces an intermediate body
  for (const obs of obstacles) {
    if (obs === from || obs === to) continue;
    const o = getCenterAndRadius(obs);
    const d = distToSegment(o.cx, o.cy, tailX, tailY, tipX, tipY);
    if (d < o.radius + 3) {
      const px = -uy;
      const py = ux;
      const sign = ((tailX - o.cx) * py - (tailY - o.cy) * px) >= 0 ? 1 : -1;
      const clearance = (o.radius + 8) * sign;
      tailX += px * clearance;
      tailY += py * clearance;
      tipX += px * clearance;
      tipY += py * clearance;
      break;
    }
  }

  // Ensure coordinates stay on canvas [4, 96]
  tipX = Math.max(4, Math.min(96, tipX));
  tipY = Math.max(8, Math.min(92, tipY));
  tailX = Math.max(4, Math.min(96, tailX));
  tailY = Math.max(8, Math.min(92, tailY));

  return {
    id,
    type: "arrow",
    x: Math.round(tipX),
    y: Math.round(tipY),
    width: Math.round(tipX - tailX),
    height: Math.round(tailY - tipY),
    color: "#E8BE79",
    ...(label ? { text: label } : {}),
  };
}

function positions(layout: string, count: number): Array<{ x: number; y: number; width: number; height: number }> {
  if (layout === "vertical") {
    return Array.from({ length: count }, (_, i) => ({ x: 31, y: 76 - i * (64 / Math.max(1, count - 1)), width: 38, height: 12 }));
  }
  if (layout === "stack") {
    return Array.from({ length: count }, (_, i) => ({ x: 30, y: 12 + i * (75 / count), width: 40, height: Math.min(12, 62 / count) }));
  }
  if (layout === "cycle") {
    return Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
      return { x: 42 + 30 * Math.cos(angle), y: 44 + 24 * Math.sin(angle), width: 18, height: 13 };
    });
  }
  if (layout === "orbit") {
    // Central celestial body
    const central = { x: 44, y: 42, width: 14, height: 14 };
    // Orbiting bodies distributed along the orbital ellipse
    const orbitSlots = Array.from({ length: Math.max(1, count - 1) }, (_, i) => {
      const angle = (i * Math.PI * 2) / Math.max(1, count - 1);
      return { x: 44 + 32 * Math.cos(angle), y: 42 + 20 * Math.sin(angle), width: 14, height: 14 };
    });
    return [central, ...orbitSlots].slice(0, count);
  }
  if (layout === "spatial") {
    // Landscape / physical domain:
    // Slot 0: Light / Energy source in upper corner
    // Slot 1: Primary subject in lower center
    // Slots 2+: Surrounding inputs / outputs / interactions
    const slots = [
      { x: 14, y: 16, width: 16, height: 16 }, // Top-left sun/source
      { x: 50, y: 48, width: 34, height: 24 }, // Center-right subject (leaf/apparatus)
      { x: 16, y: 64, width: 22, height: 16 }, // Input (e.g. water/CO2/reactant)
      { x: 74, y: 22, width: 20, height: 16 }, // Output (e.g. oxygen/product)
      { x: 72, y: 72, width: 22, height: 16 }, // Output 2 (e.g. glucose/energy)
    ];
    return slots.slice(0, count);
  }
  if (layout === "hub") {
    const slots = [{ x: 8, y: 39 }, { x: 72, y: 39 }, { x: 40, y: 8 }, { x: 40, y: 70 }];
    return [{ x: 38, y: 39, width: 24, height: 16 }, ...slots.slice(0, count - 1).map((p) => ({ ...p, width: 20, height: 14 }))];
  }
  if (layout === "comparison" && count <= 4) {
    return Array.from({ length: count }, (_, i) => ({ x: i % 2 === 0 ? 8 : 55, y: count > 2 && i >= 2 ? 62 : 32, width: 37, height: 19 }));
  }
  const gap = 5;
  const width = (88 - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: 6 + i * (width + gap), y: 40, width, height: 20 }));
}

function clamp(val: number, min = 4, max = 96): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Universal auto-scaling and centering:
 * If elements are clumped in a small sub-area of the canvas (< 45% span),
 * smoothly expands and centers them so the diagram is clear and legible.
 */
function normalizeAndBalanceElements(elements: Element[]): Element[] {
  let minX = 100, maxX = 0, minY = 100, maxY = 0;
  let count = 0;

  for (const e of elements) {
    const x = Number(e.x ?? 50);
    const y = Number(e.y ?? 50);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + Number(e.width ?? 0));
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + Number(e.height ?? 0));
    count++;
  }

  if (count < 2 || minX >= maxX || minY >= maxY) return elements;

  const currentW = maxX - minX;
  const currentH = maxY - minY;

  // If already well distributed, just ensure clamping
  if (currentW >= 48 || currentH >= 42) {
    return elements.map((e) => {
      const copy = { ...e };
      if (typeof copy.x === "number") copy.x = clamp(copy.x);
      if (typeof copy.y === "number") copy.y = clamp(copy.y, 8, 92);
      return copy;
    });
  }

  // Scale and center to occupy ~65% of canvas
  const targetW = 68;
  const targetH = 58;
  const scale = Math.min(2.0, Math.max(1.1, Math.min(targetW / Math.max(10, currentW), targetH / Math.max(10, currentH))));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return elements.map((e) => {
    const copy = { ...e };
    if (typeof copy.x === "number") copy.x = clamp(50 + (copy.x - cx) * scale);
    if (typeof copy.y === "number") copy.y = clamp(50 + (copy.y - cy) * scale, 8, 92);
    if (typeof copy.width === "number" && copy.type !== "arrow" && copy.type !== "line") copy.width = Math.min(50, Math.round(copy.width * scale));
    if (typeof copy.height === "number" && copy.type !== "arrow" && copy.type !== "line") copy.height = Math.min(40, Math.round(copy.height * scale));
    if (typeof copy.radius === "number") copy.radius = Math.min(24, Math.round(copy.radius * Math.min(1.4, scale)));
    if (Array.isArray(copy.points)) {
      copy.points = copy.points.map((val: unknown, idx: number) => {
        const num = Number(val);
        if (!Number.isFinite(num)) return 50;
        return idx % 2 === 0 ? clamp(50 + (num - cx) * scale) : clamp(50 + (num - cy) * scale, 8, 92);
      });
    }
    return copy;
  });
}

/**
 * Universal Collision Resolver:
 * Resolves overlapping labeled rectangular elements.
 */
function resolveCollisions(elements: Element[]): Element[] {
  const boxes = elements.filter((e) => e.type === "rect" && text(e.text));
  if (boxes.length < 2) return elements;

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const ax = Number(a.x ?? 0), ay = Number(a.y ?? 0), aw = Number(a.width ?? 20), ah = Number(a.height ?? 14);
      const bx = Number(b.x ?? 0), by = Number(b.y ?? 0), bw = Number(b.width ?? 20), bh = Number(b.height ?? 14);

      const overlapW = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
      const overlapH = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
      const smallerArea = Math.min(aw * ah, bw * bh);

      if (smallerArea > 0 && (overlapW * overlapH) / smallerArea > 0.12) {
        if (overlapW < overlapH) {
          const shift = (overlapW / 2) + 2;
          if (ax < bx) { a.x = clamp(ax - shift); b.x = clamp(bx + shift); }
          else { a.x = clamp(ax + shift); b.x = clamp(bx - shift); }
        } else {
          const shift = (overlapH / 2) + 2;
          if (ay < by) { a.y = clamp(ay - shift, 8, 92); b.y = clamp(by + shift, 8, 92); }
          else { a.y = clamp(ay + shift, 8, 92); b.y = clamp(by - shift, 8, 92); }
        }
      }
    }
  }
  return elements;
}

export function compileVisualPlan(
  raw: unknown,
  context?: { scenes?: Array<{ id?: string; narration?: string; learningGoal?: string; title?: string }>; topic?: string; title?: string }
): { scenes: Record<string, unknown>[] } {
  let input: unknown[] = [];
  if (Array.isArray(raw)) input = raw;
  else if (obj(raw)) {
    if (Array.isArray(raw.scenes)) input = raw.scenes;
    else if (Array.isArray(raw.storyboard)) input = raw.storyboard;
    else if (Array.isArray(raw.visuals)) input = raw.visuals;
    else {
      const firstArray = Object.values(raw).find(Array.isArray);
      if (firstArray) input = firstArray;
    }
  }

  return {
    scenes: input.map((value: unknown, sceneIndex: number) => {
      const scene: StoryScene = obj(value) ? value : {};
      const sceneContext = context?.scenes?.[sceneIndex] ?? {};
      const sceneId = text(scene.id, 48) || `scene-${sceneIndex + 1}`;
      const layout = text(scene.composition || scene.layout, 24) || "spatial";

      const ids = new Set<string>();
      let elements: Element[] = [];

      // ── Path A: Direct Spatial Elements Output from LLM Pass 2 ─────────────
      if (Array.isArray(scene.elements) && scene.elements.length >= 2) {
        for (let i = 0; i < scene.elements.length; i++) {
          const rawEl = scene.elements[i];
          if (!obj(rawEl)) continue;

          let id = slug(text(rawEl.id, 40) || `elem-${sceneIndex + 1}-${i + 1}`);
          while (ids.has(id)) id = slug(`${id}-${i + 1}`);
          ids.add(id);

          const kind = ["circle", "rect", "path", "arrow", "line", "text"].includes(String(rawEl.type))
            ? String(rawEl.type)
            : "rect";

          const elColor = typeof rawEl.color === "string" && /^#[0-9a-f]{6}$/i.test(rawEl.color)
            ? rawEl.color
            : palette[i % palette.length];

          const el: Element = {
            id,
            type: kind,
            x: clamp(Number(rawEl.x ?? 50)),
            y: clamp(Number(rawEl.y ?? 50), 6, 94),
            color: elColor,
            fill: typeof rawEl.fill === "string" && /^#[0-9a-f]{6}$/i.test(rawEl.fill) ? rawEl.fill : elColor,
            style: "editorial",
          };

          if (rawEl.text) el.text = text(rawEl.text, 64);
          if (kind === "circle") el.radius = Math.max(3, Math.min(26, Number(rawEl.radius ?? 8)));
          if (kind === "rect" || kind === "line" || kind === "arrow") {
            el.width = Number(rawEl.width ?? 20);
            el.height = Number(rawEl.height ?? 14);
          }
          if (kind === "path" && Array.isArray(rawEl.points)) {
            el.points = rawEl.points
              .map(Number)
              .filter((n) => Number.isFinite(n))
              .map((val, idx) => (idx % 2 === 0 ? clamp(val) : clamp(val, 6, 94)));
          }

          elements.push(el);
        }
      }

      // ── Path B: Node-Link Fallback Synthesis (Zero Topic Regexes) ───────────
      if (elements.length < 2) {
        let nodes: Node[] = Array.isArray(scene.nodes) ? [...scene.nodes.filter(obj)] : [];
        if (nodes.length < 2) {
          nodes = [
            { id: "core-subject", label: text(sceneContext.learningGoal, 22) || "Core Principle", shape: "circle" },
            { id: "secondary-subject", label: "Active Dynamic", shape: "rect" },
          ];
        }

        const slots = positions(layout, nodes.length);
        nodes.forEach((node, i) => {
          const label = text(node.label, 24);
          let id = slug(text(node.id, 40) || label || `concept-${sceneIndex + 1}-${i + 1}`);
          while (ids.has(id)) id = slug(`${id}-${i + 1}`);
          ids.add(id);

          const shape = node.shape === "circle" ? "circle" : "rect";
          const slot = slots[i]!;
          const nodeColor = palette[i % palette.length];

          const base: Element = {
            id,
            type: shape,
            x: slot.x,
            y: slot.y,
            text: label,
            color: nodeColor,
            fill: nodeColor,
            style: "editorial",
          };

          if (shape === "circle") {
            elements.push({
              ...base,
              x: slot.x + slot.width / 2,
              y: slot.y + slot.height / 2,
              radius: Math.min(slot.width, slot.height) / 2,
            });
          } else {
            elements.push({ ...base, width: slot.width, height: slot.height });
          }
        });

        // Generate arrows between nodes
        const rawLinks: Link[] = Array.isArray(scene.links) ? [...scene.links.filter(obj)] : [];
        if (rawLinks.length > 0) {
          for (const link of rawLinks) {
            const from = elements.find((e) => e.id === slug(text(link.from, 40)));
            const to = elements.find((e) => e.id === slug(text(link.to, 40)));
            if (!from || !to || from === to) continue;
            elements.push(arrowBetween(from, to, `link-${elements.length}`, text(link.label, 24), elements));
          }
        } else if (elements.length >= 2) {
          for (let i = 0; i < elements.length - 1; i++) {
            elements.push(arrowBetween(elements[i]!, elements[i + 1]!, `link-${elements.length}`, "", elements));
          }
        }
      }

      // ── Step 2: Universal Geometric Optimization & Collision Avoidance ─────
      elements = normalizeAndBalanceElements(elements);
      elements = resolveCollisions(elements);

      // ── Step 3: Progressive Kinetic Animations ─────────────────────────────
      const durationMs = 12000;
      const animations = elements.map((element, i) => {
        const kind = String(element.type);
        const startMs = Math.round((i * durationMs) / Math.max(1, elements.length * 1.2));
        if (kind === "path" || kind === "line" || kind === "arrow") {
          return { targetId: element.id, kind: "draw", startMs, durationMs: 2000 };
        }
        if (kind === "circle" && (String(element.id).includes("orbit") || String(element.id).includes("planet") || String(element.id).includes("satellite") || String(element.id).includes("electron"))) {
          return { targetId: element.id, kind: "move", startMs: 0, durationMs };
        }
        return { targetId: element.id, kind: "highlight", startMs, durationMs: 2200 };
      });

      return {
        id: sceneId,
        composition: layout,
        elements,
        animations,
        visualReferences: elements.map((e) => String(e.id)),
      };
    }),
  };
}

