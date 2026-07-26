#!/usr/bin/env python3
"""Generate the branded WRC Hopper information slide PDFs.

The source photos are re-encoded before use so no EXIF metadata is published.
Final PDFs are written to output/pdf and mirrored into public/information for
the web, offline, standalone, and Electron builds.
"""

from __future__ import annotations

import json
import math
import shutil
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable, Iterable, Sequence

from PIL import Image, ImageOps

try:
    from reportlab.lib.colors import Color, HexColor, white
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas
except ModuleNotFoundError:
    from minipdf import Color, HexColor, ImageReader, canvas, stringWidth, white


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
FINAL_DIR = WORKSPACE_ROOT / "output" / "pdf"
PUBLIC_DIR = PROJECT_ROOT / "public" / "information"
TEMP_DIR = WORKSPACE_ROOT / "tmp" / "pdfs" / "information-assets"

SOURCE_UNDERSIDE = WORKSPACE_ROOT / "drone_photos" / "IMG_4476.jpeg"
SOURCE_TOP = WORKSPACE_ROOT / "drone_photos" / "IMG_4479.jpeg"
LOGO_FULL = PROJECT_ROOT / "logos" / "wrc_logo.png"
LOGO_EMBLEM = PROJECT_ROOT / "logos" / "WRC_logo_small.png"
OBJECT_IMAGES = {
    "airplane": PROJECT_ROOT / "public" / "sim-assets" / "airplane.png",
    "apple": PROJECT_ROOT / "public" / "sim-assets" / "apple.png",
    "banana": PROJECT_ROOT / "public" / "sim-assets" / "banana.png",
    "car": PROJECT_ROOT / "public" / "sim-assets" / "car.png",
}
APRILTAG_FAMILY = PROJECT_ROOT / "node_modules" / "apriltag" / "families" / "36h11.json"

W, H = 960.0, 540.0
NAVY = HexColor("#001B3A")
INK = HexColor("#0C284A")
TEAL = HexColor("#17ADB4")
TEAL_DARK = HexColor("#007986")
GOLD = HexColor("#C9A227")
CORAL = HexColor("#C83E4D")
PAPER = HexColor("#EFF3F4")
PANEL = white
MUTED = HexColor("#526779")
LINE = HexColor("#C9D6DB")
LIGHT_TEAL = HexColor("#DDF3F2")
LIGHT_GOLD = HexColor("#F6F0D9")
LIGHT_CORAL = HexColor("#F8E5E8")
CODE_BG = HexColor("#061F3E")
CODE_TEXT = HexColor("#E8F1F4")

PHOTO_UNDERSIDE = TEMP_DIR / "hopper-underside-sanitized.jpg"
PHOTO_TOP = TEMP_DIR / "hopper-top-sanitized.jpg"


@dataclass(frozen=True)
class Deck:
    filename: str
    title: str
    short_title: str
    renderers: Sequence[Callable[[canvas.Canvas, "PageContext"], None]]


@dataclass(frozen=True)
class PageContext:
    deck: Deck
    number: int
    total: int


def sanitize_photo(source: Path, destination: Path, max_edge: int = 1800) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        image.save(
            destination,
            "JPEG",
            quality=88,
            optimize=True,
            progressive=True,
            exif=b"",
        )


def prepare_assets() -> None:
    sanitize_photo(SOURCE_UNDERSIDE, PHOTO_UNDERSIDE)
    sanitize_photo(SOURCE_TOP, PHOTO_TOP)


def set_fill(c: canvas.Canvas, color: Color) -> None:
    c.setFillColor(color)


def set_stroke(c: canvas.Canvas, color: Color, width: float = 1.0) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(width)


def rounded_panel(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    fill: Color = PANEL,
    stroke: Color | None = LINE,
    radius: float = 14,
    stroke_width: float = 1,
) -> None:
    set_fill(c, fill)
    if stroke is None:
        c.setStrokeColor(fill)
        c.roundRect(x, y, width, height, radius, fill=1, stroke=0)
    else:
        set_stroke(c, stroke, stroke_width)
        c.roundRect(x, y, width, height, radius, fill=1, stroke=1)


def draw_image_cover(
    c: canvas.Canvas,
    image_path: Path,
    x: float,
    y: float,
    width: float,
    height: float,
    radius: float = 0,
    anchor_x: float = 0.5,
    anchor_y: float = 0.5,
) -> None:
    reader = ImageReader(str(image_path))
    source_width, source_height = reader.getSize()
    scale = max(width / source_width, height / source_height)
    draw_width = source_width * scale
    draw_height = source_height * scale
    draw_x = x - (draw_width - width) * anchor_x
    draw_y = y - (draw_height - height) * anchor_y
    c.saveState()
    path = c.beginPath()
    if radius:
        path.roundRect(x, y, width, height, radius)
    else:
        path.rect(x, y, width, height)
    c.clipPath(path, stroke=0, fill=0)
    c.drawImage(
        reader,
        draw_x,
        draw_y,
        width=draw_width,
        height=draw_height,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.restoreState()


def draw_image_contain(
    c: canvas.Canvas,
    image_path: Path,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    reader = ImageReader(str(image_path))
    source_width, source_height = reader.getSize()
    scale = min(width / source_width, height / source_height)
    draw_width = source_width * scale
    draw_height = source_height * scale
    c.drawImage(
        reader,
        x + (width - draw_width) / 2,
        y + (height - draw_height) / 2,
        width=draw_width,
        height=draw_height,
        preserveAspectRatio=True,
        mask="auto",
    )


def fit_font(
    text: str,
    font: str,
    maximum_size: float,
    maximum_width: float,
    minimum_size: float = 8,
) -> float:
    size = maximum_size
    while size > minimum_size and stringWidth(text, font, size) > maximum_width:
        size -= 0.5
    return size


def draw_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    size: float,
    color: Color = INK,
    font: str = "Helvetica",
    align: str = "left",
) -> None:
    c.setFont(font, size)
    set_fill(c, color)
    if align == "right":
        c.drawRightString(x, y, text)
    elif align == "center":
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)


def wrap_lines(text: str, font: str, size: float, maximum_width: float) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for word in paragraph.split():
            candidate = word if not current else f"{current} {word}"
            if stringWidth(candidate, font, size) <= maximum_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    top_y: float,
    maximum_width: float,
    size: float = 15,
    leading: float | None = None,
    color: Color = INK,
    font: str = "Helvetica",
    maximum_lines: int | None = None,
) -> float:
    line_height = leading or size * 1.28
    lines = wrap_lines(text, font, size, maximum_width)
    if maximum_lines is not None:
        lines = lines[:maximum_lines]
    y = top_y
    for line in lines:
        draw_text(c, line, x, y, size, color, font)
        y -= line_height
    return y


def draw_bullets(
    c: canvas.Canvas,
    items: Iterable[str],
    x: float,
    top_y: float,
    maximum_width: float,
    size: float = 13,
    gap: float = 8,
    bullet_color: Color = TEAL,
    text_color: Color = INK,
) -> float:
    y = top_y
    for item in items:
        lines = wrap_lines(item, "Helvetica", size, maximum_width - 20)
        set_fill(c, bullet_color)
        c.roundRect(x, y - size + 3, 7, 7, 2, fill=1, stroke=0)
        for line_index, line in enumerate(lines):
            draw_text(
                c,
                line,
                x + 18,
                y - line_index * size * 1.3,
                size,
                text_color,
            )
        y -= max(1, len(lines)) * size * 1.3 + gap
    return y


def draw_pill(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    fill: Color = LIGHT_TEAL,
    color: Color = TEAL_DARK,
    height: float = 24,
    padding: float = 12,
    size: float = 9,
) -> float:
    font = "Helvetica-Bold"
    width = stringWidth(text, font, size) + padding * 2
    rounded_panel(c, x, y, width, height, fill, None, height / 2)
    draw_text(c, text, x + width / 2, y + (height - size) / 2 + 1, size, color, font, "center")
    return width


def draw_arrow(
    c: canvas.Canvas,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    color: Color = TEAL,
    width: float = 4,
    head: float = 10,
    label: str | None = None,
    label_offset: tuple[float, float] = (0, 8),
) -> None:
    angle = math.atan2(y2 - y1, x2 - x1)
    set_stroke(c, color, width)
    c.line(x1, y1, x2, y2)
    c.line(
        x2,
        y2,
        x2 - head * math.cos(angle - math.pi / 6),
        y2 - head * math.sin(angle - math.pi / 6),
    )
    c.line(
        x2,
        y2,
        x2 - head * math.cos(angle + math.pi / 6),
        y2 - head * math.sin(angle + math.pi / 6),
    )
    if label:
        draw_text(
            c,
            label,
            (x1 + x2) / 2 + label_offset[0],
            (y1 + y2) / 2 + label_offset[1],
            10,
            color,
            "Helvetica-Bold",
            "center",
        )


def draw_callout(
    c: canvas.Canvas,
    anchor_x: float,
    anchor_y: float,
    text_x: float,
    text_y: float,
    title: str,
    note: str = "",
    align: str = "left",
) -> None:
    endpoint_x = text_x - 8 if align == "left" else text_x + 8
    draw_arrow(c, anchor_x, anchor_y, endpoint_x, text_y + 3, TEAL, 1.7, 6)
    set_fill(c, TEAL)
    c.circle(anchor_x, anchor_y, 4, fill=1, stroke=0)
    draw_text(c, title, text_x, text_y, 11, INK, "Helvetica-Bold", align)
    if note:
        draw_text(c, note, text_x, text_y - 14, 8.5, MUTED, "Helvetica", align)


