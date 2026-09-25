type Node = { id?: unknown; label?: unknown; shape?: unknown };
type Link = { from?: unknown; to?: unknown; label?: unknown };
type StoryScene = { id?: unknown; layout?: unknown; nodes?: unknown; links?: unknown };
type Element = Record<string, unknown>;

const palette = ["#B9E5CC", "#E8BE79", "#A9DFEA", "#C8C1DC", "#E5A69B"];
const slug = (value: string) => {
  const cleaned = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "concept";
  return /^[a-z]/.test(cleaned) ? cleaned : "concept-" + cleaned;
};
const obj = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 24) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

function positions(layout: string, count: number): Array<{x: number; y: number; width: number; height: number}> {
  if (layout === "vertical") return Array.from({ length: count }, (_, i) => ({ x: 31, y: 76 - i * (64 / Math.max(1,count-1)), width: 38, height: 12 }));
  if (layout === "stack") return Array.from({ length: count }, (_, i) => ({ x: 30, y: 12 + i * (75 / count), width: 40, height: Math.min(12, 62 / count) }));
  if (layout === "cycle") return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / count;
    return { x: 40 + 31 * Math.cos(angle), y: 43 + 27 * Math.sin(angle), width: 20, height: 13 };
  });
  if (layout === "hub") {
    const slots = [{x: 8,y: 39},{x: 72,y: 39},{x: 40,y: 8},{x: 40,y: 70}];
    return [{x: 38,y: 39,width: 24,height: 16}, ...slots.slice(0,count-1).map((p) => ({...p,width:20,height:14}))];
  }
  if (layout === "comparison" && count <= 4) return Array.from({length:count}, (_,i) => ({x: i%2===0 ? 8 : 55, y: count>2 && i>=2 ? 62 : 32, width:37,height:19}));
  const gap = 5;
  const width = (88 - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: 6 + i * (width + gap), y: 40, width, height: 20 }));
}

function arrowBetween(from: Element, to: Element, id: string, label: string): Element {
  const bounds = (element: Element) => element.type === "circle"
    ? { x: Number(element.x)-Number(element.radius), y: Number(element.y)-Number(element.radius), w: 2*Number(element.radius), h: 2*Number(element.radius) }
    : { x: Number(element.x), y: Number(element.y), w: Number(element.width), h: Number(element.height) };
  const a = bounds(from);
  const b = bounds(to);
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  let tailX: number, tailY: number, tipX: number, tipY: number;
  if (Math.abs(dx) >= Math.abs(dy)) {
    tailX = dx >= 0 ? a.x + a.w + 1 : a.x - 1;
    tipX = dx >= 0 ? b.x - 1 : b.x + b.w + 1;
    tailY = a.y + a.h / 2; tipY = b.y + b.h / 2;
  } else {
    tailX = a.x + a.w / 2; tipX = b.x + b.w / 2;
    tailY = dy >= 0 ? a.y + a.h + 1 : a.y - 1;
    tipY = dy >= 0 ? b.y - 1 : b.y + b.h + 1;
  }
  return { id, type: "arrow", x: Math.max(0,Math.min(100,tipX)), y: Math.max(0,Math.min(100,tipY)), width: tipX-tailX, height: tailY-tipY, color: "#E8BE79", ...(label ? { text: label } : {}) };
}

export function compileVisualPlan(raw: unknown): { scenes: Record<string, unknown>[] } {
  const input = obj(raw) && Array.isArray(raw.scenes) ? raw.scenes : [];
  return { scenes: input.map((value: unknown, sceneIndex: number) => {
    const scene: StoryScene = obj(value) ? value : {};
    const rawNodes: Node[] = Array.isArray(scene.nodes) ? scene.nodes.filter(obj).slice(0, 6) : [];
    const ids = new Set<string>();
    const layout = ["flow","stack","cycle","hub","comparison","vertical"].includes(String(scene.layout)) ? String(scene.layout) : "flow";
    const slots = positions(layout, rawNodes.length);
    const elements: Element[] = rawNodes.map((node, i) => {
      const label = text(node.label, 22);
      let id = slug(text(node.id, 40) || label || "concept");
      while (ids.has(id)) id = slug(id + "-" + i);
      ids.add(id);
      const shape = node.shape === "circle" ? "circle" : "rect";
      const slot = slots[i]!;
      const base: Element = { id, type: shape, x: slot.x, y: slot.y, text: label, color: palette[i % palette.length], fill: palette[i % palette.length], style: "editorial" };
      if (shape === "circle") return { ...base, x: slot.x + slot.width / 2, y: slot.y + slot.height / 2, radius: Math.min(slot.width,slot.height) / 2 };
      return { ...base, width: slot.width, height: slot.height };
    });
    const links: Link[] = Array.isArray(scene.links) ? scene.links.filter(obj).slice(0, 6) : [];
    if (links.length === 0 && ["flow","stack","cycle","vertical"].includes(layout)) {
      for (let i=0;i<elements.length-1;i++) links.push({from:elements[i]!.id,to:elements[i+1]!.id});
      if (layout === "cycle" && elements.length>2) links.push({from:elements[elements.length-1]!.id,to:elements[0]!.id});
    }
    for (const link of links) {
      const from = elements.find((e) => e.id === slug(text(link.from, 40)));
      const to = elements.find((e) => e.id === slug(text(link.to, 40)));
      if (!from || !to || from === to) continue;
      elements.push(arrowBetween(from,to,`link-${elements.length}`,text(link.label,36)));
    }
    const durationMs = 12000;
    const animations = elements.map((element, i) => ({ targetId: element.id, kind: element.type === "arrow" ? "draw" : "highlight", startMs: Math.round(i * durationMs / Math.max(1,elements.length)), durationMs: Math.round(durationMs / Math.max(1,elements.length)) }));
    return { id: text(scene.id, 48) || `scene-${sceneIndex+1}`, composition: layout, elements, animations, visualReferences: elements.map((e) => e.id) };
  }) };
}

