#!/usr/bin/env python3
"""Generate the archived Hopper Studio student-facing Python reference PDF."""

from __future__ import annotations

import re
from pathlib import Path

try:
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import Color, HexColor, white
except ModuleNotFoundError:
    from minipdf import Color, HexColor, canvas, stringWidth, white


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parent
OUTPUT = WORKSPACE_ROOT / "output" / "pdf" / "09-python-coding-reference.pdf"

PAGE_W = 960
PAGE_H = 540
NAVY = HexColor("#001B3A")
NAVY_2 = HexColor("#06325A")
TEAL = HexColor("#008C95")
TEAL_LIGHT = HexColor("#DDF4F3")
RED = HexColor("#D64045")
INK = HexColor("#102A43")
MUTED = HexColor("#607681")
LINE = HexColor("#D7E2E8")
PAPER = HexColor("#F5F8FA")
PANEL = white
CODE_TEXT = HexColor("#E5E9E7")
CODE_COMMENT = HexColor("#7892A6")
CODE_KEYWORD = HexColor("#78C7FF")
CODE_STRING = HexColor("#A8E6A1")
CODE_NUMBER = HexColor("#F5C66B")
CODE_FUNCTION = HexColor("#55D6C2")
LIGHT_CODE_TEXT = NAVY
LIGHT_CODE_COMMENT = MUTED
LIGHT_CODE_KEYWORD = HexColor("#315A91")
LIGHT_CODE_STRING = HexColor("#2E7D45")
LIGHT_CODE_NUMBER = HexColor("#9A6B00")
LIGHT_CODE_FUNCTION = HexColor("#007986")

PYTHON_KEYWORDS = {
    "False",
    "None",
    "True",
    "and",
    "as",
    "break",
    "continue",
    "def",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "if",
    "in",
    "is",
    "not",
    "or",
    "pass",
    "return",
    "try",
    "while",
}

PYTHON_TOKEN_PATTERN = re.compile(
    r"""
    (?P<comment>\#[^\n]*)
    |(?P<string>f?'''(?:\\.|[^']|'(?!'')|''(?!'))*'''|f?\"\"\"(?:\\.|[^\"]|\"(?!\"\")|\"\"(?!\"))*\"\"\"|f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*')
    |(?P<number>\b(?:0[xX][0-9A-Fa-f]+|\d+(?:\.\d+)?)\b)
    |(?P<identifier>[A-Za-z_][A-Za-z0-9_]*)
    |(?P<space>\s+)
    |(?P<punct>.)
    """,
    re.VERBOSE,
)


def top(value: float) -> float:
    return PAGE_H - value


def set_font(c: canvas.Canvas, name: str, size: float, color: Color = INK) -> None:
    c.setFont(name, size)
    c.setFillColor(color)


def fit_text(text: str, font: str, size: float, width: float) -> float:
    while size > 6 and stringWidth(text, font, size) > width:
        size -= 0.25
    return size


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def paragraph(
    c: canvas.Canvas,
    text: str,
    x: float,
    y_top: float,
    width: float,
    size: float = 11,
    leading: float = 15,
    color: Color = MUTED,
    font: str = "Helvetica",
) -> float:
    y = top(y_top)
    set_font(c, font, size, color)
    for line in wrap(text, font, size, width):
        c.drawString(x, y, line)
        y -= leading
    return PAGE_H - y


def rounded_panel(
    c: canvas.Canvas,
    x: float,
    y_top: float,
    width: float,
    height: float,
    fill: Color = PANEL,
    stroke: Color = LINE,
    radius: float = 12,
) -> None:
    y = top(y_top + height)
    c.setFillColor(HexColor("#DCE5EA"))
    c.roundRect(x + 2, y - 3, width, height, radius, fill=1, stroke=0)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, radius, fill=1, stroke=1)


def header(
    c: canvas.Canvas,
    section: str,
    title: str,
    subtitle: str,
    page: int,
    total: int,
) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.rect(0, top(9), PAGE_W, 9, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, top(13), PAGE_W, 4, fill=1, stroke=0)
    set_font(c, "Helvetica-Bold", 9, TEAL)
    c.drawString(54, top(38), f"PYTHON CODING / {section}")
    set_font(c, "Helvetica-Bold", fit_text(title, "Helvetica-Bold", 27, 790), INK)
    c.drawString(54, top(72), title)
    paragraph(c, subtitle, 55, 88, 790, 10.5, 14, MUTED)
    set_font(c, "Courier-Bold", 9, MUTED)
    c.drawRightString(906, top(39), f"{page:02d} / {total:02d}")