def page_chrome(c: canvas.Canvas, context: PageContext, title: str, kicker: str = "") -> None:
    set_fill(c, PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    set_fill(c, NAVY)
    c.rect(0, H - 7, W, 7, fill=1, stroke=0)
    draw_text(
        c,
        f"{context.deck.short_title.upper()}  /  {context.number:02d}",
        46,
        H - 38,
        9,
        TEAL_DARK,
        "Helvetica-Bold",
    )
    if kicker:
        draw_text(c, kicker.upper(), 46, H - 56, 8, GOLD, "Helvetica-Bold")
    title_size = fit_font(title, "Helvetica-Bold", 27, 700, 20)
    draw_text(c, title, 46, H - 86, title_size, INK, "Helvetica-Bold")
    rounded_panel(c, W - 82, H - 64, 36, 42, white, LINE, 8)
    draw_image_contain(c, LOGO_EMBLEM, W - 76, H - 60, 24, 34)
    set_stroke(c, LINE, 1)
    c.line(46, 31, W - 46, 31)
    draw_text(c, "WRC | HOPPER FLIGHT + VISION INFORMATION SERIES", 46, 15, 7.5, MUTED, "Helvetica-Bold")
    draw_text(c, f"{context.number} / {context.total}", W - 46, 15, 8, MUTED, "Helvetica-Bold", "right")


def cover_page(
    c: canvas.Canvas,
    context: PageContext,
    title: str,
    subtitle: str,
    photo: Path,
    topic: str,
    chips: Sequence[str] = (),
    photo_anchor: tuple[float, float] = (0.5, 0.5),
) -> None:
    set_fill(c, NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    draw_image_cover(
        c,
        photo,
        526,
        0,
        W - 526,
        H,
        0,
        photo_anchor[0],
        photo_anchor[1],
    )
    set_fill(c, Color(0, 0.105, 0.227, alpha=0.30))
    c.rect(526, 0, W - 526, H, fill=1, stroke=0)
    set_fill(c, TEAL)
    c.rect(0, H - 8, W, 8, fill=1, stroke=0)
    rounded_panel(c, 46, H - 155, 286, 108, white, None, 14)
    draw_image_contain(c, LOGO_FULL, 64, H - 145, 250, 88)
    draw_text(c, "HOPPER INFORMATION SERIES", 48, 337, 10, TEAL, "Helvetica-Bold")
    draw_text(c, topic.upper(), 48, 315, 9, GOLD, "Helvetica-Bold")
    title_size = fit_font(title, "Helvetica-Bold", 43, 430, 29)
    title_lines = wrap_lines(title, "Helvetica-Bold", title_size, 430)
    y = 267
    for line in title_lines:
        draw_text(c, line, 48, y, title_size, white, "Helvetica-Bold")
        y -= title_size * 1.05
    y -= 10
    y = draw_wrapped(c, subtitle, 48, y, 410, 16, 21, HexColor("#D4E2E8"), "Helvetica")
    chip_x = 48
    for chip in chips:
        chip_width = draw_pill(c, chip.upper(), chip_x, max(46, y - 12), LIGHT_TEAL, TEAL_DARK)
        chip_x += chip_width + 8
    draw_text(c, f"DECK {context.number:02d}  |  {context.total} SLIDES", 48, 20, 8, HexColor("#9CB1BF"), "Helvetica-Bold")
    rounded_panel(c, W - 82, 18, 36, 42, white, None, 8)
    draw_image_contain(c, LOGO_EMBLEM, W - 76, 22, 24, 34)


def draw_card(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    title: str,
    body: str | Sequence[str],
    accent: Color = TEAL,
    fill: Color = PANEL,
    title_size: float = 13,
    body_size: float = 10.5,
    icon: str | None = None,
) -> None:
    rounded_panel(c, x, y, width, height, fill, LINE, 13)
    set_fill(c, accent)
    c.roundRect(x, y, 6, height, 3, fill=1, stroke=0)
    title_x = x + 18
    if icon:
        set_fill(c, accent)
        c.circle(x + 27, y + height - 27, 15, fill=1, stroke=0)
        draw_text(c, icon, x + 27, y + height - 31, 12, white, "Helvetica-Bold", "center")
        title_x = x + 49
    draw_text(c, title, title_x, y + height - 28, title_size, INK, "Helvetica-Bold")
    if isinstance(body, str):
        draw_wrapped(c, body, x + 18, y + height - 50, width - 34, body_size, body_size * 1.3, MUTED)
    else:
        draw_bullets(c, body, x + 18, y + height - 52, width - 34, body_size, 4, accent, MUTED)


def draw_process(
    c: canvas.Canvas,
    steps: Sequence[tuple[str, str]],
    x: float,
    y: float,
    total_width: float,
    box_height: float,
    accent: Color = TEAL,
) -> None:
    gap = 24
    box_width = (total_width - gap * (len(steps) - 1)) / len(steps)
    for index, (title, note) in enumerate(steps):
        box_x = x + index * (box_width + gap)
        rounded_panel(c, box_x, y, box_width, box_height, white, LINE, 12)
        set_fill(c, accent)
        c.circle(box_x + 25, y + box_height - 25, 13, fill=1, stroke=0)
        draw_text(c, str(index + 1), box_x + 25, y + box_height - 29, 10, white, "Helvetica-Bold", "center")
        draw_text(c, title, box_x + 47, y + box_height - 29, 11, INK, "Helvetica-Bold")
        draw_wrapped(c, note, box_x + 15, y + box_height - 52, box_width - 30, 9.5, 12, MUTED)
        if index < len(steps) - 1:
            draw_arrow(
                c,
                box_x + box_width + 4,
                y + box_height / 2,
                box_x + box_width + gap - 4,
                y + box_height / 2,
                accent,
                2,
                7,
            )


def draw_drone_top(
    c: canvas.Canvas,
    cx: float,
    cy: float,
    scale: float = 1.0,
    thrusts: Sequence[float] | None = None,
    body_angle: float = 0,
    show_spin: bool = False,
) -> None:
    thrust_values = thrusts or (1, 1, 1, 1)
    positions = [(-82, 64), (82, 64), (82, -64), (-82, -64)]
    c.saveState()
    c.translate(cx, cy)
    c.rotate(body_angle)
    set_stroke(c, INK, 9 * scale)
    for px, py in positions:
        c.line(0, 0, px * scale, py * scale)
    set_fill(c, NAVY)
    c.roundRect(-33 * scale, -47 * scale, 66 * scale, 94 * scale, 15 * scale, fill=1, stroke=0)
    set_fill(c, TEAL)
    c.wedge(-15 * scale, 22 * scale, 15 * scale, 50 * scale, 25, 130, fill=1, stroke=0)
    for index, (px, py) in enumerate(positions):
        x = px * scale
        y = py * scale
        set_fill(c, HexColor("#D6E2E5"))
        c.circle(x, y, 28 * scale, fill=1, stroke=0)
        set_fill(c, INK)
        c.circle(x, y, 12 * scale, fill=1, stroke=0)
        set_stroke(c, INK, 4 * scale)
        c.line(x - 24 * scale, y, x + 24 * scale, y)
        value = thrust_values[index]
        if value > 0:
            draw_arrow(
                c,
                x,
                y + 28 * scale,
                x,
                y + (28 + 42 * value) * scale,
                TEAL if value <= 1.15 else GOLD,
                max(2, 3 * scale),
                8 * scale,
            )
        if show_spin:
            set_stroke(c, TEAL_DARK if index % 2 == 0 else GOLD, 2)
            c.arc(
                x - 36 * scale,
                y - 36 * scale,
                x + 36 * scale,
                y + 36 * scale,
                30 if index % 2 == 0 else 210,
                210,
            )
    c.restoreState()


def draw_camera_frame(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    paper: bool = False,
    object_box: bool = False,
    tag: bool = False,
) -> None:
    rounded_panel(c, x, y, width, height, CODE_BG, HexColor("#2C4863"), 10)
    set_fill(c, HexColor("#293947"))
    c.rect(x + 10, y + 10, width - 20, height - 20, fill=1, stroke=0)
    if paper:
        set_fill(c, HexColor("#F8F7F1"))
        c.saveState()
        c.translate(x + width * 0.58, y + height * 0.45)
        c.rotate(-8)
        c.rect(-width * 0.17, -height * 0.18, width * 0.34, height * 0.36, fill=1, stroke=0)
        c.restoreState()
    if object_box:
        set_stroke(c, TEAL, 3)
        c.rect(x + width * 0.42, y + height * 0.27, width * 0.34, height * 0.46, fill=0, stroke=1)
        rounded_panel(c, x + width * 0.42, y + height * 0.73, 94, 19, TEAL, None, 4)
        draw_text(c, "apple 92%", x + width * 0.42 + 7, y + height * 0.73 + 5, 8, white, "Helvetica-Bold")
    if tag:
        draw_apriltag(c, 0, x + width * 0.51, y + height * 0.32, min(width, height) * 0.34)
        set_stroke(c, CORAL, 3)
        c.rect(x + width * 0.39, y + height * 0.20, width * 0.29, height * 0.50, fill=0, stroke=1)
    set_stroke(c, HexColor("#B9D7DB"), 1)
    c.line(x + width / 2 - 10, y + height / 2, x + width / 2 + 10, y + height / 2)
    c.line(x + width / 2, y + height / 2 - 10, x + width / 2, y + height / 2 + 10)


def rotate_matrix_for_apriltag(matrix: list[list[str]]) -> list[list[str]]:
    size = len(matrix)
    # Mirrors apriltag's in-place rotate90 helper (a counter-clockwise turn).
    return [[matrix[x][size - 1 - y] for x in range(size)] for y in range(size)]


def apriltag_pixels(tag_id: int) -> list[list[str]]:
    family = json.loads(APRILTAG_FAMILY.read_text())
    size = int(family["size"])
    layout = list(family["layout"])
    codes = family["codes"]
    safe_id = max(0, min(len(codes) - 1, int(tag_id)))
    # Match the JavaScript package exactly: JSON code values are parsed through
    # IEEE-754 Number before AprilTagFamily converts them to BigInt.
    code = int(float(codes[safe_id]))
    bits_minus_one = sum(1 for char in layout if char == "d") - 1
    image: list[list[str]] = [["w" for _ in range(size)] for _ in range(size)]

    def pixel(layout_char: str) -> str:
        if layout_char != "d":
            return layout_char
        return "w" if code & (1 << bits_minus_one) else "b"

    for _ in range(4):
        image = rotate_matrix_for_apriltag(image)
        for y in range(size // 2 + 1):
            for x in range(y, size - 1 - y):
                layout_char = layout[y * size + x]
                image[y][x] = pixel(layout_char)
                if layout_char == "d":
                    code <<= 1
    if size % 2 == 1:
        middle = size // 2
        image[middle][middle] = pixel(layout[middle * size + middle])
    return rotate_matrix_for_apriltag(image)


APRILTAG_CACHE: dict[int, list[list[str]]] = {}


def draw_apriltag(
    c: canvas.Canvas,
    tag_id: int,
    x: float,
    y: float,
    size: float,
    show_id: bool = False,
) -> None:
    pixels = APRILTAG_CACHE.setdefault(tag_id, apriltag_pixels(tag_id))
    outer = len(pixels) + 2
    cell = size / outer
    set_fill(c, white)
    c.rect(x, y, size, size, fill=1, stroke=0)
    set_fill(c, HexColor("#050505"))
    for row_index, row in enumerate(pixels):
        for column_index, value in enumerate(row):
            if value == "b":
                c.rect(
                    x + (column_index + 1) * cell,
                    y + (outer - 2 - row_index) * cell,
                    cell + 0.1,
                    cell + 0.1,
                    fill=1,
                    stroke=0,
                )
    if show_id:
        draw_text(c, f"tag36h11 ID {tag_id}", x + size / 2, y - 15, 9, MUTED, "Helvetica-Bold", "center")


def draw_code_window(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    lines: Sequence[Sequence[tuple[str, Color]] | str],
    title: str = "HOPPER PROGRAM.JS",
    font_size: float = 10.5,
) -> None:
    rounded_panel(c, x, y, width, height, CODE_BG, HexColor("#183A57"), 12)
    set_fill(c, HexColor("#0D2A48"))
    c.roundRect(x, y + height - 32, width, 32, 12, fill=1, stroke=0)
    c.rect(x, y + height - 32, width, 16, fill=1, stroke=0)
    for index, color in enumerate((CORAL, GOLD, TEAL)):
        set_fill(c, color)
        c.circle(x + 18 + index * 15, y + height - 16, 4, fill=1, stroke=0)
    draw_text(c, title, x + 70, y + height - 20, 8, HexColor("#A9C2D0"), "Helvetica-Bold")
    line_y = y + height - 53
    line_height = font_size * 1.55
    for line_number, line in enumerate(lines, 1):
        draw_text(c, str(line_number), x + 18, line_y, font_size - 2, HexColor("#617D90"), "Courier", "right")
        cursor_x = x + 34
        segments = [(line, CODE_TEXT)] if isinstance(line, str) else line
        for segment, color in segments:
            draw_text(c, segment, cursor_x, line_y, font_size, color, "Courier")
            cursor_x += stringWidth(segment, "Courier", font_size)
        line_y -= line_height


def draw_block(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    text: str,
    color: Color,
    height: float = 38,
    input_labels: Sequence[str] = (),
) -> None:
    set_fill(c, color)
    c.roundRect(x, y, width, height, 8, fill=1, stroke=0)
    c.circle(x + 18, y + height, 7, fill=1, stroke=0)
    set_fill(c, PAPER)
    c.circle(x + width - 24, y, 7, fill=1, stroke=0)
    title_size = fit_font(text, "Helvetica-Bold", 10.5, width - 28, 7.5)
    draw_text(c, text, x + 14, y + height / 2 - 4, title_size, white, "Helvetica-Bold")
    if input_labels:
        pill_x = x + width - 12
        for label in reversed(input_labels):
            label_width = stringWidth(label, "Helvetica-Bold", 8) + 13
            pill_x -= label_width
            rounded_panel(c, pill_x, y + 8, label_width, 21, Color(1, 1, 1, alpha=0.20), None, 7)
            draw_text(c, label, pill_x + label_width / 2, y + 14, 8, white, "Helvetica-Bold", "center")
            pill_x -= 5


def draw_sources(
    c: canvas.Canvas,
    sources: Sequence[tuple[str, str]],
    x: float,
    top_y: float,
    width: float,
) -> None:
    draw_text(c, "SOURCES AND FURTHER READING", x, top_y, 9, GOLD, "Helvetica-Bold")
    y = top_y - 20
    for label, url in sources:
        draw_text(c, label, x, y, 9.5, INK, "Helvetica-Bold")
        y = draw_wrapped(c, url, x, y - 14, width, 8.5, 11, MUTED, "Helvetica")
        y -= 8


def sensor_deck() -> Deck:
    title = "Hopper sensor suite"
    short = "Sensor suite"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        cover_page(
            c,
            context,
            title,
            "How an indoor quadrotor estimates motion and stays stable - without GPS.",
            PHOTO_UNDERSIDE,
            "01 / Hardware and sensing",
            ("NO GPS", "INDOOR ONLY", "SENSOR FUSION"),
            (0.52, 0.55),
        )

    def aircraft(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "See the aircraft before the data", "External hardware")
        draw_image_cover(c, PHOTO_TOP, 46, 64, 410, 390, 16, 0.5, 0.51)
        draw_image_cover(c, PHOTO_UNDERSIDE, 482, 64, 432, 390, 16, 0.5, 0.51)
        rounded_panel(c, 64, 386, 121, 24, NAVY, None, 8)
        draw_text(c, "TOP VIEW", 124.5, 394, 9, white, "Helvetica-Bold", "center")
        rounded_panel(c, 500, 386, 142, 24, NAVY, None, 8)
        draw_text(c, "UNDERSIDE VIEW", 571, 394, 9, white, "Helvetica-Bold", "center")
        draw_callout(c, 146, 286, 70, 330, "Propeller guards", "Contact protection")
        draw_callout(c, 334, 258, 395, 331, "Motor + propeller", "One of four rotor stations", "right")
        draw_callout(c, 250, 226, 68, 159, "Body + battery", "Mass near the center")
        draw_callout(c, 696, 261, 837, 338, "2 MP camera", "Articulated; shown downward", "right")
        draw_callout(c, 693, 195, 837, 158, "Downward sensing area", "Do not assign chips from this photo", "right")
        draw_callout(c, 537, 288, 508, 338, "Airframe arms", "Carry motor thrust")

    def measures(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "What Hopper measures onboard", "Hardware overview")
        cards = [
            ("IMU", "3-axis accelerometer + 3-axis gyroscope: motion, tilt and angular rate.", "A"),
            ("Magnetometer", "A 3-axis digital compass used by the onboard system for heading cues.", "M"),
            ("Pressure altimeter", "Air-pressure changes provide a relative altitude trend to the controller.", "P"),
            ("Flow sensor", "Tracks apparent floor motion to help stabilize movement over textured surfaces.", "F"),
            ("Time-of-flight", "A short-range downward distance cue to the floor; performance depends on the surface.", "T"),
            ("Camera", "2 MP articulated camera: 45 deg forward-facing or 90 deg downward-facing.", "C"),
            ("Color + IR array", "24-bit color and infrared sensing provide optical/environment cues.", "I"),
            ("Temperature", "Ambient or onboard diagnostic temperature sensing - not a thermal camera.", "D"),
        ]
        for index, (card_title, body, icon) in enumerate(cards):
            column = index % 4
            row = index // 4
            draw_card(
                c,
                46 + column * 219,
                246 - row * 170,
                201,
                148,
                card_title,
                body,
                (TEAL, GOLD, TEAL_DARK, CORAL)[column],
                white,
                12.5,
                10,
                icon,
            )
        draw_text(
            c,
            "Onboard sensor does not mean student-readable variable. Hopper Studio exposes only a subset.",
            480,
            52,
            10,
            CORAL,
            "Helvetica-Bold",
            "center",
        )

    def fusion(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Sensor fusion closes the control loop", "From measurement to motor")
        draw_process(
            c,
            [
                ("Mission", "Blocks or JavaScript request a motion."),
                ("Controller", "Target thrust and attitude are calculated."),
                ("Motors", "Four rotor speeds create force and torque."),
                ("Aircraft", "The body moves through the room."),
            ],
            46,
            298,
            868,
            112,
            TEAL,
        )
        rounded_panel(c, 136, 89, 688, 139, LIGHT_TEAL, HexColor("#ABD7D5"), 18)
        draw_text(c, "ONBOARD FEEDBACK", 480, 196, 10, TEAL_DARK, "Helvetica-Bold", "center")
        sensor_items = [
            ("IMU", 210),
            ("FLOW", 335),
            ("TOF", 455),
            ("PRESSURE", 575),
            ("MAG", 705),
        ]
        for label, item_x in sensor_items:
            set_fill(c, white)
            c.circle(item_x, 144, 35, fill=1, stroke=0)
            draw_text(c, label, item_x, 140, 9, INK, "Helvetica-Bold", "center")
            draw_arrow(c, item_x, 179, 430 + (item_x - 455) * 0.18, 295, TEAL_DARK, 2, 7)
        draw_arrow(c, 824, 154, 878, 154, GOLD, 3, 9, "ESTIMATE")
        draw_text(c, "Fast feedback is handled onboard; mission code sends higher-level commands.", 480, 55, 11, MUTED, "Helvetica-Bold", "center")

    def no_gps(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "No GPS is a design constraint", "Indoor navigation")
        rounded_panel(c, 46, 82, 286, 348, NAVY, None, 22)
        draw_text(c, "NO", 189, 317, 72, white, "Helvetica-Bold", "center")
        draw_text(c, "GPS", 189, 240, 78, TEAL, "Helvetica-Bold", "center")
        draw_text(c, "No latitude / longitude", 189, 177, 14, HexColor("#D6E5EA"), "Helvetica-Bold", "center")
        draw_text(c, "No global waypoint position", 189, 151, 12, HexColor("#AFC3CD"), "Helvetica", "center")
        draw_text(c, "Indoor use only", 189, 117, 13, GOLD, "Helvetica-Bold", "center")
        draw_card(
            c,
            360,
            272,
            262,
            158,
            "What it can do",
            [
                "Stabilize attitude with onboard feedback.",
                "Estimate local motion relative to the floor.",
                "Use camera targets, objects, paper or AprilTags.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            650,
            272,
            264,
            158,
            "What student code cannot read",
            [
                "No x/y room position or GPS coordinates.",
                "No real altitude, velocity or attitude value.",
                "No raw IMU, range or heading telemetry.",
            ],
            CORAL,
            white,
            14,
            10.5,
        )
        rounded_panel(c, 360, 82, 554, 158, LIGHT_GOLD, HexColor("#E3D9A9"), 16)
        draw_text(c, "DESIGN MISSIONS AROUND RELATIVE CUES", 637, 205, 11, GOLD, "Helvetica-Bold", "center")
        draw_bullets(
            c,
            [
                "Time + power commands: fly forward for 1 second at 15%.",
                "Visual events: detect a white sheet, object label or tag ID.",
                "Conservative repeat-and-check logic instead of assumed position.",
            ],
            388,
            174,
            500,
            11,
            5,
            GOLD,
            INK,
        )

    def camera_comms(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Camera and communication are separate paths", "Hopper Studio")
        draw_image_cover(c, PHOTO_UNDERSIDE, 46, 91, 372, 336, 18, 0.52, 0.55)
        draw_callout(c, 272, 286, 387, 391, "Articulated camera", "Shown in downward position", "right")
        draw_card(
            c,
            454,
            288,
            212,
            139,
            "BLUETOOTH",
            "Flight commands and the limited telemetry exposed to the app: battery and coarse flight state.",
            TEAL,
            white,
            14,
            10.5,
            "B",
        )
        draw_card(
            c,
            696,
            288,
            218,
            139,
            "WI-FI / HTTP",
            "Camera video at 192.168.2.1. Computer vision needs readable image pixels.",
            GOLD,
            white,
            14,
            10.5,
            "W",
        )
        draw_process(
            c,
            [
                ("Camera", "45 deg forward or 90 deg downward."),
                ("Local app", "Desktop/local proxy reads pixels reliably."),
                ("Vision", "Threshold, COCO, AprilTag or custom model."),
            ],
            454,
            91,
            460,
            143,
            TEAL_DARK,
        )
        draw_text(c, "A green Bluetooth link does not guarantee a readable camera feed.", 684, 59, 10, CORAL, "Helvetica-Bold", "center")

    def preflight(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Preflight for reliable sensing", "Classroom checklist")
        draw_card(
            c,
            46,
            247,
            412,
            184,
            "ROOM + SURFACE",
            [
                "Fly indoors in a well-lit room.",
                "Prefer gym or hardwood flooring with visible texture.",
                "Avoid strong vents, reflective concrete and difficult blue carpet.",
                "Take off from the floor, not from a hand or table.",
            ],
            TEAL,
            white,
            15,
            11,
        )
        draw_card(
            c,
            480,
            247,
            434,
            184,
            "APP + MISSION",
            [
                "Check Bluetooth and Wi-Fi indicators independently.",
                "Test the exact target under classroom lighting.",
                "Use repeated observations before a flight decision.",
                "Keep three feet above obstacles and preserve a landing route.",
            ],
            GOLD,
            white,
            15,
            11,
        )
        draw_sources(
            c,
            [
                ("FTW Robotics - Hopper hardware and ideal flight conditions", "https://ftw-robotics.ai/hopper"),
                ("Hopper Studio - local implementation and classroom operating notes", "README.md in the Hopper Studio project"),
            ],
            46,
            210,
            868,
        )
        draw_text(c, "Core rule: no GPS, indoor operation, relative cues, conservative decisions.", 480, 57, 13, NAVY, "Helvetica-Bold", "center")

    renderers = (cover, aircraft, measures, fusion, no_gps, camera_comms, preflight)
    return Deck("01-hopper-sensor-suite.pdf", title, short, renderers)


def aerodynamics_deck() -> Deck:
    title = "How a quadrotor moves"
    short = "Quadrotor aerodynamics"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        cover_page(
            c,
            context,
            title,
            "From four rotor thrusts to vertical, linear and angular motion.",
            PHOTO_TOP,
            "02 / Forces and motion",
            ("THRUST", "PITCH + ROLL + YAW", "SIMPLE MODEL"),
            (0.5, 0.51),
        )

    def thrust(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Four rotors create one total thrust vector", "Hover")
        draw_drone_top(c, 285, 250, 1.12, (1, 1, 1, 1))
        draw_arrow(c, 285, 280, 285, 414, TEAL, 8, 16, "TOTAL THRUST T", (0, 12))
        draw_arrow(c, 285, 190, 285, 73, CORAL, 8, 16, "WEIGHT m g", (0, -18))
        draw_card(
            c,
            510,
            276,
            404,
            150,
            "HOVER",
            [
                "All four motors contribute upward thrust.",
                "When total thrust equals weight, vertical acceleration is zero.",
                "The flight controller continually corrects small disturbances.",
            ],
            TEAL,
            white,
            15,
            11.5,
        )
        rounded_panel(c, 510, 91, 404, 153, NAVY, None, 16)
        draw_text(c, "T = T1 + T2 + T3 + T4", 712, 188, 23, white, "Courier-Bold", "center")
        draw_text(c, "hover:  T = m g", 712, 146, 18, TEAL, "Courier-Bold", "center")
        draw_text(c, "up: T > m g     down: T < m g", 712, 112, 12, HexColor("#CEDDE3"), "Courier", "center")

    def translate(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Translation comes from tilting the thrust vector", "Pitch and roll")
        rounded_panel(c, 46, 85, 410, 345, white, LINE, 18)
        draw_text(c, "SIDE VIEW: PITCH FORWARD", 251, 395, 11, TEAL_DARK, "Helvetica-Bold", "center")
        c.saveState()
        c.translate(236, 238)
        c.rotate(-14)
        set_fill(c, NAVY)
        c.roundRect(-75, -15, 150, 30, 12, fill=1, stroke=0)
        set_fill(c, INK)
        c.circle(-66, 0, 20, fill=1, stroke=0)
        c.circle(66, 0, 20, fill=1, stroke=0)
        c.restoreState()
        draw_arrow(c, 236, 246, 275, 383, TEAL, 7, 14, "T", (15, 5))
        draw_arrow(c, 236, 246, 236, 374, HexColor("#78BFC2"), 2, 8, "vertical", (-36, 0))
        draw_arrow(c, 236, 246, 342, 216, GOLD, 3, 9, "forward", (0, -16))
        draw_arrow(c, 236, 216, 236, 113, CORAL, 5, 12, "m g", (26, -5))
        draw_text(c, "The horizontal part of thrust accelerates the aircraft.", 251, 104, 10.5, MUTED, "Helvetica-Bold", "center")
        draw_card(
            c,
            482,
            302,
            432,
            128,
            "PITCH",
            "Tilt nose forward/backward. Total thrust gains a forward/backward component.",
            TEAL,
            white,
            15,
            11.5,
        )
        draw_card(
            c,
            482,
            174,
            432,
            106,
            "ROLL",
            "Tilt left/right. Total thrust gains a sideways component.",
            GOLD,
            white,
            15,
            11.5,
        )
        draw_card(
            c,
            482,
            85,
            432,
            67,
            "UP / DOWN",
            "Change total thrust while keeping the body nearly level.",
            CORAL,
            white,
            13,
            10.5,
        )

    def angular(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Angular motion comes from unequal rotor forces", "Differential thrust")
        draw_card(c, 46, 258, 272, 172, "PITCH TORQUE", "More thrust on one fore/aft side rotates the body about its left-right axis.", TEAL, white, 14, 10.5)
        draw_drone_top(c, 182, 305, 0.48, (0.65, 0.65, 1.35, 1.35))
        draw_card(c, 344, 258, 272, 172, "ROLL TORQUE", "More thrust on one left/right side rotates the body about its front-back axis.", GOLD, white, 14, 10.5)
        draw_drone_top(c, 480, 305, 0.48, (0.65, 1.35, 1.35, 0.65))
        draw_card(c, 642, 258, 272, 172, "YAW TORQUE", "Shift power between counter-rotating rotor pairs; reaction torque turns heading.", CORAL, white, 14, 10.5)
        draw_drone_top(c, 778, 305, 0.48, (1.25, 0.75, 1.25, 0.75), show_spin=True)
        rounded_panel(c, 46, 87, 868, 133, NAVY, None, 18)
        draw_text(c, "ROLL  phi", 177, 169, 17, white, "Helvetica-Bold", "center")
        draw_text(c, "PITCH  theta", 480, 169, 17, white, "Helvetica-Bold", "center")
        draw_text(c, "YAW  psi", 783, 169, 17, white, "Helvetica-Bold", "center")
        draw_arrow(c, 117, 125, 237, 125, TEAL, 4, 11)
        draw_arrow(c, 420, 125, 540, 125, GOLD, 4, 11)
        set_stroke(c, CORAL, 5)
        c.arc(733, 100, 833, 190, 20, 285)
        draw_text(c, "Angular acceleration follows net torque, not simply motor speed.", 480, 55, 10.5, MUTED, "Helvetica-Bold", "center")

    def mixing(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Motor mixing at a glance", "Command to rotor changes")
        headers = ("COMMAND", "ROTOR CHANGE", "RESULT")
        column_x = (46, 272, 660)
        for header, x in zip(headers, column_x):
            draw_text(c, header, x, 420, 10, TEAL_DARK, "Helvetica-Bold")
        rows = [
            ("Up", "All four increase together", "More total thrust"),
            ("Down", "All four decrease together", "Less total thrust"),
            ("Pitch", "Fore/aft pair difference", "Nose tilts"),
            ("Roll", "Left/right pair difference", "Body tilts sideways"),
            ("Yaw", "One spin pair up; opposite pair down", "Heading rotates"),
        ]
        row_y = 358
        accents = (TEAL, TEAL_DARK, GOLD, GOLD, CORAL)
        for index, (command, rotor_change, result) in enumerate(rows):
            rounded_panel(c, 46, row_y, 868, 58, white if index % 2 == 0 else HexColor("#E8EFF1"), None, 9)
            set_fill(c, accents[index])
            c.roundRect(46, row_y, 7, 58, 3, fill=1, stroke=0)
            draw_text(c, command, 72, row_y + 21, 13, INK, "Helvetica-Bold")
            draw_text(c, rotor_change, 272, row_y + 21, 12, MUTED, "Helvetica")
            draw_text(c, result, 660, row_y + 21, 12, INK, "Helvetica-Bold")
            row_y -= 65
        rounded_panel(c, 46, 55, 868, 61, LIGHT_GOLD, HexColor("#DED19B"), 12)
        draw_text(c, "The flight controller performs this mixing continuously; student code requests motion, not raw motor RPM.", 480, 78, 11, INK, "Helvetica-Bold", "center")

    def model(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "A very simple mathematical model", "Near-hover approximation")
        rounded_panel(c, 46, 82, 474, 349, NAVY, None, 20)
        equations = [
            ("Total thrust", "T = T1 + T2 + T3 + T4"),
            ("Vertical", "m z_ddot = T cos(phi) cos(theta) - m g"),
            ("Near hover", "x_ddot ~ g theta     y_ddot ~ -g phi"),
            ("Rotation", "I alpha = tau"),
        ]
        y = 375
        for label, equation in equations:
            draw_text(c, label.upper(), 76, y, 9, TEAL, "Helvetica-Bold")
            draw_text(c, equation, 76, y - 30, 16, white, "Courier-Bold")
            y -= 78
        draw_card(
            c,
            550,
            270,
            364,
            161,
            "WHAT THE SYMBOLS MEAN",
            [
                "m: mass; g: gravitational acceleration.",
                "phi / theta: roll and pitch angles.",
                "I: rotational inertia; tau: net torque.",
                "alpha: angular acceleration.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            550,
            82,
            364,
            165,
            "ASSUMPTIONS",
            [
                "Rigid aircraft; calm indoor air.",
                "Small roll/pitch angles near hover.",
                "Motor and propeller dynamics simplified.",
                "Axis signs depend on the chosen coordinate frame.",
            ],
            GOLD,
            white,
            14,
            10.5,
        )

    def control(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "From code to stabilized motion", "Nested control loops")
        draw_process(
            c,
            [
                ("Student code", 'drone.fly("forward", 1, 15)'),
                ("Motion target", "Forward pitch + enough total thrust."),
                ("Attitude loop", "IMU feedback corrects roll/pitch/yaw."),
                ("Motor mix", "Four power commands update rapidly."),
                ("Aircraft", "Moves, settles, then accepts the next step."),
            ],
            46,
            292,
            868,
            137,
            TEAL,
        )
        draw_code_window(
            c,
            46,
            86,
            416,
            166,
            [
                [(f"await ", GOLD), ("drone.takeOff();", CODE_TEXT)],
                [(f"await ", GOLD), ('drone.fly("forward", 1, 15);', CODE_TEXT)],
                [(f"await ", GOLD), ("drone.hover();", CODE_TEXT)],
                [(f"await ", GOLD), ("drone.land();", CODE_TEXT)],
            ],
        )
        draw_card(
            c,
            492,
            86,
            422,
            166,
            "WHY SEQUENCING MATTERS",
            [
                "await keeps commands in order.",
                "Timed fly and rotate commands are open-loop motion requests.",
                "Built-in settle time reduces overlap between maneuvers.",
                "Vision checks should happen after the aircraft stabilizes.",
            ],
            GOLD,
            white,
            14,
            10.5,
        )

    def sources(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Teach the model, then test the model", "Sources and classroom prompts")
        draw_card(
            c,
            46,
            248,
            420,
            182,
            "QUICK DEMONSTRATIONS",
            [
                "Hold a paper quadrotor level: where does thrust point?",
                "Tilt it 10 deg: what horizontal force appears?",
                "Compare all-motor change with paired-motor change.",
                "Predict motion before running a 15% simulator command.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_sources(
            c,
            [
                ("NASA STEM - The Science Behind Quadcopters", "https://www.nasa.gov/stem-content/the-science-behind-quadcopters/"),
                ("Stanford - Quadrotor Helicopter Flight Dynamics and Control", "https://ai.stanford.edu/~gabeh/papers/Quadrotor_Dynamics_GNC07.pdf"),
                ("Hopper Studio - classroom simulator dynamics", "lib/simulation.ts in the Hopper Studio project"),
            ],
            496,
            415,
            418,
        )
        rounded_panel(c, 46, 85, 868, 120, NAVY, None, 16)
        draw_text(c, "PREDICT  ->  COMMAND  ->  OBSERVE  ->  EXPLAIN", 480, 145, 20, TEAL, "Helvetica-Bold", "center")
        draw_text(c, "The simple equations are a reasoning tool, not a precision flight model.", 480, 111, 11, HexColor("#CBDDE4"), "Helvetica", "center")

    renderers = (cover, thrust, translate, angular, mixing, model, control, sources)
    return Deck("02-quadrotor-aerodynamics.pdf", title, short, renderers)


def blocks_deck() -> Deck:
    title = "Coding blocks reference"
    short = "Coding blocks"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        cover_page(
            c,
            context,
            title,
            "What each Hopper Studio block category does, what it returns and how commands sequence.",
            PHOTO_TOP,
            "03 / Block coding",
            ("FLIGHT", "VISION", "LOGIC + LOOPS"),
            (0.5, 0.50),
        )

    def execution(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "How a block program becomes a flight", "Execution model")
        draw_process(
            c,
            [
                ("Arrange", "Statement blocks form ordered stacks."),
                ("Generate", "Blockly creates asynchronous JavaScript."),
                ("Run", "Commands execute in sequence with await."),
                ("Observe", "Active action blocks glow while running."),
                ("Finish", "Normal main-program completion auto-lands."),
            ],
            46,
            289,
            868,
            142,
            TEAL,
        )
        draw_block(c, 64, 197, 230, "when program starts", TEAL_DARK, 42)
        draw_block(c, 82, 147, 280, "take off", NAVY, 39)
        draw_block(c, 82, 98, 330, "fly forward for 1 sec at 15%", NAVY, 39)
        draw_block(c, 82, 49, 260, "land", NAVY, 39)
        draw_code_window(
            c,
            478,
            54,
            436,
            189,
            [
                [(f"await ", GOLD), ("runtime.runBlock(...", CODE_TEXT)],
                [("  ", CODE_TEXT), (f"await ", GOLD), ("drone.takeOff();", CODE_TEXT)],
                [(");", CODE_TEXT)],
                [(f"await ", GOLD), ('drone.fly("forward", 1, 15);', CODE_TEXT)],
                [(f"await ", GOLD), ("drone.land();", CODE_TEXT)],
            ],
            "GENERATED JAVASCRIPT",
            9.5,
        )
        draw_text(c, "Structural blocks may not glow; concrete flight, wait, accessory and vision actions do.", 696, 42, 9, MUTED, "Helvetica-Bold", "center")

    def starts(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Start & Events", "General control")
        block_specs = [
            ("when program starts", "Container for the main stack. Other top-level stacks can also be generated.", 46, 347, 340),
            ("stop program", "Ends execution but does NOT send a land command. Land first or use UI STOP & LAND.", 46, 256, 340),
            ("wait [seconds]", "Pauses in sequence. Negative/coercion failures become zero.", 46, 165, 340),
            ("print [value]", "Writes a line to the in-app program console.", 46, 74, 340),
            ("when [key] is [pressed/released]", "Arrow, Space and a-z events. Event programs keep listening until Stop.", 482, 347, 392),
            ("[key] key is pressed", "Boolean from the live pressed-key set.", 482, 256, 392),
            ("continue if [condition]", "False returns from the current main, event or function.", 482, 165, 392),
        ]
        for index, (label, note, x, y, width) in enumerate(block_specs):
            draw_block(c, x, y + 34, width, label, TEAL_DARK, 38)
            draw_wrapped(c, note, x + 10, y + 22, width - 20, 9.5, 12, MUTED)
        rounded_panel(c, 482, 74, 392, 72, LIGHT_CORAL, HexColor("#E9BBC2"), 12)
        draw_text(c, "SAFETY", 500, 121, 9, CORAL, "Helvetica-Bold")
        draw_wrapped(c, "The red UI STOP & LAND is the dependable way to cancel tasks and send a landing command.", 500, 103, 352, 10, 13, INK, "Helvetica-Bold")

    def flight(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Mini Drone: flight blocks", "Motion commands")
        flight_blocks = [
            ("take off / land / hover", "Awaited state-changing actions.", NAVY),
            ("fly [direction] for [s] at [power]%", "6 directions; time >= 0; teach 0-100% power; default 1 s / 15%.", NAVY),
            ("rotate [degrees] [direction]", "Timed/open-loop yaw at about 180 deg/s, then settle.", NAVY),
            ("flip [direction]", "Forward/back/left/right; preserve safe height and clear space.", NAVY),
            ("set [axis] to [power]%", "Persistent pitch/roll/yaw/gaz power until reset. 'Altitude' means gaz, not height.", NAVY),
            ("reset movement", "Zeros all motion axes; does not land.", NAVY),
            ("center on AprilTag", "Repeated scans, translation pulses and yaw alignment; does not control height or land.", NAVY),
            ("cut off motors", "Emergency only. Immediate; block/code has no confirmation.", CORAL),
        ]
        for index, (label, note, color) in enumerate(flight_blocks):
            column = index % 2
            row = index // 2
            x = 46 + column * 444
            y = 363 - row * 94
            draw_block(c, x, y, 414, label, color, 38)
            draw_wrapped(c, note, x + 12, y - 12, 406, 9.5, 12, MUTED)
        draw_text(c, "Fly adds a stabilization wait after motion. set-axis does not.", 480, 50, 10, GOLD, "Helvetica-Bold", "center")

    def sensors_accessories(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Mini Drone: state, events and accessories", "Limited exposed telemetry")
        draw_card(
            c,
            46,
            248,
            412,
            181,
            "SENSORS + EVENTS",
            [
                "battery level -> number 0-100 or null before telemetry.",
                "drone is flying / landed -> Boolean.",
                "wait until battery changes -> asynchronous wait.",
                "when drone starts flying / lands / crashes / battery changes.",
            ],
            TEAL,
            white,
            15,
            10.5,
        )
        draw_card(
            c,
            480,
            248,
            434,
            181,
            "ACCESSORIES",
            [
                "take and store photo -> session gallery JPEG from camera pixels.",
                "open / close grabber -> needs physical claw; simulator is a timing stub.",
                "fire cannon -> needs physical cannon; simulator is a timing stub.",
            ],
            GOLD,
            white,
            15,
            10.5,
        )
        rounded_panel(c, 46, 85, 868, 127, NAVY, None, 16)
        draw_text(c, "NOT AVAILABLE AS BLOCK VALUES", 480, 174, 10, CORAL, "Helvetica-Bold", "center")
        draw_text(c, "GPS | x/y room position | real altitude | velocity | attitude | heading | raw IMU | range", 480, 139, 15, white, "Helvetica-Bold", "center")
        draw_text(c, "'set altitude' is signed vertical motor power. It is not an altitude setpoint.", 480, 105, 10.5, TEAL, "Helvetica-Bold", "center")

    def vision(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Camera Vision blocks", "Every predicate can trigger real computation")
        groups = [
            (
                "BINARY",
                TEAL_DARK,
                [
                    "camera sees binary white/black at threshold + coverage",
                    "camera sees binary white/black at center pixel",
                ],
            ),
            (
                "OBJECTS",
                TEAL,
                [
                    "scan for objects",
                    "camera sees [label] at [confidence]%",
                    "x/y coordinate of [label] at [confidence]%",
                ],
            ),
            (
                "CUSTOM",
                GOLD,
                ["custom model sees [label] at [confidence]%"],
            ),
            (
                "APRILTAGS",
                CORAL,
                [
                    "scan for april tags",
                    "camera sees april tag with ID [any/0-586]",
                    "center on AprilTag (in Flight category)",
                ],
            ),
        ]
        x_positions = (46, 270, 494, 718)
        widths = (204, 204, 204, 196)
        for index, (heading, color, blocks) in enumerate(groups):
            x = x_positions[index]
            rounded_panel(c, x, 100, widths[index], 329, white, LINE, 14)
            rounded_panel(c, x + 12, 385, widths[index] - 24, 31, color, None, 8)
            draw_text(c, heading, x + widths[index] / 2, 395, 10, white, "Helvetica-Bold", "center")
            y = 329
            for block_label in blocks:
                draw_block(c, x + 12, y, widths[index] - 24, block_label, color, 48)
                y -= 76
        draw_text(c, "Fresh scan: binary predicates, sees object, custom sees and sees AprilTag.", 480, 72, 9.5, TEAL_DARK, "Helvetica-Bold", "center")
        draw_text(c, "Saved state only: object coordinate. 0 can mean centered OR not previously detected.", 480, 52, 9.5, CORAL, "Helvetica-Bold", "center")

    def builtins(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Logic, loops, math, variables and functions", "Built-in Blockly tools")
        cards = [
            ("LOGIC", ["if / else", "comparisons", "and / or / not", "true / false", "ternary"], TEAL),
            ("LOOPS", ["forever", "for N seconds", "repeat count", "while / until", "counted for", "break / continue"], GOLD),
            ("MATH", ["arithmetic", "unary math", "trig", "rounding", "modulo", "random"], TEAL_DARK),
            ("VARIABLES", ["create", "get", "set", "change"], CORAL),
            ("FUNCTIONS", ["define", "parameters", "return value", "awaited calls"], HexColor("#7A4E9D")),
        ]
        positions = [(46, 246, 252, 183), (316, 246, 252, 183), (586, 246, 328, 183), (46, 85, 388, 136), (456, 85, 458, 136)]
        for (card_title, body, accent), (x, y, width, height) in zip(cards, positions):
            draw_card(c, x, y, width, height, card_title, body, accent, white, 14, 10.5)
        draw_text(c, "Loops yield so Stop can interrupt. Generated custom functions are async; calls are awaited.", 480, 53, 10, MUTED, "Helvetica-Bold", "center")

    def safe_mission(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Build one intentional, safe mission", "Recommended pattern")
        draw_block(c, 58, 365, 276, "when program starts", TEAL_DARK, 42)
        draw_block(c, 76, 315, 240, "take off", NAVY, 38)
        draw_block(c, 76, 267, 315, "repeat for 10 seconds", GOLD, 38)
        draw_block(c, 100, 217, 350, "fly forward for 1 sec at 15%", NAVY, 38)
        draw_block(c, 100, 169, 338, "if camera sees white paper", TEAL_DARK, 38)
        draw_block(c, 124, 121, 230, "land", NAVY, 38)
        draw_block(c, 76, 73, 230, "land", NAVY, 38)
        draw_card(
            c,
            504,
            244,
            410,
            186,
            "MISSION RULES",
            [
                "Place all intended executable stacks deliberately; detached top-level stacks may still run.",
                "Use one start hat for the main mission.",
                "End with land even when a condition is never met.",
                "Use the UI STOP & LAND for intervention.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_sources(
            c,
            [
                ("Hopper Studio block definitions and JavaScript generators", "lib/blockly.ts in the Hopper Studio project"),
                ("Hopper Studio execution and safety behavior", "components/HopperStudio.tsx, lib/runtime.ts and README.md"),
            ],
            504,
            207,
            410,
        )

    renderers = (cover, execution, starts, flight, sensors_accessories, vision, builtins, safe_mission)
    return Deck("03-coding-blocks-reference.pdf", title, short, renderers)


def javascript_deck() -> Deck:
    title = "JavaScript API reference"
    short = "JavaScript API"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        cover_page(
            c,
            context,
            title,
            "The stable variables and functions available to advanced Hopper Studio programs.",
            PHOTO_UNDERSIDE,
            "04 / Text coding",
            ("ASYNC + AWAIT", "DRONE", "VISION", "RUNTIME"),
            (0.5, 0.56),
        )

    def world(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Your program receives four useful bindings", "Execution environment")
        cards = [
            ("drone", "Flight, state and accessory commands shared by the real and simulated aircraft.", NAVY, "D"),
            ("vision", "Thresholding, object detection, custom classification and AprilTag functions.", TEAL_DARK, "V"),
            ("runtime", "Keys, drone events, loops, cancellation and cooperative yielding.", GOLD, "R"),
            ("console", "log, warn and error lines in the in-app program console.", CORAL, "C"),
        ]
        for index, (name, body, accent, icon) in enumerate(cards):
            draw_card(c, 46 + index * 219, 246, 201, 184, name, body, accent, white, 18, 10.5, icon)
        rounded_panel(c, 46, 86, 868, 124, NAVY, None, 16)
        draw_text(c, "TOP-LEVEL await WORKS", 480, 168, 13, TEAL, "Helvetica-Bold", "center")
        draw_text(c, "await drone.takeOff();", 480, 129, 20, white, "Courier-Bold", "center")
        draw_text(c, "Promise-returning calls must be awaited or the main body may finish and auto-land early.", 480, 99, 10, HexColor("#C7DAE2"), "Helvetica", "center")

    def flight(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "drone: core flight commands", "Stable student surface")
        rows = [
            ("await drone.takeOff()", "Take off; physical controller waits about 3 s."),
            ("await drone.land()", "Land; physical controller waits about 5 s."),
            ("await drone.hover()", "Zero axes and wait 1 s."),
            ('await drone.fly(direction, seconds, power)', "6 directions; seconds >= 0; signed power clamps -100..100%."),
            ('await drone.rotate(degrees, direction)', "clockwise/counterclockwise; timed/open-loop yaw."),
            ('await drone.flip(direction)', "forward/backward/left/right; preserve safe clearance."),
            ('drone.setAxis(axis, power)', "Persistent pitch/roll/yaw/gaz command until reset."),
            ("drone.reset()", "Zero motion axes; does not land."),
        ]
        y = 388
        for index, (signature, note) in enumerate(rows):
            rounded_panel(c, 46, y, 868, 43, white if index % 2 == 0 else HexColor("#E7EEF0"), None, 7)
            draw_text(c, signature, 64, y + 15, 10.5, NAVY, "Courier-Bold")
            draw_text(c, note, 492, y + 15, 9.5, MUTED, "Helvetica")
            y -= 46
        draw_text(c, '"altitude" is accepted as an axis alias for gaz vertical power - it is not a height setpoint.', 480, 51, 9.5, CORAL, "Helvetica-Bold", "center")

    def state(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "drone: state, timing and accessories", "Returns and caveats")
        draw_card(
            c,
            46,
            246,
            420,
            184,
            "STATE + TIMING",
            [
                "await drone.wait(seconds)",
                "drone.getBatteryLevel() -> number | null",
                "drone.isFlying() / drone.isLanded() -> boolean",
                "await drone.waitUntilBatteryLevelChanges()",
                "drone.cancelRunFlag -> boolean",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            488,
            246,
            426,
            184,
            "CAMERA + ACCESSORIES",
            [
                "await drone.takePicture() -> session gallery",
                'await drone.grabber("OPEN" | "CLOSE")',
                "await drone.fireGun()",
                "await drone.cutoff() -> emergency only",
            ],
            GOLD,
            white,
            14,
            10.5,
        )
        rounded_panel(c, 46, 87, 868, 121, LIGHT_CORAL, HexColor("#E7BBC2"), 16)
        draw_text(c, "APP-OWNED - DO NOT USE IN STUDENT PROGRAMS", 480, 171, 10, CORAL, "Helvetica-Bold", "center")
        draw_wrapped(
            c,
            "disconnect, abortRun, startRun, stopRun, landNoWait, forceLand, manualNudge, onTelemetry and onEvent are lifecycle/UI internals. Replacing callbacks can break the app.",
            83,
            142,
            794,
            10.5,
            14,
            INK,
            "Helvetica",
        )

    def vision_binary_object(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "vision: binary and COCO functions", "Confidence in JavaScript is 0..1")
        draw_card(
            c,
            46,
            249,
            420,
            181,
            "BINARY THRESHOLD",
            [
                "await vision.scanThreshold(T=60, invert=false)",
                'await vision.seesBinary("white", T, invert, coverage=10)',
                'await vision.binaryCenter("white", T, invert)',
                "T and coverage use 0-100 percentages.",
            ],
            TEAL_DARK,
            white,
            13,
            9.8,
        )
        draw_card(
            c,
            488,
            249,
            426,
            181,
            "COCO OBJECTS",
            [
                "await vision.loadObjectModel()",
                "await vision.detectObjects(confidence=0.55)",
                'await vision.seesObject("apple", 0.55)',
                'vision.objectCoordinate("apple", "x", 0.55)',
            ],
            TEAL,
            white,
            13,
            9.8,
        )
        rounded_panel(c, 46, 85, 868, 124, NAVY, None, 16)
        draw_text(c, "OBJECT RESULT", 76, 169, 9, TEAL, "Helvetica-Bold")
        draw_text(c, "{ class, score, bbox, frameWidth, frameHeight, centerX, centerY }", 76, 136, 13, white, "Courier-Bold")
        draw_text(c, "x/y are -100..100; right/up positive. objectCoordinate never scans and returns last known value or 0.", 76, 105, 9.5, HexColor("#CADCE3"), "Helvetica")

    def vision_tags_custom(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "vision: AprilTags and custom models", "Fresh frames and local inference")
        draw_card(
            c,
            46,
            236,
            420,
            194,
            "APRILTAGS",
            [
                "await vision.scanAprilTags()",
                'await vision.seesAprilTag("any" | id)',
                "await vision.centerOnAprilTag(drone, id, power, centerSlack, angleSlack, lostSearches)",
                "IDs 0-586; 2D image yaw; returns true/false.",
            ],
            CORAL,
            white,
            13,
            9.6,
        )
        draw_card(
            c,
            488,
            236,
            426,
            194,
            "TEACHABLE MACHINE",
            [
                "Load model.json + weights.bin + metadata.json in the UI.",
                "await vision.classifyCustomModel()",
                'await vision.seesCustomLabel("landing pad", 0.75)',
                "Whole-frame classes; no boxes or x/y location.",
            ],
            GOLD,
            white,
            13,
            9.6,
        )
        draw_camera_frame(c, 46, 84, 266, 116, tag=True)
        draw_apriltag(c, 0, 332, 89, 100, True)
        draw_process(
            c,
            [("Frame", "Fresh camera capture."), ("Inference", "Runs on this computer."), ("Decision", "Boolean, result list or pose.")],
            488,
            84,
            426,
            116,
            TEAL_DARK,
        )

    def runtime(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "runtime and console", "Events, loops and cancellation")
        rows = [
            ('runtime.registerKey("pressed", "a", async () => {...})', "Key event; handlers can overlap."),
            ('runtime.registerDrone("landed", async () => {...})', "flying, landed, crashed, batteryLevelChanged."),
            ('runtime.keyIsPressed("ArrowUp")', "Live Boolean."),
            ("await runtime.repeatForSeconds(seconds, async () => {...})", "Sequential iterations with a yield."),
            ("await runtime.tick()", "Yield and throw if stopped."),
            ("runtime.stopped / runtime.hasEvents", "Read program state."),
            ("runtime.stop()", "Unregister/abort only; currently does NOT land."),
            ("console.log / warn / error(...values)", "Append to the in-app console."),
        ]
        y = 388
        for index, (signature, note) in enumerate(rows):
            rounded_panel(c, 46, y, 868, 43, white if index % 2 == 0 else HexColor("#E7EEF0"), None, 7)
            draw_text(c, signature, 64, y + 15, 9.2, NAVY, "Courier-Bold")
            draw_text(c, note, 610, y + 15, 9.2, MUTED, "Helvetica")
            y -= 46
        draw_text(c, "Use the red UI STOP & LAND for a safe operator intervention.", 480, 51, 10, CORAL, "Helvetica-Bold", "center")

    def example(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "A complete safe example", "White-paper landing")
        lines = [
            [(f"await ", GOLD), ("drone.takeOff();", CODE_TEXT)],
            [("try", TEAL), (" {", CODE_TEXT)],
            [("  ", CODE_TEXT), (f"while ", GOLD), ("(!runtime.stopped) {", CODE_TEXT)],
            [("    ", CODE_TEXT), (f"const ", TEAL), ("overPaper = ", CODE_TEXT), (f"await ", GOLD)],
            [("      ", CODE_TEXT), ('vision.binaryCenter("white", 60, false);', CODE_TEXT)],
            [("    ", CODE_TEXT), (f"if ", GOLD), ("(overPaper) ", CODE_TEXT), (f"break", GOLD), (";", CODE_TEXT)],
            [("    ", CODE_TEXT), (f"await ", GOLD), ('drone.fly("forward", 0.5, 12);', CODE_TEXT)],
            [("  }", CODE_TEXT)],
            [("} ", CODE_TEXT), ("finally", TEAL), (" {", CODE_TEXT)],
            [("  ", CODE_TEXT), (f"await ", GOLD), ("drone.land();", CODE_TEXT)],
            [("}", CODE_TEXT)],
        ]
        draw_code_window(c, 46, 82, 536, 349, lines, "WHITE-PAPER-LANDING.JS", 9.5)
        draw_card(
            c,
            610,
            273,
            304,
            158,
            "WHY THIS PATTERN",
            [
                "Top-level await keeps order.",
                "Fresh vision decision after each move.",
                "Small, conservative command.",
                "finally sends land after error or break.",
            ],
            TEAL,
            white,
            13,
            10,
        )
        draw_card(
            c,
            610,
            82,
            304,
            167,
            "REMEMBER",
            [
                "No GPS or altitude variable.",
                "Vision can be wrong - test lighting first.",
                "UI Stop & Land remains the operator control.",
                "Keep the flight area clear.",
            ],
            CORAL,
            white,
            13,
            10,
        )

    def sources(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Use the documented surface", "Reference")
        draw_card(
            c,
            46,
            242,
            420,
            188,
            "UNITS AT A GLANCE",
            [
                "Flight power: percent, recommend 0-100.",
                "Fly/wait time: seconds.",
                "Rotation: degrees + direction.",
                "JS confidence: fraction 0-1.",
                "Block confidence/threshold/coverage: percent 0-100.",
                "Vision x/y: -100..100.",
            ],
            TEAL,
            white,
            14,
            10.2,
        )
        draw_sources(
            c,
            [
                ("Shared drone controller contract", "lib/drone.ts in the Hopper Studio project"),
                ("Vision runtime", "lib/vision.ts and lib/apriltags.ts in the Hopper Studio project"),
                ("Program runtime and app execution", "lib/runtime.ts and components/HopperStudio.tsx"),
            ],
            496,
            414,
            418,
        )
        rounded_panel(c, 46, 80, 868, 126, NAVY, None, 16)
        draw_text(c, "AWAIT FLIGHT + VISION CALLS", 480, 155, 18, TEAL, "Helvetica-Bold", "center")
        draw_text(c, "Use documented members. Treat browser globals and app internals as implementation details.", 480, 117, 10.5, HexColor("#D3E1E7"), "Helvetica", "center")

    renderers = (cover, world, flight, state, vision_binary_object, vision_tags_custom, runtime, example, sources)
    return Deck("04-javascript-api-reference.pdf", title, short, renderers)


def draw_threshold_gradient(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    threshold_percent: float,
    binary: bool = False,
    invert: bool = False,
) -> None:
    cells = 80
    cell_width = width / cells
    for index in range(cells):
        brightness = index / (cells - 1)
        if binary:
            is_white = brightness >= threshold_percent / 100
            if invert:
                is_white = not is_white
            color = white if is_white else HexColor("#050505")
        else:
            color = Color(brightness, brightness, brightness)
        set_fill(c, color)
        c.rect(x + index * cell_width, y, cell_width + 0.2, height, fill=1, stroke=0)
    set_stroke(c, CORAL, 3)
    threshold_x = x + width * threshold_percent / 100
    c.line(threshold_x, y - 8, threshold_x, y + height + 8)
    draw_text(c, f"T = {threshold_percent:.0f}%", threshold_x, y + height + 14, 9, CORAL, "Helvetica-Bold", "center")


def threshold_deck() -> Deck:
    title = "Thresholding with Hopper"
    short = "Thresholding"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        cover_page(
            c,
            context,
            title,
            "Turn camera brightness into a reliable two-color signal for a white-paper mission.",
            PHOTO_UNDERSIDE,
            "05 / Binary computer vision",
            ("WHITE + BLACK", "0-100% THRESHOLD", "DOWNWARD CAMERA"),
            (0.52, 0.56),
        )

    def pipeline(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "One camera frame becomes two colors", "Binary vision pipeline")
        draw_camera_frame(c, 46, 174, 252, 224, paper=True)
        draw_arrow(c, 315, 286, 354, 286, TEAL, 3, 9)
        rounded_panel(c, 370, 174, 220, 224, white, LINE, 12)
        draw_text(c, "GRAYSCALE", 480, 372, 11, TEAL_DARK, "Helvetica-Bold", "center")
        for index in range(9):
            shade = 0.12 + index * 0.095
            set_fill(c, Color(shade, shade, shade))
            c.rect(394 + (index % 3) * 56, 220 + (index // 3) * 46, 46, 36, fill=1, stroke=0)
        draw_text(c, "brightness I(x,y)", 480, 193, 10, MUTED, "Courier-Bold", "center")
        draw_arrow(c, 607, 286, 646, 286, TEAL, 3, 9)
        rounded_panel(c, 662, 174, 252, 224, white, LINE, 12)
        draw_text(c, "BINARY OUTPUT", 788, 372, 11, TEAL_DARK, "Helvetica-Bold", "center")
        set_fill(c, HexColor("#080808"))
        c.rect(686, 210, 204, 126, fill=1, stroke=0)
        set_fill(c, white)
        c.saveState()
        c.translate(790, 273)
        c.rotate(-8)
        c.rect(-50, -35, 100, 70, fill=1, stroke=0)
        c.restoreState()
        draw_text(c, "0 or 1", 788, 193, 10, MUTED, "Courier-Bold", "center")
        rounded_panel(c, 150, 84, 660, 60, NAVY, None, 13)
        draw_text(c, "CAMERA  ->  LUMINANCE  ->  THRESHOLD RULE  ->  WHITE / BLACK", 480, 108, 14, TEAL, "Helvetica-Bold", "center")

    def rule(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "The decision rule is simple and inspectable", "Brightness threshold")
        rounded_panel(c, 46, 258, 868, 172, white, LINE, 16)
        draw_text(c, "ORIGINAL BRIGHTNESS", 78, 397, 9, MUTED, "Helvetica-Bold")
        draw_threshold_gradient(c, 78, 330, 804, 42, 60, False)
        draw_text(c, "BINARY RESULT", 78, 300, 9, MUTED, "Helvetica-Bold")
        draw_threshold_gradient(c, 78, 266, 804, 26, 60, True)
        rounded_panel(c, 46, 83, 412, 143, NAVY, None, 16)
        draw_text(c, "B(x,y) = 1  if  I(x,y) >= T", 252, 178, 18, white, "Courier-Bold", "center")
        draw_text(c, "otherwise B(x,y) = 0", 252, 141, 15, TEAL, "Courier-Bold", "center")
        draw_text(c, "invert swaps 0 and 1", 252, 106, 10, HexColor("#C8DCE4"), "Helvetica", "center")
        draw_card(
            c,
            486,
            83,
            428,
            143,
            "WHAT THE SCAN RETURNS",
            [
                "whiteCoverage and blackCoverage in percent.",
                "centerWhite Boolean at the reticle pixel.",
                "frame width/height and the binary image.",
            ],
            TEAL,
            white,
            13,
            10.2,
        )

    def white_paper(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "A white sheet can become a visual landing cue", "Downward-camera experiment")
        draw_camera_frame(c, 46, 102, 470, 328, paper=True)
        set_stroke(c, TEAL, 3)
        c.rect(287, 200, 146, 105, fill=0, stroke=1)
        rounded_panel(c, 304, 309, 111, 22, TEAL, None, 5)
        draw_text(c, "WHITE PAPER", 359.5, 316, 8, white, "Helvetica-Bold", "center")
        draw_card(
            c,
            548,
            282,
            366,
            148,
            "CALIBRATE BEFORE FLIGHT",
            [
                "Place the real paper on the real floor.",
                "Use the exact classroom lighting.",
                "Adjust T until paper stays white and floor stays black.",
                "Record the chosen threshold.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            548,
            102,
            366,
            154,
            "CHOOSE A DECISION",
            [
                "Coverage: enough of the frame is paper.",
                "Center pixel: reticle has crossed onto paper.",
                "Combine repeated checks for a safer decision.",
                "Then explicitly command land.",
            ],
            GOLD,
            white,
            14,
            10.5,
        )
        draw_text(c, "Thresholding detects brightness, not the semantic concept 'paper'.", 480, 58, 10, CORAL, "Helvetica-Bold", "center")

    def strategies(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Two useful sensing strategies", "Coverage vs center pixel")
        draw_card(
            c,
            46,
            85,
            410,
            345,
            "FRAME COVERAGE",
            "Ask: what percentage of all pixels are white?",
            TEAL,
            white,
            16,
            11,
        )
        draw_camera_frame(c, 82, 170, 338, 178, paper=True)
        rounded_panel(c, 115, 115, 272, 38, LIGHT_TEAL, None, 10)
        draw_text(c, "whiteCoverage >= 18%", 251, 129, 13, TEAL_DARK, "Courier-Bold", "center")
        draw_text(c, "Good for: area entered, target fills view", 251, 97, 9.5, MUTED, "Helvetica-Bold", "center")
        draw_card(
            c,
            504,
            85,
            410,
            345,
            "CENTER PIXEL",
            "Ask: is the single reticle pixel white?",
            GOLD,
            white,
            16,
            11,
        )
        draw_camera_frame(c, 540, 170, 338, 178, paper=True)
        set_fill(c, CORAL)
        c.circle(709, 259, 5, fill=1, stroke=0)
        rounded_panel(c, 573, 115, 272, 38, LIGHT_GOLD, None, 10)
        draw_text(c, "centerWhite === true", 709, 129, 13, GOLD, "Courier-Bold", "center")
        draw_text(c, "Good for: center over target, line crossing", 709, 97, 9.5, MUTED, "Helvetica-Bold", "center")

    def mission(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Search, verify, then land", "A conservative mission")
        draw_process(
            c,
            [
                ("Take off", "Stabilize over clear floor."),
                ("Move", "Small search-pattern segment."),
                ("Scan", "Fresh binary frame."),
                ("Verify", "Center or coverage true twice."),
                ("Land", "Explicit landing command."),
            ],
            46,
            288,
            868,
            142,
            TEAL,
        )
        draw_code_window(
            c,
            46,
            79,
            510,
            169,
            [
                [(f"const ", TEAL), ("hit = ", CODE_TEXT), (f"await ", GOLD)],
                [("  ", CODE_TEXT), ('vision.seesBinary("white", 60, false, 18);', CODE_TEXT)],
                [(f"if ", GOLD), ("(hit) {", CODE_TEXT)],
                [("  ", CODE_TEXT), (f"await ", GOLD), ("drone.hover();", CODE_TEXT)],
                [("  ", CODE_TEXT), (f"await ", GOLD), ("drone.land();", CODE_TEXT)],
                [("}", CODE_TEXT)],
            ],
            "SEARCH CHECK",
            8.8,
        )
        draw_card(
            c,
            586,
            79,
            328,
            169,
            "SAFER THAN ONE CHECK",
            [
                "Move in small increments.",
                "Pause for exposure and motion to settle.",
                "Require repeated consistent observations.",
                "Keep a timeout and fallback land.",
            ],
            CORAL,
            white,
            13,
            10,
        )

    def lighting(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Lighting is part of the experiment", "Failure modes")
        cards = [
            ("SHADOW", "A shadow can turn white paper gray or black.", CORAL),
            ("REFLECTION", "Glare can turn dark floor pixels bright.", GOLD),
            ("AUTO-EXPOSURE", "The same paper may shift brightness as the view changes.", TEAL),
            ("MOTION BLUR", "Fast movement mixes paper and floor at the edge.", TEAL_DARK),
            ("FLOOR TEXTURE", "Light markings can resemble the target.", GOLD),
            ("TARGET SIZE", "A small target may never reach the coverage threshold.", CORAL),
        ]
        for index, (card_title, body, accent) in enumerate(cards):
            column = index % 3
            row = index // 3
            draw_card(c, 46 + column * 292, 260 - row * 167, 274, 145, card_title, body, accent, white, 13, 10.5)
        draw_sources(
            c,
            [
                ("Hopper Studio - threshold implementation and scan behavior", "lib/vision.ts and README.md in the Hopper Studio project"),
                ("FTW Robotics - indoor lighting and floor guidance", "https://ftw-robotics.ai/hopper"),
            ],
            46,
            78,
            868,
        )

    renderers = (cover, pipeline, rule, white_paper, strategies, mission, lighting)
    return Deck("05-thresholding-with-hopper.pdf", title, short, renderers)


def object_detection_deck() -> Deck:
    title = "Object detection and COCO"
    short = "Object detection"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        set_fill(c, NAVY)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        set_fill(c, TEAL)
        c.rect(0, H - 8, W, 8, fill=1, stroke=0)
        rounded_panel(c, 46, H - 155, 286, 108, white, None, 14)
        draw_image_contain(c, LOGO_FULL, 64, H - 145, 250, 88)
        draw_text(c, "HOPPER INFORMATION SERIES", 48, 337, 10, TEAL, "Helvetica-Bold")
        draw_text(c, "06 / COMPUTER VISION", 48, 315, 9, GOLD, "Helvetica-Bold")
        draw_text(c, "Object detection", 48, 265, 40, white, "Helvetica-Bold")
        draw_text(c, "and COCO", 48, 221, 40, TEAL, "Helvetica-Bold")
        draw_wrapped(c, "How the built-in local neural network names and locates common objects.", 48, 182, 408, 15.5, 20, HexColor("#D4E2E8"))
        positions = [(555, 289), (745, 289), (555, 99), (745, 99)]
        for (name, image_path), (x, y) in zip(OBJECT_IMAGES.items(), positions):
            rounded_panel(c, x, y, 160, 160, white, None, 18)
            draw_image_contain(c, image_path, x + 15, y + 25, 130, 115)
            rounded_panel(c, x + 25, y + 10, 110, 22, TEAL_DARK, None, 6)
            draw_text(c, name, x + 80, y + 17, 8.5, white, "Helvetica-Bold", "center")
        rounded_panel(c, W - 82, 18, 36, 42, white, None, 8)
        draw_image_contain(c, LOGO_EMBLEM, W - 76, 22, 24, 34)
        draw_text(c, f"DECK {context.number:02d}  |  {context.total} SLIDES", 48, 20, 8, HexColor("#9CB1BF"), "Helvetica-Bold")

    def compare(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Detection is not the same as classification", "What question is answered?")
        draw_card(
            c,
            46,
            86,
            410,
            344,
            "OBJECT DETECTOR",
            "Find multiple known objects and report where each one is.",
            TEAL,
            white,
            16,
            11,
        )
        draw_camera_frame(c, 82, 170, 338, 175, object_box=True)
        draw_text(c, "OUTPUT", 82, 145, 9, TEAL_DARK, "Helvetica-Bold")
        draw_text(c, "class + confidence + box + x/y", 82, 121, 11, INK, "Courier-Bold")
        draw_text(c, "Built-in COCO-SSD", 251, 98, 10, MUTED, "Helvetica-Bold", "center")
        draw_card(
            c,
            504,
            86,
            410,
            344,
            "IMAGE CLASSIFIER",
            "Choose the best whole-frame class. It does not draw a box.",
            GOLD,
            white,
            16,
            11,
        )
        rounded_panel(c, 540, 170, 338, 175, CODE_BG, None, 10)
        draw_image_contain(c, OBJECT_IMAGES["apple"], 646, 192, 126, 126)
        rounded_panel(c, 583, 132, 252, 31, LIGHT_GOLD, None, 9)
        draw_text(c, "apple landing pad  91%", 709, 142, 11, GOLD, "Courier-Bold", "center")
        draw_text(c, "Custom Teachable Machine", 709, 98, 10, MUTED, "Helvetica-Bold", "center")

    def coco(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "COCO means Common Objects in Context", "The dataset behind the labels")
        stats = [
            ("330K", "images"),
            (">200K", "labeled images"),
            ("1.5M", "object instances"),
            ("80", "object categories"),
        ]
        for index, (value, label) in enumerate(stats):
            x = 46 + index * 219
            rounded_panel(c, x, 307, 201, 123, NAVY if index % 2 == 0 else TEAL_DARK, None, 14)
            draw_text(c, value, x + 100.5, 363, 28, white, "Helvetica-Bold", "center")
            draw_text(c, label.upper(), x + 100.5, 333, 9, HexColor("#D7E5EA"), "Helvetica-Bold", "center")
        draw_text(c, "Examples used in the Hopper simulator and recognized label set", 46, 276, 11, MUTED, "Helvetica-Bold")
        for index, (name, image_path) in enumerate(OBJECT_IMAGES.items()):
            x = 46 + index * 219
            rounded_panel(c, x, 85, 201, 166, white, LINE, 14)
            draw_image_contain(c, image_path, x + 24, 118, 153, 110)
            draw_text(c, name, x + 100.5, 99, 10, TEAL_DARK, "Helvetica-Bold", "center")
        draw_text(c, "Illustrations are simulator targets, not COCO training photographs. OpenMoji CC BY-SA 4.0.", 480, 54, 8.5, MUTED, "Helvetica", "center")

    def network(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "The built-in network runs locally", "COCO-SSD + lite_mobilenet_v2")
        draw_process(
            c,
            [
                ("Camera frame", "Downsampled to at most 420 px wide."),
                ("Feature network", "MobileNet extracts visual patterns."),
                ("SSD heads", "Predict classes, boxes and scores."),
                ("Filter", "Keep results above confidence."),
                ("Overlay", "Show boxes and centered x/y."),
            ],
            46,
            270,
            868,
            160,
            TEAL,
        )
        rounded_panel(c, 46, 84, 868, 142, NAVY, None, 16)
        draw_text(c, "LAZY + LOCAL", 81, 181, 10, TEAL, "Helvetica-Bold")
        draw_text(c, "public/models/coco-ssd/model.json", 81, 146, 15, white, "Courier-Bold")
        draw_text(c, "Loads only when object detection is requested. No image upload and no internet model fetch.", 81, 112, 10.5, HexColor("#CEDDE4"), "Helvetica")
        draw_pill(c, "MAX 10 BOXES", 706, 142, LIGHT_TEAL, TEAL_DARK, 26, 12, 9)
        draw_pill(c, "DEFAULT 0.55", 706, 105, LIGHT_GOLD, GOLD, 26, 12, 9)

    def detection(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Read a detection like a measurement", "Class, confidence, box and coordinates")
        draw_camera_frame(c, 46, 91, 510, 339, object_box=True)
        set_stroke(c, TEAL, 2)
        c.line(301, 91, 301, 430)
        c.line(46, 260.5, 556, 260.5)
        draw_text(c, "-100", 52, 244, 8, HexColor("#9AB2C0"), "Courier")
        draw_text(c, "+100", 522, 244, 8, HexColor("#9AB2C0"), "Courier")
        draw_text(c, "+100", 305, 415, 8, HexColor("#9AB2C0"), "Courier")
        draw_text(c, "-100", 305, 100, 8, HexColor("#9AB2C0"), "Courier")
        set_fill(c, CORAL)
        c.circle(367, 288, 6, fill=1, stroke=0)
        draw_text(c, "(+26, +16)", 379, 293, 9, CORAL, "Courier-Bold")
        draw_card(
            c,
            588,
            270,
            326,
            160,
            "DETECTION OBJECT",
            [
                "class: exact COCO label",
                "score: 0..1",
                "bbox: left, top, width, height in pixels",
                "centerX / centerY: -100..100",
            ],
            TEAL,
            white,
            13,
            9.7,
        )
        draw_card(
            c,
            588,
            91,
            326,
            156,
            "COORDINATE RULE",
            [
                "Frame center is (0,0).",
                "Right and up are positive.",
                "objectCoordinate reads last known state.",
                "0 can mean absent or perfectly centered.",
            ],
            CORAL,
            white,
            13,
            9.7,
        )

    def use(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Scan, test, then use saved coordinates", "Blocks and JavaScript")
        draw_block(c, 46, 355, 308, "scan for objects", TEAL_DARK, 44)
        draw_block(c, 46, 286, 374, "camera sees apple at 55% confidence", TEAL_DARK, 44)
        draw_block(c, 46, 217, 406, "x coordinate of apple at 55% confidence", TEAL_DARK, 44)
        draw_code_window(
            c,
            480,
            216,
            434,
            214,
            [
                [(f"const ", TEAL), ("seen = ", CODE_TEXT), (f"await ", GOLD)],
                [("  ", CODE_TEXT), ('vision.seesObject("apple", 0.55);', CODE_TEXT)],
                [(f"if ", GOLD), ("(seen) {", CODE_TEXT)],
                [("  ", CODE_TEXT), (f"const ", TEAL), ("x = vision.objectCoordinate(", CODE_TEXT)],
                [("    ", CODE_TEXT), ('"apple", "x", 0.55);', CODE_TEXT)],
                [("  console.log({ seen, x });", CODE_TEXT)],
                [("}", CODE_TEXT)],
            ],
            "OBJECT CHECK",
            8.7,
        )
        draw_card(
            c,
            46,
            77,
            868,
            103,
            "FRESH VS SAVED",
            [
                "seesObject performs a fresh inference every call.",
                "objectCoordinate never scans; later misses do not clear its per-label last-known map.",
                "Use a fresh Boolean scan to establish current visibility before trusting x/y.",
            ],
            GOLD,
            white,
            12,
            9.7,
        )

    def limitations(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Design experiments around model limitations", "Probabilistic vision")
        draw_card(
            c,
            46,
            244,
            420,
            186,
            "MAKE COCO EASIER",
            [
                "Use exact labels from the 80-class list.",
                "Choose large, well-lit, separated objects.",
                "Test distance, rotation and background.",
                "Tune confidence with false positives and misses.",
                "Require repeated consistent detections.",
            ],
            TEAL,
            white,
            14,
            10.4,
        )
        draw_card(
            c,
            488,
            244,
            426,
            186,
            "KNOW WHEN TO SWITCH",
            [
                "pencil is not a COCO label.",
                "Small or thin objects are difficult.",
                "Occlusion and unusual viewpoints reduce confidence.",
                "Use Teachable Machine for classroom-specific whole-frame classes.",
            ],
            CORAL,
            white,
            14,
            10.4,
        )
        draw_sources(
            c,
            [
                ("COCO dataset", "https://cocodataset.org/"),
                ("Microsoft COCO paper", "https://arxiv.org/abs/1405.0312"),
                ("TensorFlow.js COCO-SSD", "https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd"),
                ("Hopper Studio local model implementation", "lib/vision.ts and README.md"),
                ("OpenMoji simulator illustrations", "https://openmoji.org/ - CC BY-SA 4.0"),
            ],
            46,
            210,
            868,
        )

    renderers = (cover, compare, coco, network, detection, use, limitations)
    return Deck("06-object-detection-and-coco.pdf", title, short, renderers)


def teachable_machine_deck() -> Deck:
    title = "Build a Teachable Machine model"
    short = "Teachable Machine"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        cover_page(
            c,
            context,
            title,
            "Train custom image classes in the browser, export TensorFlow.js files and load them into Hopper Studio.",
            PHOTO_UNDERSIDE,
            "07 / Custom image classification",
            ("COLLECT", "TRAIN", "EXPORT", "LOAD"),
            (0.5, 0.55),
        )

    def classes(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Choose classes that answer one mission question", "Classification design")
        rounded_panel(c, 46, 87, 410, 343, NAVY, None, 18)
        draw_text(c, "GOOD CLASS SET", 251, 390, 11, TEAL, "Helvetica-Bold", "center")
        labels = [
            ("RED PAD", TEAL),
            ("BLUE PAD", GOLD),
            ("CLEAR FLOOR", HexColor("#7693A3")),
        ]
        y = 320
        for label, color in labels:
            rounded_panel(c, 104, y, 294, 58, color, None, 13)
            draw_text(c, label, 251, y + 21, 14, white, "Helvetica-Bold", "center")
            y -= 78
        draw_text(c, "Each frame must belong to one class.", 251, 115, 10, HexColor("#D4E2E8"), "Helvetica", "center")
        draw_card(
            c,
            486,
            272,
            428,
            158,
            "WRITE THE QUESTION FIRST",
            [
                "Which landing pad fills the camera view?",
                "Is the floor clear or blocked?",
                "Which classroom zone is below the drone?",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            486,
            87,
            428,
            160,
            "ALWAYS INCLUDE A NEGATIVE",
            [
                "none, background or clear floor.",
                "Without it, the model must choose an object class.",
                "Avoid labels that look nearly identical.",
                "Use whole-frame categories, not tiny-object location.",
            ],
            CORAL,
            white,
            14,
            10.5,
        )

    def collect(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Collect a balanced, realistic dataset", "Camera viewpoint matters")
        variations = [
            ("ANGLE", -14, TEAL),
            ("DISTANCE", 0, GOLD),
            ("ROTATION", 18, CORAL),
            ("LIGHT", 0, TEAL_DARK),
            ("SHADOW", -8, GOLD),
            ("BACKGROUND", 11, CORAL),
        ]
        for index, (label, rotation, accent) in enumerate(variations):
            column = index % 3
            row = index // 3
            x = 46 + column * 292
            y = 260 - row * 171
            rounded_panel(c, x, y, 274, 145, white, LINE, 14)
            rounded_panel(c, x + 14, y + 106, 92, 24, accent, None, 7)
            draw_text(c, label, x + 60, y + 114, 8, white, "Helvetica-Bold", "center")
            set_fill(c, HexColor("#223642") if label != "LIGHT" else HexColor("#88969D"))
            c.rect(x + 24, y + 19, 226, 78, fill=1, stroke=0)
            c.saveState()
            c.translate(x + 137, y + 58)
            c.rotate(rotation)
            set_fill(c, HexColor("#F4F0DF"))
            c.rect(-46, -27, 92, 54, fill=1, stroke=0)
            c.restoreState()
        rounded_panel(c, 46, 53, 868, 52, NAVY, None, 12)
        draw_text(c, "Use similar sample counts per class and hold out examples you did not train on.", 480, 73, 11, TEAL, "Helvetica-Bold", "center")

    def train(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Train, then validate on unseen views", "Transfer learning")
        draw_process(
            c,
            [
                ("Open", "Teachable Machine Image Project."),
                ("Capture", "Examples for every class."),
                ("Train", "Browser fine-tunes a classifier."),
                ("Preview", "Try live and held-out images."),
                ("Improve", "Collect failures and retrain."),
            ],
            46,
            288,
            868,
            142,
            TEAL,
        )
        rounded_panel(c, 46, 84, 412, 165, white, LINE, 14)
        draw_text(c, "TRAINING PREVIEW IS NOT ENOUGH", 252, 216, 11, CORAL, "Helvetica-Bold", "center")
        draw_bullets(
            c,
            [
                "Test a new room area and a new lighting condition.",
                "Move the target through the full camera field.",
                "Test the negative class more often than feels necessary.",
            ],
            70,
            183,
            364,
            10.5,
            5,
            CORAL,
            INK,
        )
        rounded_panel(c, 486, 84, 428, 165, NAVY, None, 14)
        draw_text(c, "TRANSFER LEARNING", 700, 216, 11, TEAL, "Helvetica-Bold", "center")
        draw_wrapped(
            c,
            "A pretrained feature extractor already recognizes useful image patterns. Training adjusts a smaller final classifier for your labels.",
            520,
            181,
            360,
            11,
            15,
            HexColor("#D5E3E9"),
            "Helvetica",
        )

    def export(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Export the standard TensorFlow.js files", "The required trio")
        draw_process(
            c,
            [
                ("Export Model", "Choose TensorFlow.js."),
                ("Download", "Download my model."),
                ("Unzip", "Keep the three files together."),
            ],
            46,
            306,
            868,
            124,
            TEAL,
        )
        folder_x, folder_y = 228, 82
        rounded_panel(c, folder_x, folder_y, 504, 185, LIGHT_GOLD, HexColor("#DED09B"), 18)
        set_fill(c, GOLD)
        c.roundRect(folder_x + 28, folder_y + 150, 170, 55, 12, fill=1, stroke=0)
        draw_text(c, "hopper-model/", folder_x + 52, folder_y + 171, 12, white, "Courier-Bold")
        files = [
            ("model.json", "network structure"),
            ("weights.bin", "learned parameters"),
            ("metadata.json", "labels + project metadata"),
        ]
        y = folder_y + 117
        for filename, note in files:
            rounded_panel(c, folder_x + 40, y - 16, 424, 38, white, None, 8)
            draw_text(c, filename, folder_x + 60, y - 2, 11, NAVY, "Courier-Bold")
            draw_text(c, note, folder_x + 226, y - 2, 10, MUTED, "Helvetica")
            y -= 47
        draw_text(c, "Not supported: .tflite, embedded export or only one of the three files.", 480, 53, 10, CORAL, "Helvetica-Bold", "center")

    def load(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Load the model into Hopper Studio", "Local app workflow")
        draw_process(
            c,
            [
                ("Connect", "Use simulator or readable camera feed."),
                ("Open Vision", "Find Teachable Machine in Object Detector."),
                ("Load Model", "Select all three files together."),
                ("Confirm", "Class labels appear in the panel."),
                ("Scan", "Test once before flight code."),
            ],
            46,
            282,
            868,
            148,
            TEAL,
        )
        rounded_panel(c, 46, 81, 868, 158, NAVY, None, 17)
        draw_text(c, "IMPORTANT: THE MODEL IS NOT FLASHED INTO THE AIRCRAFT", 480, 196, 12, CORAL, "Helvetica-Bold", "center")
        draw_text(c, "Hopper Studio loads the files into browser/app memory and runs inference on this computer.", 480, 158, 13, white, "Helvetica-Bold", "center")
        draw_text(c, "Reload after refresh. The model files are not persisted or uploaded to a cloud service.", 480, 122, 10.5, HexColor("#C9DAE2"), "Helvetica", "center")
        draw_pill(c, "MODEL.JSON", 283, 90, LIGHT_TEAL, TEAL_DARK)
        draw_pill(c, "WEIGHTS.BIN", 421, 90, LIGHT_GOLD, GOLD)
        draw_pill(c, "METADATA.JSON", 568, 90, LIGHT_CORAL, CORAL)

    def use(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Use the custom class in blocks or JavaScript", "Whole-frame probability")
        draw_block(c, 46, 340, 410, "custom model sees red pad at 75% confidence", GOLD, 48)
        draw_code_window(
            c,
            46,
            87,
            488,
            215,
            [
                [(f"const ", TEAL), ("redPad = ", CODE_TEXT), (f"await ", GOLD)],
                [("  ", CODE_TEXT), ('vision.seesCustomLabel("red pad", 0.75);', CODE_TEXT)],
                [(f"if ", GOLD), ("(redPad) {", CODE_TEXT)],
                [("  ", CODE_TEXT), (f"await ", GOLD), ("drone.hover();", CODE_TEXT)],
                [("  ", CODE_TEXT), (f"await ", GOLD), ("drone.land();", CODE_TEXT)],
                [("}", CODE_TEXT)],
            ],
            "CUSTOM CLASS CHECK",
            9.2,
        )
        draw_card(
            c,
            570,
            266,
            344,
            164,
            "WHAT YOU GET",
            [
                "className + probability for every class.",
                "Exact class-name match, case-insensitive.",
                "No bounding box, x/y or multiple-object location.",
            ],
            TEAL,
            white,
            13,
            10,
        )
        draw_card(
            c,
            570,
            87,
            344,
            157,
            "FRESH SCAN",
            [
                "seesCustomLabel captures a new frame.",
                "Confidence in JavaScript is 0..1.",
                "Scanning includes animation + inference time.",
                "Do not use it as a high-rate control sensor.",
            ],
            CORAL,
            white,
            13,
            9.7,
        )

    def improve(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Treat every failure as new training data", "Iterative validation")
        draw_process(
            c,
            [
                ("Test", "Run with propellers removed or simulator first."),
                ("Record", "Save false positives and misses."),
                ("Label", "Add them to the correct class."),
                ("Balance", "Keep class counts and variation similar."),
                ("Retrain", "Export and load a new version."),
            ],
            46,
            283,
            868,
            147,
            TEAL,
        )
        draw_card(
            c,
            46,
            82,
            420,
            158,
            "FLIGHT ACCEPTANCE TEST",
            [
                "Target class succeeds across distance/rotation.",
                "Negative class rejects empty floor.",
                "No single lighting condition dominates.",
                "Threshold chosen from measured errors.",
            ],
            GOLD,
            white,
            13,
            10.2,
        )
        draw_sources(
            c,
            [
                ("Google Teachable Machine", "https://teachablemachine.withgoogle.com/train"),
                ("TensorFlow.js transfer learning overview", "https://codelabs.developers.google.com/tensorflowjs-transfer-learning-teachable-machine"),
                ("Hopper Studio custom-model implementation", "lib/vision.ts and README.md"),
            ],
            496,
            226,
            418,
        )

    renderers = (cover, classes, collect, train, export, load, use, improve)
    return Deck("07-teachable-machine-models.pdf", title, short, renderers)


def apriltag_deck() -> Deck:
    title = "AprilTags with Hopper"
    short = "AprilTags"

    def cover(c: canvas.Canvas, context: PageContext) -> None:
        set_fill(c, NAVY)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        set_fill(c, TEAL)
        c.rect(0, H - 8, W, 8, fill=1, stroke=0)
        rounded_panel(c, 46, H - 155, 286, 108, white, None, 14)
        draw_image_contain(c, LOGO_FULL, 64, H - 145, 250, 88)
        draw_text(c, "HOPPER INFORMATION SERIES", 48, 337, 10, TEAL, "Helvetica-Bold")
        draw_text(c, "08 / FIDUCIAL MARKERS", 48, 315, 9, GOLD, "Helvetica-Bold")
        draw_text(c, "AprilTags", 48, 255, 48, white, "Helvetica-Bold")
        draw_text(c, "with Hopper", 48, 207, 41, TEAL, "Helvetica-Bold")
        draw_wrapped(c, "Visual IDs for detection, centering and 2D heading alignment.", 48, 166, 410, 16, 21, HexColor("#D4E2E8"))
        rounded_panel(c, 576, 80, 310, 380, white, None, 24)
        draw_apriltag(c, 0, 626, 160, 210, True)
        draw_text(c, "tag36h11", 731, 417, 16, NAVY, "Helvetica-Bold", "center")
        draw_text(c, "ID + orientation", 731, 125, 11, TEAL_DARK, "Helvetica-Bold", "center")
        rounded_panel(c, W - 82, 18, 36, 42, white, None, 8)
        draw_image_contain(c, LOGO_EMBLEM, W - 76, 22, 24, 34)
        draw_text(c, f"DECK {context.number:02d}  |  {context.total} SLIDES", 48, 20, 8, HexColor("#9CB1BF"), "Helvetica-Bold")

    def anatomy(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "A visual ID designed for robots", "Tag anatomy")
        draw_apriltag(c, 0, 88, 111, 306, True)
        draw_callout(c, 90, 390, 476, 404, "White quiet zone", "Keep this margin clear")
        draw_callout(c, 135, 350, 476, 342, "Black border", "Makes a square candidate")
        draw_callout(c, 244, 272, 476, 278, "Data cells", "Encode ID with error separation")
        draw_callout(c, 352, 168, 476, 214, "Orientation", "Pattern defines rotation")
        draw_card(
            c,
            610,
            246,
            304,
            184,
            "HOPPER FAMILY",
            [
                "tag36h11",
                "IDs 0 through 586",
                "Black and white only",
                "Up to 3 payload-bit errors accepted",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            610,
            86,
            304,
            136,
            "WHY FIDUCIALS",
            [
                "Known geometry.",
                "Unique machine-readable ID.",
                "Orientation from one image.",
                "No battery or radio on the tag.",
            ],
            GOLD,
            white,
            14,
            10,
        )

    def detection(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "How Hopper Studio detects a tag", "Local tag36h11 pipeline")
        draw_process(
            c,
            [
                ("Grayscale", "Convert RGB camera pixels to luminance."),
                ("Threshold", "Estimate a black/white split."),
                ("Squares", "Find connected dark square candidates."),
                ("Sample", "Map each candidate into an 8x8 grid."),
                ("Match", "Compare rotations with the codebook."),
                ("Pose", "Return ID, corners, center and 2D yaw."),
            ],
            46,
            285,
            868,
            145,
            TEAL,
        )
        rounded_panel(c, 46, 82, 868, 160, NAVY, None, 17)
        draw_apriltag(c, 19, 74, 106, 112, True)
        draw_arrow(c, 210, 161, 272, 161, TEAL, 3, 9)
        set_stroke(c, CORAL, 3)
        c.rect(300, 109, 112, 112, fill=0, stroke=1)
        draw_text(c, "candidate corners", 356, 91, 8.5, HexColor("#C7DCE4"), "Helvetica-Bold", "center")
        draw_arrow(c, 436, 161, 498, 161, TEAL, 3, 9)
        draw_text(c, "ID 19", 570, 175, 19, white, "Helvetica-Bold", "center")
        draw_text(c, "hamming 0", 570, 145, 11, TEAL, "Courier-Bold", "center")
        draw_arrow(c, 636, 161, 696, 161, TEAL, 3, 9)
        draw_text(c, "X / Y / YAW", 803, 170, 15, GOLD, "Helvetica-Bold", "center")
        draw_text(c, "2D image geometry", 803, 139, 10, HexColor("#C7DCE4"), "Helvetica", "center")

    def pose(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Coordinates and pose in Hopper Studio", "What the result means")
        draw_camera_frame(c, 46, 91, 510, 339, tag=True)
        draw_arrow(c, 301, 260, 404, 260, CORAL, 4, 10, "+X")
        draw_arrow(c, 301, 260, 301, 368, TEAL, 4, 10, "+Y", (22, 0))
        set_stroke(c, GOLD, 4)
        c.arc(242, 200, 360, 318, 30, 95)
        draw_text(c, "yaw", 373, 336, 11, GOLD, "Helvetica-Bold")
        draw_card(
            c,
            588,
            262,
            326,
            168,
            "APRILTAG RESULT",
            [
                "id + family + hamming",
                "four corners + center in pixels",
                "bounding box",
                "centerX / centerY: -100..100",
                "yaw: normalized around +/-180 deg",
            ],
            TEAL,
            white,
            13,
            9.7,
        )
        draw_card(
            c,
            588,
            91,
            326,
            147,
            "DO NOT OVERCLAIM",
            [
                "Yaw is 2D image-plane orientation.",
                "It is not full 3D pose or aircraft heading.",
                "No distance or altitude is returned.",
                "centerOnAprilTag never lands.",
            ],
            CORAL,
            white,
            13,
            9.7,
        )

    def print_place(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Print cleanly and place deliberately", "Physical tag setup")
        draw_apriltag(c, 7, 70, 109, 298, True)
        draw_card(
            c,
            410,
            266,
            504,
            164,
            "PRINT IN HOPPER STUDIO",
            [
                "Vision Testing -> AprilTag Detection.",
                "Choose an ID from 0-586.",
                "Generate PDF for a full-page US Letter vector tag.",
                "Print at 100% scale with a clean white margin.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_card(
            c,
            410,
            91,
            504,
            151,
            "PLACE FOR THE CAMERA",
            [
                "Keep the sheet flat and well lit.",
                "Avoid glare, folds, shadows and clipped margins.",
                "Start large and close; test before increasing height.",
                "Keep paper and people clear of propellers.",
            ],
            GOLD,
            white,
            14,
            10.5,
        )

    def blocks(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Three block patterns support tag missions", "Scan, test, center")
        draw_block(c, 46, 362, 300, "scan for april tags", TEAL_DARK, 48)
        draw_wrapped(c, "Fresh scan. Replaces the latest tag list and updates the overlay.", 46, 343, 300, 9.5, 12, MUTED)
        draw_block(c, 366, 362, 548, "camera sees april tag with ID any / 0-586", TEAL_DARK, 48)
        draw_wrapped(c, "Fresh scan. Boolean true when the requested ID is present.", 366, 343, 548, 9.5, 12, MUTED)
        draw_block(c, 46, 252, 868, "center on april tag [ID] at [power]%  |  center slack  |  angle slack  |  lost searches", NAVY, 48)
        draw_process(
            c,
            [
                ("Scan", "Choose requested or nearest tag."),
                ("Translate", "Correct larger x/y error."),
                ("Stabilize", "Reset and wait."),
                ("Align", "Timed yaw correction."),
                ("Finish", "True when centered + aligned."),
            ],
            46,
            85,
            868,
            130,
            TEAL,
        )
        draw_text(c, "Defaults: 10% power | +/-5% center | +/-5 deg angle | 3 lost scans | 30 s hard timeout", 480, 54, 9.5, CORAL, "Helvetica-Bold", "center")

    def missions(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "AprilTags become visual landmarks", "Mission patterns")
        missions = [
            ("CENTERING PAD", "Center the camera over one ID, then explicitly land.", TEAL),
            ("ZONE ID", "Use different IDs for room regions or task stations.", GOLD),
            ("HEADING CUE", "Align the drone's forward axis with the tag x-axis.", CORAL),
            ("SEARCH", "Lawnmower scan until any tag or one requested ID appears.", TEAL_DARK),
            ("SEQUENCE", "Visit IDs in a planned order with a timeout at each.", GOLD),
            ("VERIFY", "Require repeated ID/pose agreement before motion.", CORAL),
        ]
        for index, (card_title, body, accent) in enumerate(missions):
            column = index % 3
            row = index // 3
            draw_card(c, 46 + column * 292, 260 - row * 169, 274, 146, card_title, body, accent, white, 12, 10.2)
        draw_text(c, "A tag is a relative visual landmark - not GPS, altitude or collision avoidance.", 480, 54, 10.5, CORAL, "Helvetica-Bold", "center")

    def sources(c: canvas.Canvas, context: PageContext) -> None:
        page_chrome(c, context, "Reliable tags need reliable experiments", "Checklist and sources")
        draw_card(
            c,
            46,
            244,
            420,
            186,
            "BEFORE FLIGHT",
            [
                "Confirm the family is tag36h11.",
                "Test the intended ID, size, angle and lighting.",
                "Keep the full border and quiet zone in frame.",
                "Use a lost-tag limit and an overall timeout.",
                "Plan a safe fallback land.",
            ],
            TEAL,
            white,
            14,
            10.5,
        )
        draw_sources(
            c,
            [
                ("University of Michigan APRIL Lab - AprilTag", "https://april.eecs.umich.edu/software/apriltag"),
                ("AprilTag 2 paper", "https://april.eecs.umich.edu/media/pdfs/wang2016iros.pdf"),
                ("Hopper Studio detector and printable tag generator", "lib/apriltags.ts, lib/vision.ts and README.md"),
            ],
            496,
            414,
            418,
        )
        rounded_panel(c, 46, 82, 868, 124, NAVY, None, 16)
        draw_text(c, "DETECT  ->  CENTER  ->  ALIGN  ->  DECIDE", 480, 151, 19, TEAL, "Helvetica-Bold", "center")
        draw_text(c, "The mission still owns height, obstacle clearance and landing.", 480, 112, 11, HexColor("#D0E0E6"), "Helvetica", "center")

    renderers = (cover, anatomy, detection, pose, print_place, blocks, missions, sources)
    return Deck("08-apriltags-with-hopper.pdf", title, short, renderers)


def build_deck(deck: Deck, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(
        str(destination),
        pagesize=(W, H),
        pageCompression=1,
        invariant=1,
    )
    pdf.setTitle(f"WRC Hopper Information - {deck.title}")
    pdf.setAuthor("Weapons, Robotics and Control Engineering - United States Naval Academy")
    pdf.setSubject("Hopper Studio classroom information slides")
    pdf.setCreator("WRC Hopper Studio information deck generator")
    for index, renderer in enumerate(deck.renderers, start=1):
        context = PageContext(deck, index, len(deck.renderers))
        renderer(pdf, context)
        pdf.showPage()
    pdf.save()


def generate_all() -> list[Path]:
    prepare_assets()
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    decks = [
        sensor_deck(),
        aerodynamics_deck(),
        blocks_deck(),
        javascript_deck(),
        threshold_deck(),
        object_detection_deck(),
        teachable_machine_deck(),
        apriltag_deck(),
    ]
    outputs: list[Path] = []
    for deck in decks:
        final_path = FINAL_DIR / deck.filename
        build_deck(deck, final_path)
        public_path = PUBLIC_DIR / deck.filename
        shutil.copy2(final_path, public_path)
        outputs.append(final_path)
        print(f"generated {deck.filename} ({len(deck.renderers)} slides)")
    return outputs


if __name__ == "__main__":
    generate_all()
