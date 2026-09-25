"""
generate_logo.py — Simi Learn production logo generator
Produces four PNG assets using only Pillow (no external fonts required).

Assets:
  apps/mobile/assets/icon.png          1024×1024  app icon
  apps/mobile/assets/adaptive-icon.png 1024×1024  transparent-bg foreground
  apps/mobile/assets/mark.png           256×256   symbol mark
  apps/mobile/assets/splash.png        1284×2778  splash screen
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Brand colours
# ---------------------------------------------------------------------------
BG_DARK      = (13,  23,  25)          # #0D1719  splash / outer bg
BG_CARD      = (20,  33,  37)          # #142125  icon card bg
MINT         = (185, 229, 204)         # #B9E5CC
GOLD         = (232, 190, 121)         # #E8BE79
MUTED        = (100, 130, 120)         # subdued tagline colour
TRANSPARENT  = (0, 0, 0, 0)

# ---------------------------------------------------------------------------
# Output paths
# ---------------------------------------------------------------------------
BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "apps", "mobile", "assets")
os.makedirs(ASSETS, exist_ok=True)

ICON_PATH     = os.path.join(ASSETS, "icon.png")
ADAPTIVE_PATH = os.path.join(ASSETS, "adaptive-icon.png")
MARK_PATH     = os.path.join(ASSETS, "mark.png")
SPLASH_PATH   = os.path.join(ASSETS, "splash.png")

# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------
def load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Try several known bold fonts; fall back to Pillow default."""
    candidates = []
    if bold:
        candidates = [
            "arialbd.ttf",          # Windows Arial Bold
            "Arial Bold.ttf",
            "Arial_Bold.ttf",
            "DejaVuSans-Bold.ttf",  # Linux / bundled
            "DejaVuSans-Bold",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
    else:
        candidates = [
            "arial.ttf",
            "Arial.ttf",
            "DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            pass
    # Pillow built-in bitmap fallback
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Core drawing helpers
# ---------------------------------------------------------------------------

def draw_rounded_rect(draw: ImageDraw.ImageDraw,
                      bbox: tuple, radius: int,
                      fill=None, outline=None, outline_width: int = 0):
    """Draw a filled rounded rectangle."""
    x0, y0, x1, y1 = bbox
    r = min(radius, (x1 - x0) // 2, (y1 - y0) // 2)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill,
                           outline=outline, width=outline_width)


def draw_s_mark(draw: ImageDraw.ImageDraw,
                cx: float, cy: float,
                size: float,
                stroke: float,
                mint=MINT, gold=GOLD):
    """
    Draw the stylised 'S' mark centred at (cx, cy) within a square of `size`.

    The S is built from TWO thick arc strokes:
      • Top half    – semicircle opening to the RIGHT  (upper half of S)
      • Bottom half – semicircle opening to the LEFT   (lower half of S)

    Then a small filled play-triangle (▶) in gold sits at the right-centre
    junction of the two arcs.

    Parameters
    ----------
    size   : overall bounding size of the S shape
    stroke : line width
    """
    # Radii of the two semicircles
    r = size * 0.26          # radius of each arc
    gap = size * 0.01        # vertical gap between the two halves

    # ---- top arc (curves to the right) ------------------------------------
    # Centre of the top circle sits above the overall centre
    top_cx = cx + r * 0.05   # very slightly right so arcs join cleanly
    top_cy = cy - r - gap / 2

    top_bbox = [
        top_cx - r, top_cy - r,
        top_cx + r, top_cy + r,
    ]
    # Pillow arc: angles are measured clockwise from 3 o'clock (east)
    # We want the arc that sweeps the LEFT half of the top circle (i.e. the
    # part visible as the upper stroke of an S).
    # From 180° (west/left) going clockwise to 360°/0° (east/right) = bottom half
    # But for the top-half of the S the stroke goes from top-left around the
    # top and back down to the centre → sweep from 180° to 0° (going through
    # north, i.e. counter-clockwise in screen coords where y grows down).
    # Pillow's arc goes counter-clockwise in standard maths convention when
    # angles increase, but since y-axis is flipped:  increasing angle = clockwise.
    # Upper-S arc: starts at 180 (left side, middle height of top circle),
    #              ends at 360 (right side).  This sweeps through the top.
    draw.arc(top_bbox, start=180, end=360, fill=mint, width=int(stroke))

    # ---- bottom arc (curves to the left) ----------------------------------
    bot_cx = cx - r * 0.05
    bot_cy = cy + r + gap / 2

    bot_bbox = [
        bot_cx - r, bot_cy - r,
        bot_cx + r, bot_cy + r,
    ]
    # Lower-S arc: starts at 0 (right, middle height of bot circle),
    #              ends at 180 (left side). Sweeps through the bottom.
    draw.arc(bot_bbox, start=0, end=180, fill=mint, width=int(stroke))

    # ---- gold play triangle -----------------------------------------------
    # Place it at the right-centre junction (where the two arcs meet / cross)
    tri_size = size * 0.14
    tri_cx   = cx + r * 1.0
    tri_cy   = cy

    # Equilateral triangle pointing right
    h = tri_size * math.sqrt(3) / 2
    tri_pts = [
        (tri_cx + tri_size * 0.55,  tri_cy),               # rightmost tip
        (tri_cx - tri_size * 0.45,  tri_cy - h * 0.5),     # top-left
        (tri_cx - tri_size * 0.45,  tri_cy + h * 0.5),     # bottom-left
    ]
    draw.polygon(tri_pts, fill=gold)


# ---------------------------------------------------------------------------
# 1. icon.png  —  1024 × 1024
# ---------------------------------------------------------------------------

def make_icon(size=1024,
              bg=BG_CARD,
              transparent_bg=False) -> Image.Image:
    mode = "RGBA" if transparent_bg else "RGB"
    fill = TRANSPARENT if transparent_bg else bg

    img = Image.new(mode, (size, size), fill)
    draw = ImageDraw.Draw(img)

    if not transparent_bg:
        # Rounded-rect card background (slight inset so corners look app-icon-like)
        pad  = int(size * 0.0)   # flush to edges; OS clips the corners
        radius = int(size * 0.22)
        draw_rounded_rect(draw,
                          (pad, pad, size - pad, size - pad),
                          radius=radius,
                          fill=bg)

    # ── S mark ──────────────────────────────────────────────────────────────
    mark_size = size * 0.52     # S occupies ~52 % of canvas width
    stroke    = size * 0.055    # ~56 px at 1024

    # Centre the S slightly above midpoint to leave room for wordmark
    cx = size * 0.50
    cy = size * 0.42

    draw_s_mark(draw, cx, cy, mark_size, stroke)

    # ── 'simi.' wordmark ────────────────────────────────────────────────────
    font_size = int(size * 0.10)
    font = load_font(font_size, bold=True)

    text  = "simi."
    # Measure text
    bbox  = draw.textbbox((0, 0), text, font=font)
    tw    = bbox[2] - bbox[0]
    th    = bbox[3] - bbox[1]

    tx = (size - tw) // 2 - bbox[0]
    ty = int(size * 0.76) - bbox[1]

    draw.text((tx, ty), text, font=font, fill=MINT)

    return img


# ---------------------------------------------------------------------------
# 2. mark.png  —  256 × 256  (symbol only, no wordmark)
# ---------------------------------------------------------------------------

def make_mark(size=256) -> Image.Image:
    img  = Image.new("RGB", (size, size), BG_CARD)
    draw = ImageDraw.Draw(img)

    pad    = 0
    radius = int(size * 0.22)
    draw_rounded_rect(draw,
                      (pad, pad, size - pad, size - pad),
                      radius=radius,
                      fill=BG_CARD)

    mark_size = size * 0.54
    stroke    = size * 0.058

    cx = size * 0.50
    cy = size * 0.46

    draw_s_mark(draw, cx, cy, mark_size, stroke)

    # small 'simi.' at bottom in mark too, but smaller
    font_size = int(size * 0.11)
    font = load_font(font_size, bold=True)
    text = "simi."
    bbox = draw.textbbox((0, 0), text, font=font)
    tw   = bbox[2] - bbox[0]
    tx   = (size - tw) // 2 - bbox[0]
    ty   = int(size * 0.78) - bbox[1]
    draw.text((tx, ty), text, font=font, fill=MINT)

    return img


# ---------------------------------------------------------------------------
# 3. adaptive-icon.png  —  1024 × 1024  transparent background
# ---------------------------------------------------------------------------

def make_adaptive_icon(size=1024) -> Image.Image:
    return make_icon(size=size, transparent_bg=True)


# ---------------------------------------------------------------------------
# 4. splash.png  —  1284 × 2778
# ---------------------------------------------------------------------------

def make_splash(w=1284, h=2778) -> Image.Image:
    img  = Image.new("RGB", (w, h), BG_DARK)
    draw = ImageDraw.Draw(img)

    # ── S mark (larger, centred at ~42 % height) ────────────────────────────
    mark_size = w * 0.38
    stroke    = w * 0.042

    cx = w * 0.50
    cy = h * 0.41

    draw_s_mark(draw, cx, cy, mark_size, stroke)

    # ── 'simi.' wordmark ─────────────────────────────────────────────────────
    font_size_wm = int(w * 0.13)
    font_wm = load_font(font_size_wm, bold=True)

    text_wm = "simi."
    bbox_wm = draw.textbbox((0, 0), text_wm, font=font_wm)
    tw = bbox_wm[2] - bbox_wm[0]
    tx = (w - tw) // 2 - bbox_wm[0]
    ty = int(h * 0.53) - bbox_wm[1]
    draw.text((tx, ty), text_wm, font=font_wm, fill=MINT)

    # ── tagline ──────────────────────────────────────────────────────────────
    font_size_tag = int(w * 0.045)
    font_tag = load_font(font_size_tag, bold=False)

    tagline = "Visual lessons, instantly."
    bbox_tag = draw.textbbox((0, 0), tagline, font=font_tag)
    tw2 = bbox_tag[2] - bbox_tag[0]
    tx2 = (w - tw2) // 2 - bbox_tag[0]
    ty2 = int(h * 0.60) - bbox_tag[1]
    draw.text((tx2, ty2), tagline, font=font_tag, fill=MUTED)

    # subtle horizontal rule between wordmark and tagline
    rule_y   = int(h * 0.585)
    rule_w   = int(w * 0.18)
    rule_x0  = (w - rule_w) // 2
    draw.line([(rule_x0, rule_y), (rule_x0 + rule_w, rule_y)],
              fill=(40, 65, 60), width=2)

    return img


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Generating Simi Learn logo assets ...")

    icon = make_icon()
    icon.save(ICON_PATH, "PNG", optimize=True)
    print(f"  [OK]  icon.png            {icon.size}  ->  {ICON_PATH}")

    adaptive = make_adaptive_icon()
    adaptive.save(ADAPTIVE_PATH, "PNG", optimize=True)
    print(f"  [OK]  adaptive-icon.png   {adaptive.size}  ->  {ADAPTIVE_PATH}")

    mark = make_mark()
    mark.save(MARK_PATH, "PNG", optimize=True)
    print(f"  [OK]  mark.png            {mark.size}  ->  {MARK_PATH}")

    splash = make_splash()
    splash.save(SPLASH_PATH, "PNG", optimize=True)
    print(f"  [OK]  splash.png          {splash.size}  ->  {SPLASH_PATH}")

    print("\nDone. All four assets written.")
