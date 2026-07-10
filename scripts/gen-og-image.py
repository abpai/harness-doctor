#!/usr/bin/env python3
"""Generate the Open Graph / social preview card for the Harness Doctor site.

Produces site/og-image.png at 1200x630, matching the landing page's
dark, health-themed palette. Run from the repo root:

    python3 scripts/gen-og-image.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = Path(__file__).resolve().parents[1] / "site" / "og-image.png"

# Palette (mirrors site/styles.css)
BG = (11, 15, 16)
PANEL = (19, 26, 28)
PANEL_2 = (22, 30, 33)
BORDER = (35, 48, 51)
TEXT = (230, 240, 238)
MUTED = (147, 166, 163)
DIM = (107, 125, 122)
ACCENT = (61, 220, 151)
ACCENT_3 = (122, 242, 196)
WARN = (244, 193, 82)
ERR = (255, 107, 107)

FONT_DIR = "/usr/share/fonts/truetype/liberation"
MONO_DIR = "/usr/share/fonts/truetype/dejavu"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


bold = lambda s: font(f"{FONT_DIR}/LiberationSans-Bold.ttf", s)
reg = lambda s: font(f"{FONT_DIR}/LiberationSans-Regular.ttf", s)
mono = lambda s: font(f"{MONO_DIR}/DejaVuSansMono.ttf", s)
mono_b = lambda s: font(f"{MONO_DIR}/DejaVuSansMono-Bold.ttf", s)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# Soft radial glow in the top-right, approximated with stacked ellipses.
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
cx, cy = 900, -40
for r in range(640, 0, -8):
    t = r / 640
    col = lerp(ACCENT, BG, 1 - (1 - t) * 0.16)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
img = Image.blend(img, glow, 0.5)
draw = ImageDraw.Draw(img)

# Faint grid lines
for x in range(0, W, 48):
    draw.line([(x, 0), (x, H)], fill=lerp(BG, TEXT, 0.03))
for y in range(0, H, 48):
    draw.line([(0, y), (W, y)], fill=lerp(BG, TEXT, 0.03))

PAD = 80

# Logo mark — stethoscope-ish "Y" glyph in an accent rounded square.
lx, ly, ls = PAD, 70, 76
draw.rounded_rectangle([lx, ly, lx + ls, ly + ls], radius=18, fill=ACCENT)
# Draw the mark in background color
mk = ImageDraw.Draw(img)
ox, oy = lx + ls / 2, ly + 16
mk.line([(ox, oy), (ox, oy + 22)], fill=BG, width=6)
mk.line([(ox - 18, oy + 6), (ox + 18, oy + 6)], fill=BG, width=6)
mk.line([(ox, oy + 22), (ox - 12, oy + 50)], fill=BG, width=6)
mk.line([(ox, oy + 22), (ox + 12, oy + 50)], fill=BG, width=6)
mk.ellipse([ox - 4, oy + 50, ox + 4, oy + 58], fill=BG)

draw.text((lx + ls + 26, ly + 16), "Harness Doctor", font=bold(40), fill=TEXT)
draw.text((lx + ls + 28, ly + 64), "bunx --bun @andypai/harness-doctor", font=mono(22), fill=MUTED)

LEFT_W = 560  # left text column width


def wrap(text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# Headline — wrapped to the left column, accent on the final word "healthy."
head_font = bold(66)
head_lines = wrap("Keep your agent harness healthy.", head_font, LEFT_W)
hy = 200
for line in head_lines:
    if "healthy." in line:
        before = line.replace("healthy.", "").rstrip()
        if before:
            draw.text((PAD, hy), before + " ", font=head_font, fill=TEXT)
            bx0 = PAD + draw.textlength(before + " ", font=head_font)
        else:
            bx0 = PAD
        draw.text((bx0, hy), "healthy.", font=head_font, fill=ACCENT_3)
    else:
        draw.text((PAD, hy), line, font=head_font, fill=TEXT)
    hy += 80

# Subhead — wrapped under the headline
sub_font = reg(28)
sub_lines = wrap(
    "Deterministic, offline checks that score your repo 0–100 "
    "for how ready it is for AI coding agents.",
    sub_font,
    LEFT_W,
)
sy = hy + 14
for line in sub_lines:
    draw.text((PAD, sy), line, font=sub_font, fill=MUTED)
    sy += 40

# Mini terminal card (right column, vertically centered) — sample run + score
tw, th = 440, 290
tx, ty = W - PAD - tw, (H - th) // 2 + 20
draw.rounded_rectangle([tx, ty, tx + tw, ty + th], radius=16, fill=PANEL_2, outline=BORDER, width=2)
# title bar dots
for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
    draw.ellipse([tx + 22 + i * 22, ty + 20, tx + 22 + i * 22 + 12, ty + 32], fill=c)
draw.line([(tx, ty + 52), (tx + tw, ty + 52)], fill=BORDER, width=2)

mf = mono(20)
mbf = mono_b(20)
line_y = ty + 70
draw.text((tx + 24, line_y), "$ harness-doctor", font=mf, fill=ACCENT)
line_y += 36
draw.text((tx + 24, line_y), "✔ AGENTS.md found", font=mf, fill=ACCENT)
line_y += 32
draw.text((tx + 24, line_y), "! docs not linked", font=mf, fill=WARN)
line_y += 32
draw.text((tx + 24, line_y), "✘ 3 unused exports", font=mf, fill=ERR)
line_y += 40
draw.text((tx + 24, line_y), "Harness score ", font=mf, fill=MUTED)
sw = draw.textlength("Harness score ", font=mf)
draw.text((tx + 24 + sw, line_y - 4), "82", font=mono_b(28), fill=ACCENT_3)
draw.text((tx + 24 + sw + draw.textlength("82", font=mono_b(28)), line_y), "/100", font=mf, fill=DIM)

# Bottom-left badges
by = H - 70
bx = PAD
for label in ["Offline", "Deterministic", "Framework-agnostic"]:
    bw = draw.textlength(label, font=reg(22)) + 40
    draw.rounded_rectangle([bx, by, bx + bw, by + 40], radius=20, outline=BORDER, width=2, fill=PANEL)
    draw.text((bx + 20, by + 7), label, font=reg(22), fill=MUTED)
    bx += bw + 16

img.save(OUT, "PNG")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
