"""Render validated Simi lesson plans to a continuous H.264/AAC MP4.

This service is intentionally separate from the deployed web application.
Run behind HTTPS in production with SUPABASE_URL and SUPABASE_ANON_KEY set.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from urllib.parse import quote
from pathlib import Path

import requests
from flask import Flask, abort, jsonify, request, send_file
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUTPUT = Path(os.environ.get("SIMI_VIDEO_DIR", str(ROOT / "output"))).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
FFMPEG = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = os.environ.get("FFPROBE_BIN") or shutil.which("ffprobe") or "ffprobe"
W, H, FPS = 1280, 720, 12
BG = "#101821"
PANEL = "#17242D"
CREAM = "#F6F2E9"
MUTED = "#AEBDB9"
MINT = "#B9E5CC"
GOLD = "#E8BE79"
jobs: dict[str, dict] = {}
lock = threading.Lock()
render_slots = threading.BoundedSemaphore(2)
app = Flask(__name__)

# ── self-heal keyword sets ────────────────────────────────────────────────────
_UP_WORDS   = {"upward", "rising", "ascending", "up", "toward-surface", "upwards", "rise", "ascend"}
_DOWN_WORDS = {"downward", "falling", "descending", "down", "downwards", "fall", "descend", "sink"}

# Generic ID prefixes that carry no semantic meaning; skip label derivation for these.
_GENERIC_ID_RE = re.compile(
    r"^(rect|circle|ellipse|shape|node|box|line|arrow|path|element|group|layer|item|obj|object|text)-?\d+$",
    re.IGNORECASE,
)


def _id_tokens(element_id: str) -> set[str]:
    """Return lowercase word tokens from a hyphen/underscore-separated element id."""
    return set(re.split(r"[-_]", element_id.lower()))


def heal_scene(scene: dict) -> dict:
    """Apply systematic self-healing corrections to a single scene dict.

    Rules applied (in order):
    A1. Derive a readable label for unlabeled rects/circles whose id is semantic.
    A2. Auto-correct arrow direction when the id/text implies up/down movement.
    A3. Insert a midpoint curve for perfectly-horizontal paths named with rise/up/grow.
    """
    elements = scene.get("elements")
    if not isinstance(elements, list):
        return scene

    healed: list[dict] = []
    for original in elements:
        if not isinstance(original, dict):
            healed.append(original)
            continue
        e = dict(original)
        kind = e.get("type", "")

        # ── A1: Fallback label for unlabeled semantic rects/circles ──────────
        if kind in ("rect", "circle") and not clean_text(e.get("text")):
            raw_id = str(e.get("id", ""))
            if raw_id and not _GENERIC_ID_RE.match(raw_id):
                derived = re.sub(r"[-_]", " ", raw_id).title()[:24]
                e["text"] = derived

        # ── A2: Arrow direction correction ───────────────────────────────────
        elif kind == "arrow":
            id_text = (str(e.get("id", "")) + " " + str(e.get("text", ""))).lower()
            tokens = _id_tokens(str(e.get("id", "")))
            text_words = set(re.split(r"[\s\-_,;:]+", id_text))
            all_words = tokens | text_words

            is_up   = bool(all_words & _UP_WORDS)
            is_down = bool(all_words & _DOWN_WORDS)

            # Coordinate system: tip is at (x, y), tail is at (x - width, y + height).
            # y=0 is TOP; y increases DOWNWARD.
            # For an UPWARD arrow: tip must be visually above tail → tip_y < tail_y
            #   → y < y + height → height > 0.  So we need height > 0.
            #   If height < 0 (tip is below tail = pointing down), negate it.
            # For a DOWNWARD arrow: tip must be visually below tail → tip_y > tail_y
            #   → y > y + height → height < 0.  So we need height < 0.
            #   If height > 0 (tip is above tail = pointing up), negate it.
            if is_up and not is_down:
                height_val = float(e.get("height", 0))
                if height_val < 0:
                    e["height"] = -height_val   # make positive → tip above tail ✓

            elif is_down and not is_up:
                height_val = float(e.get("height", 0))
                if height_val > 0:
                    e["height"] = -height_val   # make negative → tip below tail ✓

        # ── A3: Slight upward curve for perfectly-horizontal rise/up/grow paths ──
        elif kind == "path":
            raw_id = str(e.get("id", "")).lower()
            curve_words = {"rise", "up", "grow", "increase", "ascend", "climb"}
            if _id_tokens(raw_id) & curve_words:
                pts = e.get("points")
                if isinstance(pts, list) and len(pts) == 4 and len(pts) % 2 == 0:
                    # Only 2 points; check if perfectly horizontal (same y)
                    y1_val = float(pts[1])
                    y2_val = float(pts[3])
                    if abs(y1_val - y2_val) < 0.5:
                        # Insert a midpoint with y -= 8 (upward in lesson-unit space)
                        mid_x = (float(pts[0]) + float(pts[2])) / 2
                        mid_y = y1_val - 8
                        e["points"] = [pts[0], pts[1], mid_x, mid_y, pts[2], pts[3]]

        healed.append(e)

    result = dict(scene)
    result["elements"] = healed
    return result


# ─────────────────────────────────────────────────────────────────────────────

def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def color(value: object, fallback: str = MINT) -> str:
    if isinstance(value, str) and len(value) == 7 and value[0] == "#" and all(c in "0123456789abcdefABCDEF" for c in value[1:]):
        # A controlled palette keeps arbitrary model colors readable and cohesive.
        code = value.upper()
        if code in ("#FFCA62", "#FFD166"): return GOLD
        if code in ("#9D8CFF", "#A78BFA"): return "#CAD2F1"
        if code in ("#55DDE0", "#74E0A5"): return MINT
        r, g, b = (int(code[i:i+2], 16) for i in (1, 3, 5))
        if r > g * 1.22 and r > b * 1.18: return "#E5A69B"
        if r > b * 1.3 and g > b * 1.2: return GOLD
        if b > r + 15 and g > r: return "#A9DFEA"
        if b > r * 1.15: return "#C8C1DC"
        return MINT
    return fallback


def _is_dark_color(hex_color: str) -> bool:
    """Return True if the hex color is perceptually dark (luminance < 0.35)."""
    try:
        c = hex_color.lstrip("#")
        if len(c) != 6:
            return True
        r, g, b = (int(c[i:i+2], 16) / 255 for i in (0, 2, 4))
        luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return luminance < 0.35
    except (ValueError, AttributeError):
        return True


def wrap(draw: ImageDraw.ImageDraw, text: str, text_font: ImageFont.FreeTypeFont, max_width: int, max_lines: int = 2) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        if draw.textbbox((0, 0), candidate, font=text_font)[2] <= max_width:
            current = candidate
        else:
            if current: lines.append(current)
            current = word
    if current: lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and draw.textbbox((0, 0), lines[-1] + "…", font=text_font)[2] > max_width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def clean_text(value: object, limit: int = 180) -> str:
    text = str(value or "").translate(str.maketrans({"‑": "-", "‐": "-", "−": "-", "–": "-", "—": "-", " ": " ", " ": " "}))
    return " ".join(text.split())[:limit]


def element_point(e: dict) -> tuple[int, int]:
    return 100 + round(float(e.get("x", 50)) * 10.8), 156 + round(float(e.get("y", 50)) * 3.74)


def draw_element(draw: ImageDraw.ImageDraw, e: dict, phase: float) -> None:
    x, y = element_point(e)
    kind = e.get("type")
    stroke = color(e.get("color") or e.get("fill"))
    fill = color(e.get("fill"), PANEL) if e.get("fill") else PANEL
    editorial = e.get("style") == "editorial"
    width = round(float(e.get("width", 0)) * 10.8)
    height = round(float(e.get("height", 0)) * 3.74)
    if kind == "circle":
        name = str(e.get("id", "")).lower()
        orbit = "path" in name or name.endswith("-orbit") or "cycle" in name
        rx = max(8, round(float(e.get("radius", 5)) * (10.8 if orbit else 3.74)))
        ry = max(8, round(float(e.get("radius", 5)) * 3.74))
        if "sun" in name:
            draw.ellipse((x - rx - 13, y - ry - 13, x + rx + 13, y + ry + 13), outline=GOLD, width=2)
        draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=None if orbit else ("#24343D" if editorial else fill), outline=stroke, width=3 if editorial else 5)
        label = clean_text(e.get("text"), 32)
        if label and not orbit:
            if editorial:
                label_font = font(23, True)
                lines = wrap(draw, label, label_font, max(90, min(220, 1150-x-rx)), 2)
                for idx, line in enumerate(lines):
                    draw.text((x+rx+14, y-(len(lines)*28)/2+idx*28), line, font=label_font, fill=CREAM)
            else:
                label_font = font(min(25, max(17, ry // 2)), True)
                lines = wrap(draw, label, label_font, max(70, rx * 2 - 12), 2)
                text_fill = BG if e.get("fill") and not _is_dark_color(color(e.get("fill"), PANEL)) else CREAM
                for idx, line in enumerate(lines):
                    box = draw.textbbox((0, 0), line, font=label_font)
                    draw.text((x-(box[2]-box[0])/2,y-(len(lines)*label_font.size)/2+idx*(label_font.size+3)),line,font=label_font,fill=text_fill)
        if "planet" in name or name == "sun":
            label = "PLANET" if "planet" in name else "SUN"
            draw.text((x - rx, y + ry + 12), label, font=font(17, True), fill=MUTED)
    elif kind == "rect":
        # Enforce generous minimum dimensions so labels are always readable
        width  = max(110, width)
        height = max(54,  height)
        draw.rounded_rectangle((x, y, x + width, y + height), radius=15, fill="#24343D" if editorial else fill, outline=stroke, width=2 if editorial else 4)
        if editorial:
            draw.rounded_rectangle((x+8, y+10, x+14, y+height-10), radius=3, fill=stroke)
        label = clean_text(e.get("text"), 48)
        if label:
            label_font = font(min(32, max(20, round(height * 0.32))), True)
            lines = wrap(draw, label, label_font, max(60, width - 28), 2)
            line_height = label_font.size + 5
            label_y = y + max(7, (height - len(lines) * line_height) / 2)
            if editorial:
                text_fill = CREAM
            elif e.get("fill"):
                text_fill = BG if not _is_dark_color(color(e.get("fill"), PANEL)) else CREAM
            else:
                text_fill = CREAM
            for line in lines:
                box = draw.textbbox((0, 0), line, font=label_font)
                draw.text((x + (width - (box[2] - box[0])) / 2, label_y), line, font=label_font, fill=text_fill)
                label_y += line_height
    elif kind in ("line", "arrow"):
        if kind == "arrow":
            tail_x, tail_y = x - width, y + height
            draw.line((tail_x, tail_y, x, y), fill=stroke, width=5, joint="curve")
            angle = math.atan2(y - tail_y, x - tail_x)
            for sign in (-1, 1):
                ax = x - 21 * math.cos(angle) + sign * 11 * math.sin(angle)
                ay = y - 21 * math.sin(angle) - sign * 11 * math.cos(angle)
                draw.line((x, y, ax, ay), fill=stroke, width=5)
        else:
            end_x, end_y = x + width, y + height
            name = str(e.get("id", "")).lower()
            if "path" in name or "trajectory" in name or "dotted" in name:
                steps = max(1, int(math.hypot(width, height) / 24))
                for step in range(0, steps, 2):
                    t0 = step / steps
                    t1 = min(1, (step + 1) / steps)
                    draw.line((x + width * t0, y + height * t0, x + width * t1, y + height * t1), fill=stroke, width=4)
            else:
                draw.line((x, y, end_x, end_y), fill=stroke, width=6, joint="curve")
    elif kind == "path":
        points = e.get("points") or []
        if len(points) >= 4 and len(points) % 2 == 0:
            pairs = [(100 + round(float(points[i]) * 10.8), 156 + round(float(points[i + 1]) * 3.74)) for i in range(0, len(points), 2)]
            draw.line(pairs, fill=stroke, width=5, joint="curve")
    elif kind == "text":
        label = clean_text(e.get("text"), 80)
        if label:
            label_font = font(25, True)
            for idx, line in enumerate(wrap(draw, label, label_font, max(80, min(440, 1190 - x)), 2)):
                draw.text((x, y + idx * 31), line, font=label_font, fill=CREAM)


def fit_elements(elements: list[dict]) -> list[dict]:
    """Enlarge compact diagrams without changing their semantic geometry.

    D: If elements look like a solar system (one large orbit circle + smaller
    planet circles), skip density scaling to preserve orbital geometry.
    Otherwise ensure the scale factor uses at least 55% of the canvas.
    """
    bounds = []
    for e in elements:
        if e.get("type") == "text": continue
        x, y = float(e.get("x", 50)), float(e.get("y", 50))
        kind = e.get("type")
        if kind == "circle":
            r = float(e.get("radius", 0))
            bounds.append((x - r, y - r, x + r, y + r))
        elif kind in ("line", "arrow", "rect"):
            dx, dy = float(e.get("width", 0)), float(e.get("height", 0))
            if kind == "arrow": dx = -dx
            bounds.append((min(x, x + dx), min(y, y + dy), max(x, x + dx), max(y, y + dy)))
        elif kind == "path":
            pts = e.get("points") or []
            if len(pts) >= 4:
                xs = [float(v) for v in pts[::2]]
                ys = [float(v) for v in pts[1::2]]
                bounds.append((min(xs), min(ys), max(xs), max(ys)))
    if not bounds: return elements

    left   = min(b[0] for b in bounds)
    right  = max(b[2] for b in bounds)
    top    = min(b[1] for b in bounds)
    bottom = max(b[3] for b in bounds)

    # ── D: Solar-system detection ────────────────────────────────────────────
    # Detect: all non-text elements are circles, one is much larger (orbit) and
    # the rest are small planets.  When detected, skip the density rescale.
    all_circles = all(e.get("type") == "circle" for e in elements if e.get("type") != "text")
    is_solar_system = False
    if all_circles:
        circle_els = [e for e in elements if e.get("type") == "circle"]
        radii = sorted(float(e.get("radius", 5)) for e in circle_els)
        if len(radii) >= 2:
            largest = radii[-1]
            second  = radii[-2]
            # Solar system heuristic: largest orbit circle is ≥ 2.5× the next largest
            is_solar_system = largest >= second * 2.5

    if is_solar_system:
        # Preserve orbital geometry — just center the diagram, no scaling
        center_x = (left + right) / 2
        center_y = (top + bottom) / 2
        result = []
        for original in elements:
            e = dict(original)
            e["x"] = max(0, min(94, 50 + (float(e.get("x", 50)) - center_x)))
            e["y"] = max(0, min(92, 50 + (float(e.get("y", 50)) - center_y)))
            if e.get("type") == "path" and e.get("points"):
                pts = e["points"]
                e["points"] = [
                    50 + (float(v) - center_x) if i % 2 == 0 else 50 + (float(v) - center_y)
                    for i, v in enumerate(pts)
                ]
            result.append(e)
        return result

    # ── D: Density scaling — use at least 55% of canvas ─────────────────────
    # Canvas in lesson-coordinate space: width=~94 units, height=~92 units.
    # 55% of canvas → target span of ~51.7 wide × ~50.6 tall.
    TARGET_W = 94 * 0.55   # ≈ 51.7 lesson units
    TARGET_H = 92 * 0.55   # ≈ 50.6 lesson units
    span_w = max(12, right - left)
    span_h = max(12, bottom - top)

    # Minimum scale to hit 55% fill; cap at 2.5 to avoid overflow
    min_scale_for_density = max(TARGET_W / span_w, TARGET_H / span_h)
    factor = min(2.5, max(min_scale_for_density, min(78 / span_w, 72 / span_h)))

    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    result = []
    for original in elements:
        e = dict(original)
        e["x"] = max(0, min(94, 50 + (float(e.get("x", 50)) - center_x) * factor))
        e["y"] = max(0, min(92, 50 + (float(e.get("y", 50)) - center_y) * factor))
        if e.get("type") != "text":
            for key in ("width", "height", "radius"):
                if key in e:
                    e[key] = float(e[key]) * factor
            if e.get("type") == "path" and e.get("points"):
                pts = e["points"]
                e["points"] = [
                    50 + (float(v) - center_x) * factor if i % 2 == 0 else 50 + (float(v) - center_y) * factor
                    for i, v in enumerate(pts)
                ]
        result.append(e)
    return result


def reflow_overlapping_nodes(elements: list[dict]) -> tuple[list[dict], list[dict]]:
    """Turn overlapping labeled concepts into a readable flow."""
    nodes = [e for e in elements if e.get("type") == "rect" and clean_text(e.get("text"))]
    if len(nodes) < 3 or len(nodes) > 5:
        return elements, []

    def overlap(a: dict, b: dict) -> float:
        x0 = max(float(a["x"]), float(b["x"]))
        y0 = max(float(a["y"]), float(b["y"]))
        x1 = min(float(a["x"]) + float(a["width"]), float(b["x"]) + float(b["width"]))
        y1 = min(float(a["y"]) + float(a["height"]), float(b["y"]) + float(b["height"]))
        smaller = min(float(a["width"]) * float(a["height"]), float(b["width"]) * float(b["height"]))
        return max(0, x1 - x0) * max(0, y1 - y0) / max(1, smaller)

    if not any(overlap(a, b) > 0.12 for i, a in enumerate(nodes) for b in nodes[i + 1:]):
        return elements, []

    result = [dict(e) for e in elements]
    ordered = [next(e for e in result if e.get("id") == node.get("id")) for node in nodes]
    count = len(ordered)
    gap = 4.0
    card_width = (88 - gap * (count - 1)) / count
    for i, node in enumerate(ordered):
        node.update(x=6 + i * (card_width + gap), y=39, width=card_width, height=23)
    return result, ordered


def frame(scene: dict, title: str, index: int, total: int, elapsed: float, duration: float) -> Image.Image:
    # ── E: Apply self-healing corrections before any rendering ───────────────
    scene = heal_scene(scene)

    image = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(image)
    d.rectangle((0, 0, 12, H), fill=MINT)
    d.text((62, 38), "SIMI  /  VISUAL EXPLANATIONS", font=font(20, True), fill=MINT)
    heading = clean_text(scene.get("learningGoal") or title, 120)
    heading = re.sub(r"^(show|illustrate|see that|understand that|explain|describe|identify)\s+", "", heading, flags=re.I)
    if heading: heading = heading[0].upper() + heading[1:]
    for i, line in enumerate(wrap(d, heading, font(36, True), 1110, 2)):
        d.text((62, 79 + i * 46), line, font=font(36, True), fill=CREAM)
    d.rounded_rectangle((56, 168, 1224, 570), radius=26, fill=PANEL, outline="#2B3C44", width=2)
    for gx in range(92, 1210, 48):
        for gy in range(200, 550, 48):
            d.ellipse((gx, gy, gx + 2, gy + 2), fill="#2C3D42")
    composition = str(scene.get("composition") or "")
    if composition == "cycle":
        d.ellipse((380, 205, 900, 535), outline="#304951", width=2)
    elif composition == "comparison":
        d.line((640, 210, 640, 535), fill="#304951", width=2)
    elif composition in ("stack", "vertical"):
        d.line((640, 205, 640, 530), fill="#304951", width=2)
    elif composition == "flow":
        d.line((170, 345, 1110, 345), fill="#304951", width=2)
    elements = [dict(e) for e in scene.get("elements") or []] if composition else fit_elements(scene.get("elements") or [])
    elements, auto_flow = (elements, []) if composition else reflow_overlapping_nodes(elements)
    if composition == "flow":
        for number, node in enumerate((e for e in elements if e.get("type") in ("rect", "circle")), 1):
            x, y = element_point(node)
            d.text((x, y-32), f"{number:02d}", font=font(17, True), fill=MUTED)
    animation = {a.get("targetId"): a for a in scene.get("animations") or []}
    last_animation_ms = max(
        (float(a.get("startMs", 0)) + float(a.get("durationMs", 600)) for a in animation.values()),
        default=1000,
    )
    planned_elapsed = (elapsed / max(0.1, duration)) * (last_animation_ms / 1000) * 1.12
    if auto_flow:
        for left_node, right_node in zip(auto_flow, auto_flow[1:]):
            x0, y0 = element_point(left_node)
            x1, y1 = element_point(right_node)
            tail = (x0 + round(float(left_node["width"]) * 10.8) + 12, y0 + round(float(left_node["height"]) * 3.74) / 2)
            tip  = (x1 - 12, y1 + round(float(right_node["height"]) * 3.74) / 2)
            if tip[0] > tail[0]:
                d.line((*tail, *tip), fill=GOLD, width=5)
                d.polygon([(tip[0], tip[1]), (tip[0] - 15, tip[1] - 9), (tip[0] - 15, tip[1] + 9)], fill=GOLD)
    orbit_element = next(
        (e for e in elements if e.get("type") == "circle" and ("path" in str(e.get("id", "")) or str(e.get("id", "")).endswith("-orbit"))),
        None,
    )
    attached_labels = {
        clean_text(e.get("text")).lower()
        for e in elements
        if e.get("type") in ("rect", "circle", "arrow") and clean_text(e.get("text"))
    }
    # Also suppress text elements that sit inside a rect's bounding box
    rect_boxes = [
        (float(e.get("x", 0)), float(e.get("y", 0)),
         float(e.get("x", 0)) + float(e.get("width", 0)),
         float(e.get("y", 0)) + float(e.get("height", 0)))
        for e in elements if e.get("type") == "rect"
    ]

    def inside_a_rect(ex: float, ey: float) -> bool:
        return any(rx0 <= ex <= rx1 and ry0 <= ey <= ry1 for rx0, ry0, rx1, ry1 in rect_boxes)

    # Collect arrow/line/path labels alongside their stroke color for chip coloring
    labels: list[tuple[str, str]] = []  # (label_text, stroke_color)

    for original in elements:
        a = animation.get(original.get("id"), {})
        start = float(a.get("startMs", 0)) / 1000
        if auto_flow and original.get("type") == "arrow": continue
        e = dict(original)
        active = start <= planned_elapsed < start + max(0.6, float(a.get("durationMs", 600)) / 1000)
        if active and e.get("type") != "text":
            e["color"] = GOLD
        if e.get("type") == "text":
            # Suppress: text whose content duplicates a shape label, OR text positioned inside a rect
            tx, ty = float(original.get("x", 50)), float(original.get("y", 50))
            if clean_text(e.get("text")).lower() not in attached_labels and not inside_a_rect(tx, ty):
                draw_element(d, e, 1)
            continue
        if e.get("type") in ("arrow", "line", "path") and clean_text(e.get("text")):
            chip_color = color(e.get("color") or e.get("fill"), MINT)
            labels.append((clean_text(e.get("text"), 50), chip_color))
        progress = min(1, max(0, (planned_elapsed - start) / max(0.1, float(a.get("durationMs", 600)) / 1000)))
        if planned_elapsed < start: progress = 1
        if a.get("kind") == "move" and orbit_element and "planet" in str(e.get("id", "")):
            center_x = float(orbit_element["x"])
            center_y = float(orbit_element["y"])
            radius = float(orbit_element.get("radius", 20))
            angle = math.atan2(float(e["y"]) - center_y, float(e["x"]) - center_x) + progress * 2 * math.pi
            e["x"] = center_x + radius * math.cos(angle)
            e["y"] = center_y + radius * math.sin(angle)
        elif a.get("kind") == "pulse" and e.get("type") == "circle":
            e["radius"] = float(e.get("radius", 5)) * (1 + 0.08 * math.sin(progress * math.pi))
        elif a.get("kind") == "draw" and e.get("type") == "line" and active:
            e["width"]  = float(e.get("width",  0)) * max(0.15, progress)
            e["height"] = float(e.get("height", 0)) * max(0.15, progress)
        draw_element(d, e, progress)

    # B: Removed duplicate rect-label pass — draw_element() now handles it correctly.

    # ── C: Label chips for arrow/line labels ─────────────────────────────────
    # De-duplicate while preserving insertion order and keeping chip colors
    seen: dict[str, str] = {}
    for label_text, chip_color in labels:
        if label_text not in seen:
            seen[label_text] = chip_color
    unique_labels = list(seen.items())[:5]  # [(label_text, chip_color)]

    if unique_labels:  # C: Only draw the chip row when there are actual labels
        CHIP_H   = 38   # C: taller chips (was 40 in the original spec comment, now 38)
        CHIP_TOP = 514
        CHIP_BOT = CHIP_TOP + CHIP_H
        DOT_R    = 5    # radius of the small colored dot
        MIN_FONT = 16   # C: smaller minimum font (was 19)

        cell = min(220, (1090 - (len(unique_labels) - 1) * 12) / len(unique_labels))
        total_chip_width = len(unique_labels) * cell + (len(unique_labels) - 1) * 12
        first = (W - total_chip_width) / 2

        for idx, (label_text, chip_color) in enumerate(unique_labels):
            x0 = round(first + idx * (cell + 12))
            d.rounded_rectangle((x0, CHIP_TOP, x0 + cell, CHIP_BOT), radius=12, fill="#30444A")

            # C: Colored dot on the left
            dot_cx = x0 + 12 + DOT_R
            dot_cy = (CHIP_TOP + CHIP_BOT) // 2
            d.ellipse((dot_cx - DOT_R, dot_cy - DOT_R, dot_cx + DOT_R, dot_cy + DOT_R), fill=chip_color)

            # C: Text after the dot; smaller minimum font
            text_x = x0 + 12 + DOT_R * 2 + 6
            text_font = font(max(MIN_FONT, 19), True)
            available_w = int(cell) - (12 + DOT_R * 2 + 6 + 8)
            display = wrap(d, label_text, text_font, available_w, 1)[0]

            # If it still doesn't fit, drop to MIN_FONT
            if d.textbbox((0, 0), display, font=text_font)[2] > available_w:
                text_font = font(MIN_FONT, True)
                display = wrap(d, label_text, text_font, available_w, 1)[0]

            text_y = CHIP_TOP + (CHIP_H - text_font.size) // 2
            d.text((text_x, text_y), display, font=text_font, fill=CREAM)

    caption = clean_text(scene.get("caption"), 160)
    d.rounded_rectangle((56, 593, 1224, 678), radius=16, fill="#223139")
    for i, line in enumerate(wrap(d, caption, font(25), 1110, 2)):
        d.text((83, 606 + i * 31), line, font=font(25), fill=CREAM)
    return image


def duration_of(path: Path) -> float:
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _find_piper_model() -> str:
    """Return the best available piper model path.

    Priority:
    1. SIMI_PIPER_MODEL env var
    2. Any .onnx file in the voices/ directory next to app.py
    3. Empty string (fall through to system TTS)
    """
    model = os.environ.get("SIMI_PIPER_MODEL", "").strip()
    if model and Path(model).is_file():
        return model
    # Auto-discover from voices/ directory
    voices_dir = ROOT / "voices"
    if voices_dir.is_dir():
        for candidate in sorted(voices_dir.glob("*.onnx")):
            json_companion = candidate.with_suffix(".onnx.json")
            if json_companion.is_file():
                return str(candidate)
    return ""


def speech(text: str, path: Path, rate: int = 0, length_scale: float = 1.0) -> None:
    """Use an installed offline neural or system voice. Never send lesson text to a TTS endpoint."""
    engine = shutil.which("piper")
    model = _find_piper_model()
    if engine and model and Path(model).is_file():
        subprocess.run(
            [engine, "--model", model, "--output-file", str(path), "--length-scale", f"{length_scale:.3f}"],
            input=text, text=True, encoding="utf-8", check=True, capture_output=True,
        )
    elif os.name == "nt":
        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            "$voice.Rate = [int]$env:SIMI_SPEECH_RATE; "
            "$voice.SetOutputToWaveFile($env:SIMI_SPEECH_FILE); "
            "$voice.Speak($env:SIMI_SPEECH_TEXT); "
            "$voice.Dispose()"
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", script], check=True, capture_output=True,
            env={**os.environ, "SIMI_SPEECH_FILE": str(path), "SIMI_SPEECH_TEXT": text, "SIMI_SPEECH_RATE": str(rate)},
        )
    elif shutil.which("espeak-ng"):
        subprocess.run(["espeak-ng", "-w", str(path), text], check=True, capture_output=True)
    else:
        raise RuntimeError("No offline speech engine found. Install Piper with SIMI_PIPER_MODEL or espeak-ng.")


def render(lesson: dict, destination: Path) -> None:
    if not isinstance(lesson.get("scenes"), list) or not 1 <= len(lesson["scenes"]) <= 8:
        raise ValueError("Invalid lesson scenes")
    if len(json.dumps(lesson)) > 250_000:
        raise ValueError("Lesson too large")
    planned = max(1, float(lesson.get("estimatedSeconds", 60)))
    words = sum(len(str(scene.get("narration", "")).split()) for scene in lesson["scenes"])
    words_per_second = words / planned
    rate = max(-3, min(7, round((words_per_second - 1.7) * 4)))
    length_scale = max(0.75, min(1.35, 2.2 / max(0.5, words_per_second)))
    with tempfile.TemporaryDirectory(prefix="simi-render-") as folder:
        temp = Path(folder)
        parts: list[Path] = []
        for index, scene in enumerate(lesson["scenes"]):
            if not isinstance(scene, dict) or not scene.get("narration") or not isinstance(scene.get("elements"), list):
                raise ValueError("Invalid scene")
            audio = temp / f"{index:02d}.wav"
            speech(clean_text(scene["narration"], 1200), audio, rate, length_scale)
            audio_duration = duration_of(audio)
            # Keep the narration continuous. A modest pitch-preserving tempo
            # adjustment fills the requested scene length; larger mismatches
            # shorten the scene rather than inserting seconds of dead air.
            planned_scene = max(2.0, float(scene.get("durationSeconds", 0)))
            if audio_duration < planned_scene - 0.6:
                target_audio = planned_scene - 0.25
                tempo = audio_duration / target_audio
                if tempo >= 0.78:
                    paced_audio = temp / f"{index:02d}-paced.wav"
                    subprocess.run([
                        FFMPEG, "-y", "-loglevel", "error",
                        "-i", str(audio),
                        "-af", f"atempo={tempo:.4f}",
                        "-c:a", "pcm_s16le", str(paced_audio),
                    ], check=True)
                    audio = paced_audio
                    audio_duration = duration_of(audio)
            seconds = max(audio_duration + 0.25, 2.0)
            video = temp / f"{index:02d}.mp4"
            command = [
                FFMPEG, "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                "-i", str(audio),
                "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k",
                "-t", f"{seconds:.3f}", "-movflags", "+faststart", str(video),
            ]
            proc = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                for frame_index in range(math.ceil(seconds * FPS)):
                    image = frame(scene, clean_text(lesson.get("title"), 120), index, len(lesson["scenes"]), frame_index / FPS, seconds)
                    proc.stdin.write(image.tobytes())
                proc.stdin.close()
                stderr = proc.stderr.read().decode("utf8", "replace")
                if proc.wait() != 0: raise RuntimeError(stderr[-2000:])
            finally:
                if proc.poll() is None: proc.kill()
            parts.append(video)
        listing = temp / "list.txt"
        listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf8")
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
             "-c", "copy", "-movflags", "+faststart", str(destination)],
            check=True,
        )
        if duration_of(destination) < 2: raise RuntimeError("Rendered video is empty")


def owner_from_request() -> str | None:
    if os.environ.get("SIMI_LOCAL_DEMO") == "1" and request.remote_addr in ("127.0.0.1", "::1"):
        return "local-demo"
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not token or not url or not key: return None
    try:
        result = requests.get(
            url.rstrip("/") + "/auth/v1/user",
            headers={"apikey": key, "Authorization": "Bearer " + token},
            timeout=8,
        )
        if result.status_code != 200: return None
        return result.json().get("id")
    except (requests.RequestException, ValueError):
        return None


def canonical_lesson(owner: str, lesson_id: str, submitted: dict) -> dict:
    if owner == "local-demo":
        return submitted
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not secret:
        raise RuntimeError("Worker service credentials are missing")
    endpoint = url + "/rest/v1/generation_requests?select=response,status&request_id=eq." + quote(lesson_id, safe="")
    response = requests.get(endpoint, headers={"apikey": secret, "Authorization": "Bearer " + secret}, timeout=10)
    response.raise_for_status()
    records = response.json()
    if len(records) != 1 or records[0].get("status") != "complete":
        raise ValueError("Lesson is not available for rendering")
    # Request ownership is checked in the SQL query, never trusted from the phone.
    owned = requests.get(
        endpoint + "&owner_id=eq." + quote(owner, safe=""),
        headers={"apikey": secret, "Authorization": "Bearer " + secret},
        timeout=10,
    )
    owned.raise_for_status()
    matches = owned.json()
    if len(matches) != 1: raise ValueError("Lesson does not belong to this user")
    lesson = matches[0].get("response")
    if not isinstance(lesson, dict): raise ValueError("Saved lesson is invalid")
    return lesson


def valid_lesson(lesson: dict) -> bool:
    scenes = lesson.get("scenes")
    if lesson.get("schemaVersion") != 1 or not isinstance(scenes, list) or not 3 <= len(scenes) <= 5:
        return False
    if len(json.dumps(lesson)) > 250_000: return False
    for scene in scenes:
        if not isinstance(scene, dict) or not isinstance(scene.get("narration"), str) or not 1 <= len(scene["narration"]) <= 900:
            return False
        elements = scene.get("elements")
        if not isinstance(elements, list) or not 2 <= len(elements) <= 12: return False
        if any(not isinstance(e, dict) or e.get("type") not in ("text", "line", "arrow", "circle", "rect", "path") for e in elements):
            return False
    return True


def record(job_id: str) -> dict | None:
    with lock:
        cached = jobs.get(job_id)
    if cached: return cached
    meta = OUTPUT / f"{job_id}.json"
    if meta.is_file():
        try:
            data = json.loads(meta.read_text(encoding="utf8"))
            if isinstance(data, dict): return data
        except (OSError, ValueError): pass
    return None


def set_record(job_id: str, data: dict) -> None:
    with lock: jobs[job_id] = data
    (OUTPUT / f"{job_id}.json").write_text(json.dumps(data), encoding="utf8")


def render_job(job_id: str, lesson: dict, owner: str) -> None:
    destination = OUTPUT / f"{job_id}.mp4"
    try:
        render(lesson, destination)
        set_record(job_id, {"status": "complete", "owner": owner})
    except Exception:
        destination.unlink(missing_ok=True)
        set_record(job_id, {"status": "failed", "owner": owner, "message": "The video could not be finished. Your lesson is saved; tap Try rendering again."})
        app.logger.exception("Render failed")
    finally:
        render_slots.release()


@app.post("/v1/videos")
def create_video():
    owner = owner_from_request()
    if not owner: abort(401)
    submitted = request.get_json(silent=True)
    if not isinstance(submitted, dict): abort(400)
    lesson_id = str(submitted.get("lessonId", ""))
    if not re.fullmatch(r"[a-zA-Z0-9-]{8,90}", lesson_id): abort(400)
    try:
        lesson = canonical_lesson(owner, lesson_id, submitted)
    except ValueError: abort(403)
    except (RuntimeError, requests.RequestException):
        app.logger.exception("Cannot load canonical lesson")
        abort(503)
    if not valid_lesson(lesson): abort(400)
    job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, owner + ":" + lesson_id))
    existing = record(job_id)
    with lock: live = job_id in jobs
    if existing and existing.get("owner") == owner and (
        (existing.get("status") == "rendering" and live) or
        ((OUTPUT / f"{job_id}.mp4").is_file() and existing.get("status") == "complete")
    ):
        return jsonify({"jobId": job_id, "status": existing["status"]}), 202
    if not render_slots.acquire(blocking=False):
        return jsonify({"code": "busy", "message": "The video studio is at capacity. Retry shortly."}), 429
    set_record(job_id, {"status": "rendering", "owner": owner})
    threading.Thread(target=render_job, args=(job_id, lesson, owner), daemon=True).start()
    return jsonify({"jobId": job_id, "status": "rendering"}), 202


@app.get("/v1/videos/<job_id>")
def get_video(job_id: str):
    owner = owner_from_request()
    if not owner: abort(401)
    job = record(job_id)
    if not job or job.get("owner") != owner: abort(404)
    return jsonify({key: value for key, value in job.items() if key != "owner"})


@app.get("/v1/videos/<job_id>/file")
def video_file(job_id: str):
    owner = owner_from_request()
    if not owner: abort(401)
    job = record(job_id)
    if not job or job.get("owner") != owner or job.get("status") != "complete": abort(404)
    return send_file(
        OUTPUT / f"{job_id}.mp4",
        mimetype="video/mp4",
        as_attachment=False,
        download_name=f"simi-{job_id}.mp4",
    )


@app.get("/health")
def health():
    return jsonify({"ok": True, "ffmpeg": bool(shutil.which(FFMPEG) or Path(FFMPEG).exists())})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1" if os.environ.get("SIMI_LOCAL_DEMO") == "1" else "0.0.0.0",
        port=int(os.environ.get("PORT", "8787")),
        threaded=True,
    )