def footer(c: canvas.Canvas, page: int, total: int) -> None:
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(54, 31, 906, 31)
    set_font(c, "Helvetica-Bold", 7.5, MUTED)
    c.drawString(54, 18, "WRC | HOPPER FLIGHT + VISION INFORMATION SERIES")
    set_font(c, "Courier-Bold", 7.5, MUTED)
    c.drawRightString(906, 18, f"{page}/{total}")


def label(c: canvas.Canvas, text: str, x: float, y_top: float, color: Color = TEAL) -> None:
    set_font(c, "Helvetica-Bold", 8, color)
    c.drawString(x, top(y_top), text.upper())


def python_tokens(source: str) -> list[tuple[str, Color]]:
    """Tokenize one documented Python line using the Hopper editor palette."""
    output: list[tuple[str, Color]] = []
    matches = list(PYTHON_TOKEN_PATTERN.finditer(source))
    for index, match in enumerate(matches):
        text = match.group(0)
        kind = match.lastgroup
        if kind == "comment":
            color = LIGHT_CODE_COMMENT
        elif kind == "string":
            color = LIGHT_CODE_STRING
        elif kind == "number":
            color = LIGHT_CODE_NUMBER
        elif kind == "identifier" and text in PYTHON_KEYWORDS:
            color = LIGHT_CODE_KEYWORD
        elif kind == "identifier":
            next_text = ""
            for later in matches[index + 1:]:
                if later.lastgroup != "space":
                    next_text = later.group(0)
                    break
            color = LIGHT_CODE_FUNCTION if next_text == "(" else LIGHT_CODE_TEXT
        else:
            color = LIGHT_CODE_TEXT
        if output and output[-1][1] == color:
            output[-1] = (output[-1][0] + text, color)
        else:
            output.append((text, color))
    return output


def draw_inline_python(
    c: canvas.Canvas,
    source: str,
    x: float,
    y_top: float,
    maximum_width: float,
    size: float = 8.8,
) -> None:
    font = "Courier-Bold"
    fitted = fit_text(source, font, size, maximum_width)
    fitted = max(7.0, fitted)
    cursor = x
    for segment, color in python_tokens(source):
        set_font(c, font, fitted, color)
        c.drawString(cursor, top(y_top), segment)
        cursor += stringWidth(segment, font, fitted)


def command_rows(
    c: canvas.Canvas,
    rows: list[tuple[str, str]],
    x: float,
    y_top: float,
    width: float,
    row_height: float = 37,
) -> None:
    y = y_top
    for command, explanation in rows:
        rounded_panel(c, x, y, width, row_height - 5, PANEL, LINE, 7)
        draw_inline_python(c, command, x + 12, y + 13, width - 24, 8.8)
        lines = wrap(explanation, "Helvetica", 7.35, width - 24)
        set_font(c, "Helvetica", 7.35, MUTED)
        for line_index, line in enumerate(lines[:2]):
            c.drawString(x + 12, top(y + 27 + line_index * 8.6), line)
        y += row_height


def code_block(
    c: canvas.Canvas,
    code: list[tuple[str, list[tuple[str, Color]]]],
    x: float,
    y_top: float,
    width: float,
    height: float,
    caption: str = "PYTHON",
) -> None:
    c.setFillColor(NAVY)
    c.roundRect(x, top(y_top + height), width, height, 10, fill=1, stroke=0)
    c.setFillColor(NAVY_2)
    c.roundRect(x, top(y_top + 27), width, 27, 10, fill=1, stroke=0)
    c.rect(x, top(y_top + 27), width, 12, fill=1, stroke=0)
    set_font(c, "Helvetica-Bold", 7.5, TEAL_LIGHT)
    c.drawString(x + 13, top(y_top + 17), caption)
    line_y = y_top + 48
    for number, segments in code:
        set_font(c, "Courier", 8.7, CODE_COMMENT)
        c.drawRightString(x + 29, top(line_y), number)
        cursor = x + 42
        for text, color in segments:
            set_font(c, "Courier", 8.7, color)
            c.drawString(cursor, top(line_y), text)
            cursor += stringWidth(text, "Courier", 8.7)
        line_y += 15.2


def note_panel(
    c: canvas.Canvas,
    heading: str,
    text: str,
    x: float,
    y_top: float,
    width: float,
    height: float,
    accent: Color = TEAL,
) -> None:
    rounded_panel(c, x, y_top, width, height, PANEL, LINE, 10)
    c.setFillColor(accent)
    c.roundRect(x, top(y_top + height), 7, height, 4, fill=1, stroke=0)
    label(c, heading, x + 18, y_top + 22, accent)
    paragraph(c, text, x + 18, y_top + 40, width - 34, 9, 12, MUTED)


def page_cover(c: canvas.Canvas, total: int) -> None:
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(NAVY_2)
    c.circle(840, 440, 210, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.circle(835, 445, 126, fill=1, stroke=0)
    c.setFillColor(HexColor("#00AEB7"))
    c.circle(835, 445, 76, fill=1, stroke=0)
    set_font(c, "Courier-Bold", 10, TEAL_LIGHT)
    c.drawString(62, top(66), "HOPPER INFORMATION SERIES")
    set_font(c, "Helvetica-Bold", 38, white)
    c.drawString(62, top(146), "Python coding reference")
    paragraph(
        c,
        "A classroom-friendly language surface for flight, vision, decisions, loops, and safe missions.",
        64,
        176,
        590,
        16,
        22,
        TEAL_LIGHT,
    )
    pills = ["NO INSTALL", "AUTOMATIC WAITING", "LOCAL TRANSLATION", "SIM + REAL"]
    x = 64
    for pill in pills:
        width = stringWidth(pill, "Helvetica-Bold", 8) + 24
        c.setFillColor(Color(1, 1, 1, alpha=0.08))
        c.roundRect(x, top(277), width, 27, 13, fill=1, stroke=0)
        set_font(c, "Helvetica-Bold", 8, white)
        c.drawString(x + 12, top(260), pill)
        x += width + 9
    code_block(
        c,
        [
            ("1", [("# First flight", CODE_COMMENT)]),
            ("2", [("take_off", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("3", [("fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("1", CODE_NUMBER), (", ", CODE_TEXT), ("15", CODE_NUMBER), (")", CODE_TEXT)]),
            ("4", [("land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        62,
        326,
        520,
        126,
        "FIRST-FLIGHT.PY",
    )
    set_font(c, "Helvetica-Bold", 8, TEAL_LIGHT)
    c.drawString(64, 34, "WRC | HOPPER FLIGHT + VISION INFORMATION SERIES")
    set_font(c, "Courier-Bold", 8, TEAL_LIGHT)
    c.drawRightString(896, 34, f"09 / {total:02d}")
    c.showPage()


def page_first_program(c: canvas.Canvas, page: int, total: int) -> None:
    header(
        c,
        "02",
        "Write Python; Hopper runs the proven flight engine",
        "The Python tab translates a focused classroom subset locally. Bluetooth, Wi-Fi vision, the simulator, Stop & Land, and the camera gallery still use the same app runtime.",
        page,
        total,
    )
    code_block(
        c,
        [
            ("1", [("# Commands wait automatically.", CODE_COMMENT)]),
            ("2", [("take_off", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("3", [("", CODE_TEXT)]),
            ("4", [("try", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("5", [("    fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("1", CODE_NUMBER), (", ", CODE_TEXT), ("15", CODE_NUMBER), (")", CODE_TEXT)]),
            ("6", [("    hover", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("7", [("    take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("8", [("finally", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("9", [("    land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        54,
        133,
        495,
        222,
        "SAFE-FIRST-MISSION.PY",
    )
    note_panel(
        c,
        "What the app handles",
        "Promise-returning drone and vision calls receive automatic waiting. Indentation becomes nested program structure. A syntax problem is reported with its Python line number before the motors start.",
        573,
        133,
        333,
        102,
    )
    note_panel(
        c,
        "What students write",
        "Use four spaces for each level. End if, elif, else, while, for, def, try, except, and finally headers with a colon. Press Tab or Enter after a colon and the editor inserts the indentation.",
        573,
        249,
        333,
        106,
        NAVY_2,
    )
    note_panel(
        c,
        "Important",
        'Do not write await, import modules, or paste ordinary desktop Python libraries. This is Hopper Python: a deliberately small surface that runs inside the browser or desktop app.',
        54,
        375,
        852,
        80,
        RED,
    )
    footer(c, page, total)
    c.showPage()


def page_flight(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "03", "Flight lifecycle and timed motion", "Seconds, degrees, directions, and power percentages are explicit so missions are easy to read and review.", page, total)
    command_rows(
        c,
        [
            ("take_off()", "No args. Auto-awaits; returns None. Low battery (<=10%) or Bluetooth failure raises; a stopped run returns early."),
            ("land()", "No args. Auto-awaits; returns None after the landing wait. Bluetooth/transport failure raises."),
            ("hover()", "No args. Auto-awaits; zeros every motion axis, waits about 1 s, and returns None."),
            ("wait(seconds)", "seconds: number >=0; required. Auto-awaits and returns None; negative/non-number becomes 0; Stop ends the wait early."),
            ('fly(direction, seconds=1, power=15)', 'direction: six strings; seconds >=0; power clamps -100..100. Auto-awaits, returns None; transport failure raises.'),
        ],
        54,
        132,
        414,
        48,
    )
    command_rows(
        c,
        [
            ('rotate(degrees=0, direction="clockwise")', 'degrees: number >=0; direction: "clockwise"/"counterclockwise". Auto-awaits; returns None; open-loop timing.'),
            ('flip(direction)', 'direction: forward/backward/left/right; required. Auto-awaits; returns None; a missing acknowledgement raises.'),
            ('set_axis(axis, power)', 'axis: pitch/roll/yaw/gaz/altitude; power clamps -100..100. Returns None immediately; persists until reset.'),
            ("reset_motion()", "No args. Returns None synchronously; zeros persistent axes and does not land."),
            ("emergency_cutoff()", "No args. Auto-awaits; returns None. Immediate motor cutoff only; Bluetooth failure raises."),
        ],
        492,
        132,
        414,
        48,
    )
    note_panel(c, "Directions and safety", "fly direction is up/down/left/right/forward/backward. flip uses forward/backward/left/right. Test short, low-power moves first; put land() in finally after take_off().", 54, 390, 852, 65, RED)
    footer(c, page, total)
    c.showPage()


def page_state_accessories(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "04", "State, photos, and accessories", "Return values can be stored in variables and tested in decisions. Photo capture saves the current camera frame to the session gallery.", page, total)
    command_rows(
        c,
        [
            ("battery_level()", "No args. Returns number 0..100 or None before telemetry; synchronous and no expected failure."),
            ("is_flying()", "No args. Returns bool from the controller's flying/landed state; synchronous."),
            ("is_landed()", "No args. Returns bool from the controller's flying/landed state; synchronous."),
            ("wait_for_battery_change()", "No args. Auto-awaits; returns None on a new value or Stop; transport loss may raise."),
            ("take_photo()", "No args. Auto-awaits; returns None after requesting a photo; camera/transport failure raises."),
        ],
        54,
        132,
        414,
        48,
    )
    command_rows(
        c,
        [
            ("open_grabber()", "No args. Auto-awaits; returns None. Raises if no physical grabber is attached; simulator is a timing stub."),
            ("close_grabber()", "No args. Auto-awaits; returns None. Raises if no physical grabber is attached; simulator is a timing stub."),
            ("fire_gun()", "No args. Auto-awaits; returns None. Raises if no physical cannon is attached; simulator is a timing stub."),
            ('key_pressed(key)', "key: string such as ArrowUp or a. Returns live bool synchronously; no expected failure."),
            ("stopped()", "No args. Returns bool synchronously; True after runtime cancellation. It does not itself land."),
        ],
        492,
        132,
        414,
        48,
    )
    code_block(
        c,
        [
            ("1", [("battery = ", CODE_TEXT), ("battery_level", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("2", [("if", CODE_KEYWORD), (" battery ", CODE_TEXT), ("is not", CODE_KEYWORD), (" ", CODE_TEXT), ("None", CODE_KEYWORD), (" and battery < ", CODE_TEXT), ("25", CODE_NUMBER), (":", CODE_TEXT)]),
            ("3", [("    land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        54,
        385,
        852,
        98,
        "LOW-BATTERY-CHECK.PY",
    )
    footer(c, page, total)
    c.showPage()


def page_threshold(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "05", "Threshold vision and saved photos", "Threshold and coverage use percentages from 0 to 100. Each sees or scan command captures a fresh frame.", page, total)
    command_rows(
        c,
        [
            ("scan_threshold(threshold=60, invert=False)", "threshold: 0..100%; invert: bool. Auto-awaits; returns result record; missing camera raises."),
            ('sees_binary(color, threshold=60, invert=False, coverage=10)', "color: white/black; coverage 0..100%. Auto-awaits a fresh frame; returns bool; camera failure raises."),
            ('binary_center(color, threshold=60, invert=False)', "color: white/black; threshold 0..100%. Auto-awaits a fresh frame; returns bool; camera failure raises."),
            ("take_photo()", "No args. Auto-awaits; returns None after saving/requesting the current view; camera/transport failure raises."),
        ],
        54,
        137,
        485,
        55,
    )
    code_block(
        c,
        [
            ("1", [("take_off", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("2", [("try", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("3", [("    for", CODE_KEYWORD), (" attempt ", CODE_TEXT), ("in", CODE_KEYWORD), (" ", CODE_TEXT), ("range", CODE_FUNCTION), ("(", CODE_TEXT), ("20", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("4", [("        if", CODE_KEYWORD), (" ", CODE_TEXT), ("binary_center", CODE_FUNCTION), ("(", CODE_TEXT), ('"white"', CODE_STRING), (", ", CODE_TEXT), ("60", CODE_NUMBER), (", ", CODE_TEXT), ("False", CODE_KEYWORD), ("):", CODE_TEXT)]),
            ("5", [("            take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("6", [("            break", CODE_KEYWORD)]),
            ("7", [("        fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("0.4", CODE_NUMBER), (", ", CODE_TEXT), ("12", CODE_NUMBER), (")", CODE_TEXT)]),
            ("8", [("finally", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("9", [("    land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        565,
        137,
        341,
        190,
        "WHITE-PAPER-SEARCH.PY",
    )
    note_panel(c, "Fresh frame + result", "Predicates scan before deciding. scan_threshold() returns threshold, invert, whiteCoverage, blackCoverage, centerWhite, frameWidth, frameHeight, and binaryData.", 565, 344, 341, 93)
    footer(c, page, total)
    c.showPage()


def page_objects(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "06", "COCO objects and custom labels", "Confidence is a fraction from 0 to 1 in Python. The built-in detector draws boxes; Teachable Machine classifies the whole frame.", page, total)
    command_rows(
        c,
        [
            ("load_object_model()", "No args. Auto-awaits; returns model handle. Local-server/model-load failure raises."),
            ("scan_objects(confidence=0.55)", "confidence: 0..1. Auto-awaits; returns up to 10 detection records; model/camera failure raises."),
            ("detect_objects(confidence=0.55)", "Exact alias of scan_objects(). Same confidence, automatic wait, detection-list return, and failure behavior."),
            ('sees_object(label, confidence=0.55)', "label: string; confidence 0..1. Auto-awaits a fresh scan; returns bool; model/camera failure raises."),
            ('object_coordinate(label, axis, confidence=0.55)', "label string; axis x/y. Returns saved -100..100 number synchronously, or 0 when absent/below confidence."),
            ('object_x(label, confidence=0.55)', "label: string; confidence 0..1. Synchronous x shortcut; returns saved -100..100 number or 0."),
            ('object_y(label, confidence=0.55)', "label: string; confidence 0..1. Synchronous y shortcut; returns saved -100..100 number or 0."),
        ],
        54,
        132,
        515,
        43,
    )
    code_block(
        c,
        [
            ("1", [("if", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_object", CODE_FUNCTION), ("(", CODE_TEXT), ('"person"', CODE_STRING), (", confidence=", CODE_TEXT), ("0.45", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("2", [("    x = ", CODE_TEXT), ("object_x", CODE_FUNCTION), ("(", CODE_TEXT), ('"person"', CODE_STRING), (", ", CODE_TEXT), ("0.45", CODE_NUMBER), (")", CODE_TEXT)]),
            ("3", [("    print", CODE_FUNCTION), ("(", CODE_TEXT), ('f"person x = {x}"', CODE_STRING), (")", CODE_TEXT)]),
            ("4", [("", CODE_TEXT)]),
            ("5", [("# Load model files in the UI first.", CODE_COMMENT)]),
            ("6", [("if", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_custom_label", CODE_FUNCTION), ("(", CODE_TEXT), ('"red flag"', CODE_STRING), (", ", CODE_TEXT), ("0.75", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("7", [("    take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        593,
        132,
        313,
        197,
        "OBJECT-DECISIONS.PY",
    )
    command_rows(
        c,
        [
            ("scan_custom_model()", "No args. Auto-awaits; returns class/probability records. Raises until model files are loaded or when camera fails."),
            ('sees_custom_label(label, confidence=0.75)', "label: string; confidence 0..1. Auto-awaits; returns bool; unloaded model/camera failure raises."),
        ],
        593,
        348,
        313,
        48,
    )
    footer(c, page, total)
    c.showPage()


def page_tags(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "07", "AprilTags: detect, decide, and align", "Hopper uses tag36h11 IDs 0 through 586. Use \"any\" when the specific ID does not matter.", page, total)
    command_rows(
        c,
        [
            ("scan_april_tags()", "No args. Auto-awaits; returns detection records; missing camera/canvas raises."),
            ('sees_april_tag(id="any")', 'id: "any" or tag36h11 integer 0..586. Auto-awaits a fresh scan; returns bool; camera failure raises.'),
            ("sees_april_tag(id=42)", "Named-argument example for one ID. Same bool return, automatic waiting, and camera failure behavior."),
            ('center_on_april_tag(id="any", power=10, center_slack=5, angle_slack=5, lost_searches=3)', "power 0..100; slacks 1..35/1..45; lost 1..20. Auto-awaits; bool; false on loss/Stop/30 s timeout."),
        ],
        54,
        140,
        500,
        58,
    )
    code_block(
        c,
        [
            ("1", [("take_off", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("2", [("try", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("3", [("    if", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_april_tag", CODE_FUNCTION), ("(", CODE_TEXT), ("7", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("4", [("        centered = ", CODE_TEXT), ("center_on_april_tag", CODE_FUNCTION), ("(", CODE_TEXT), ("7", CODE_NUMBER), (")", CODE_TEXT)]),
            ("5", [("        if", CODE_KEYWORD), (" centered:", CODE_TEXT)]),
            ("6", [("            take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("7", [("    else", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("8", [("        print", CODE_FUNCTION), ("(", CODE_TEXT), ('"Tag 7 not found"', CODE_STRING), (")", CODE_TEXT)]),
            ("9", [("finally", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("10", [("    land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        580,
        140,
        326,
        215,
        "TAG-MISSION.PY",
    )
    note_panel(c, "Detection return", "Each record includes ID, center x/y on -100..100, image corners, and 2D image yaw. Centering commands roll/pitch/yaw only; they do not control height or land.", 54, 393, 852, 59)
    footer(c, page, total)
    c.showPage()


def page_variables(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "08", "Variables, values, printing, and operators", "A variable is created with =. Python uses True, False, and None; strings may use single or double quotes.", page, total)
    code_block(
        c,
        [
            ("1", [("speed = ", CODE_TEXT), ("15", CODE_NUMBER)]),
            ("2", [("direction = ", CODE_TEXT), ('"forward"', CODE_STRING)]),
            ("3", [("found = ", CODE_TEXT), ("False", CODE_KEYWORD)]),
            ("4", [("", CODE_TEXT)]),
            ("5", [("fly", CODE_FUNCTION), ("(direction, ", CODE_TEXT), ("1", CODE_NUMBER), (", speed)", CODE_TEXT)]),
            ("6", [("found = ", CODE_TEXT), ("sees_object", CODE_FUNCTION), ("(", CODE_TEXT), ('"person"', CODE_STRING), (")", CODE_TEXT)]),
            ("7", [("print", CODE_FUNCTION), ("(", CODE_TEXT), ('f"Found: {found}"', CODE_STRING), (")", CODE_TEXT)]),
        ],
        54,
        135,
        410,
        192,
        "VALUES.PY",
    )
    command_rows(
        c,
        [
            ("print(value)", "value: any; one or more arguments allowed. Returns None after writing to the app console; synchronous."),
            ("len(value)", "value: string/list-like or None. Returns integer length (0 for None); synchronous."),
            ("contains(collection, value)", "collection: string/list/set/map-like; value: any. Returns bool synchronously; unsupported collections return False."),
            ("abs(value), min(value1, value2), max(value1, value2), round(value)", "Numeric arguments. Return numbers synchronously using the browser math helpers; invalid values may produce NaN."),
            ("int(value), float(value), str(value), bool(value)", "value: any. Return converted value synchronously; int truncates; conversion follows JavaScript coercion."),
        ],
        490,
        135,
        416,
        42,
    )
    note_panel(c, "Comparisons", "== equal   != not equal   < <= > >=   is None   is not None", 54, 355, 410, 66)
    note_panel(c, "Boolean logic", "and requires both; or requires either; not reverses True/False. Parentheses make combined decisions easier to read.", 490, 355, 416, 66)
    footer(c, page, total)
    c.showPage()


def page_if(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "09", "Make decisions with if, elif, and else", "Only the first matching branch runs. Every nested line is indented four spaces.", page, total)
    code_block(
        c,
        [
            ("1", [("battery = ", CODE_TEXT), ("battery_level", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("2", [("", CODE_TEXT)]),
            ("3", [("if", CODE_KEYWORD), (" battery ", CODE_TEXT), ("is", CODE_KEYWORD), (" ", CODE_TEXT), ("None", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("4", [("    print", CODE_FUNCTION), ("(", CODE_TEXT), ('"Waiting for battery data"', CODE_STRING), (")", CODE_TEXT)]),
            ("5", [("elif", CODE_KEYWORD), (" battery < ", CODE_TEXT), ("25", CODE_NUMBER), (":", CODE_TEXT)]),
            ("6", [("    print", CODE_FUNCTION), ("(", CODE_TEXT), ('"Battery too low"', CODE_STRING), (")", CODE_TEXT)]),
            ("7", [("    land", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("8", [("else", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("9", [("    take_off", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        54,
        137,
        495,
        230,
        "BATTERY-DECISION.PY",
    )
    code_block(
        c,
        [
            ("1", [("if", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_object", CODE_FUNCTION), ("(", CODE_TEXT), ('"person"', CODE_STRING), (", ", CODE_TEXT), ("0.5", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("2", [("    hover", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("3", [("else", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("4", [("    fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("0.4", CODE_NUMBER), (", ", CODE_TEXT), ("12", CODE_NUMBER), (")", CODE_TEXT)]),
        ],
        573,
        137,
        333,
        116,
        "VISION-DECISION.PY",
    )
    code_block(
        c,
        [
            ("1", [("if", CODE_KEYWORD), (" ", CODE_TEXT), ("is_flying", CODE_FUNCTION), ("() ", CODE_TEXT), ("and not", CODE_KEYWORD), (" ", CODE_TEXT), ("stopped", CODE_FUNCTION), ("():", CODE_TEXT)]),
            ("2", [("    take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        573,
        272,
        333,
        83,
        "COMBINE-TESTS.PY",
    )
    note_panel(c, "Common error", "A missing colon or inconsistent indentation stops translation before the flight run begins. The console points to the Python line.", 54, 392, 852, 61, RED)
    footer(c, page, total)
    c.showPage()


def page_loops(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "10", "Repeat with for and safe while loops", "Loops yield control between passes so the red Stop & Land button remains responsive.", page, total)
    code_block(
        c,
        [
            ("1", [("# Repeat exactly four times.", CODE_COMMENT)]),
            ("2", [("for", CODE_KEYWORD), (" step ", CODE_TEXT), ("in", CODE_KEYWORD), (" ", CODE_TEXT), ("range", CODE_FUNCTION), ("(", CODE_TEXT), ("4", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("3", [("    fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("0.5", CODE_NUMBER), (", ", CODE_TEXT), ("12", CODE_NUMBER), (")", CODE_TEXT)]),
            ("4", [("    rotate", CODE_FUNCTION), ("(", CODE_TEXT), ("90", CODE_NUMBER), (")", CODE_TEXT)]),
        ],
        54,
        137,
        395,
        144,
        "FOR-LOOP.PY",
    )
    code_block(
        c,
        [
            ("1", [("# Repeat until found or stopped.", CODE_COMMENT)]),
            ("2", [("while", CODE_KEYWORD), (" ", CODE_TEXT), ("not", CODE_KEYWORD), (" ", CODE_TEXT), ("stopped", CODE_FUNCTION), ("():", CODE_TEXT)]),
            ("3", [("    if", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_object", CODE_FUNCTION), ("(", CODE_TEXT), ('"stop sign"', CODE_STRING), ("):", CODE_TEXT)]),
            ("4", [("        hover", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("5", [("        break", CODE_KEYWORD)]),
            ("6", [("    fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("0.4", CODE_NUMBER), (", ", CODE_TEXT), ("10", CODE_NUMBER), (")", CODE_TEXT)]),
        ],
        475,
        137,
        431,
        174,
        "WHILE-LOOP.PY",
    )
    command_rows(
        c,
        [
            ("range(stop)", "stop: finite number. Returns list from 0 to before stop with step 1; range(4) -> 0,1,2,3."),
            ("range(start, stop)", "start/stop: finite numbers. Returns list from start to before stop; range(2, 6) -> 2,3,4,5."),
            ("range(start, stop, step)", "step: finite nonzero number. Returns ascending/descending list; invalid numbers or zero step raise."),
        ],
        54,
        326,
        395,
        38,
    )
    note_panel(c, "Loop controls", "break leaves the nearest loop. continue skips to the next pass. pass is a temporary empty line. Prefer while not stopped(): for open-ended flight searches.", 475, 335, 431, 93, TEAL)
    footer(c, page, total)
    c.showPage()


def page_functions(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "11", "Functions and guaranteed landing", "Use def to name a reusable sequence. Hopper automatically waits when a student-defined function is called.", page, total)
    code_block(
        c,
        [
            ("1", [("def", CODE_KEYWORD), (" search_leg(seconds, power):", CODE_TEXT)]),
            ("2", [("    fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", seconds, power)", CODE_TEXT)]),
            ("3", [("    hover", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("4", [("    return", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_object", CODE_FUNCTION), ("(", CODE_TEXT), ('"person"', CODE_STRING), (")", CODE_TEXT)]),
            ("5", [("", CODE_TEXT)]),
            ("6", [("take_off", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("7", [("try", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("8", [("    found = search_leg(", CODE_TEXT), ("1", CODE_NUMBER), (", ", CODE_TEXT), ("12", CODE_NUMBER), (")", CODE_TEXT)]),
            ("9", [("    print", CODE_FUNCTION), ("(", CODE_TEXT), ('f"Found: {found}"', CODE_STRING), (")", CODE_TEXT)]),
            ("10", [("finally", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("11", [("    land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        54,
        132,
        535,
        262,
        "FUNCTIONS.PY",
    )
    note_panel(c, "def", "Function parameters are simple names. return sends a value back. Calls may appear in an assignment or decision.", 615, 132, 291, 89)
    note_panel(c, "try / finally", "The finally section runs after success or error. Put land() there when a mission could fail after takeoff.", 615, 236, 291, 91, RED)
    note_panel(c, "except", 'Use except Exception as error: to log a problem with print(error), then land in finally.', 615, 342, 291, 71, NAVY_2)
    footer(c, page, total)
    c.showPage()


def page_reference(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "12", "Quick reference: units, rules, and support", "Keep this page nearby during a lab. Use the page map to jump to each fully documented command group.", page, total)
    note_panel(c, "Units", "Power and threshold: 0-100 percent\nConfidence: 0-1 fraction\nTime: seconds\nRotation: degrees\nVision x/y: -100 to +100", 54, 132, 257, 134)
    note_panel(c, "Directions", "fly: up, down, left, right, forward, backward\nflip: forward, backward, left, right\nrotate: clockwise, counterclockwise", 54, 282, 257, 116, NAVY_2)
    note_panel(c, "Python rules", "Four spaces per level. Colon after block headers. Calls stay on one line. No await or import. Use True, False, None, and snake_case command names.", 54, 414, 257, 74, RED)
    note_panel(c, "Flight + state API", "Pages 3-4 document lifecycle, motion, timing, state, photos, accessories, keys, cancellation, argument types/defaults, returns, automatic waiting, and failures.", 333, 132, 273, 130)
    note_panel(c, "Vision API", "Pages 5-7 document thresholding, COCO objects, custom labels, AprilTags, units, defaults, return records, automatic waiting, and camera/model failures.", 333, 278, 273, 108, TEAL)
    note_panel(c, "Language tools", "Pages 8-11 cover values, printing, operators, decisions, bounded loops, functions, return values, and guaranteed landing.", 333, 402, 273, 76, NAVY_2)
    note_panel(c, "Find a command fast", "Flight + timing: p3\nState + accessories: p4\nThreshold: p5\nObjects + custom: p6\nAprilTags: p7\nValues + logic: p8-9\nLoops + functions: p10-11", 628, 132, 278, 196)
    note_panel(c, "Safety", "Use conservative power and short motion times. Test vision while landed. Keep the area clear. Stop & Land remains the operator control; emergency_cutoff is for immediate motor shutdown only.", 628, 344, 278, 108, RED)
    set_font(c, "Helvetica", 7.4, MUTED)
    c.drawString(333, top(492), "Source of truth: lib/python.ts, lib/drone.ts, lib/vision.ts, and lib/runtime.ts")
    footer(c, page, total)
    c.showPage()


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    total = 12
    c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("Hopper Studio Python Coding Reference")
    c.setAuthor("WRC Hopper Studio")
    c.setSubject("Student reference for Hopper Studio Python commands and syntax")

    page_cover(c, total)
    page_first_program(c, 2, total)
    page_flight(c, 3, total)
    page_state_accessories(c, 4, total)
    page_threshold(c, 5, total)
    page_objects(c, 6, total)
    page_tags(c, 7, total)
    page_variables(c, 8, total)
    page_if(c, 9, total)
    page_loops(c, 10, total)
    page_functions(c, 11, total)
    page_reference(c, 12, total)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
