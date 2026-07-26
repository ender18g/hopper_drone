#!/usr/bin/env python3
"""Generate the Hopper Studio student-facing Python reference PDF."""

from __future__ import annotations

import shutil
from pathlib import Path

try:
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import Color, HexColor, white
except ModuleNotFoundError:
    from minipdf import Color, HexColor, canvas, stringWidth, white


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "09-python-coding-reference.pdf"
PUBLIC = ROOT / "public" / "information" / "09-python-coding-reference.pdf"

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
        set_font(c, "Courier-Bold", fit_text(command, "Courier-Bold", 9.4, width * 0.53), NAVY_2)
        c.drawString(x + 12, top(y + 19), command)
        lines = wrap(explanation, "Helvetica", 8.3, width * 0.42)
        set_font(c, "Helvetica", 8.3, MUTED)
        for line_index, line in enumerate(lines[:2]):
            c.drawString(x + width * 0.56, top(y + 14 + line_index * 10), line)
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
    c.drawRightString(896, 34, f"01 / {total:02d}")
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
            ("take_off()", "Take off and wait until the aircraft is ready."),
            ("land()", "Land and wait for the landing sequence."),
            ("hover()", "Zero motion and hold for about one second."),
            ("wait(seconds)", "Pause without blocking Stop & Land."),
            ('fly(direction, seconds=1, power=15)', 'up/down/left/right/forward/backward.'),
        ],
        54,
        132,
        414,
        48,
    )
    command_rows(
        c,
        [
            ('rotate(degrees=0, direction="clockwise")', "Timed yaw; use clockwise or counterclockwise."),
            ('flip(direction)', "forward/backward/left/right; allow safe clearance."),
            ('set_axis(axis, power)', "Persistent pitch/roll/yaw/gaz until reset."),
            ("reset_motion()", "Zero every motion axis without landing."),
            ("emergency_cutoff()", "Immediate motor cutoff - emergency only."),
        ],
        492,
        132,
        414,
        48,
    )
    footer(c, page, total)
    c.showPage()


def page_state_accessories(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "04", "State, photos, and accessories", "Return values can be stored in variables and tested in decisions. Photo capture saves the current camera frame to the session gallery.", page, total)
    command_rows(
        c,
        [
            ("battery_level()", "Battery percentage, or None before telemetry arrives."),
            ("is_flying()", "True while hovering, flying, or flipping."),
            ("is_landed()", "True when the controller reports landed."),
            ("wait_for_battery_change()", "Pause until a new battery event arrives."),
            ("take_photo()", "Store the current real or simulated camera view."),
        ],
        54,
        132,
        414,
        48,
    )
    command_rows(
        c,
        [
            ("open_grabber()", "Open the attached grabber accessory."),
            ("close_grabber()", "Close the attached grabber accessory."),
            ("fire_gun()", "Fire one BB from the attached cannon."),
            ('key_pressed("ArrowUp")', "Read a live keyboard key state."),
            ("stopped()", "True after the operator selects Stop & Land."),
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
            ("scan_threshold(threshold=60, invert=False)", "Return white/black coverage and center result."),
            ('sees_binary("white", 60, False, 10)', "True when coverage meets the final percent."),
            ('binary_center("white", 60, False)', "True when the center pixel has the color."),
            ("take_photo()", "Save exactly what the current camera sees."),
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
            ("2", [("while", CODE_KEYWORD), (" ", CODE_TEXT), ("not", CODE_KEYWORD), (" ", CODE_TEXT), ("stopped", CODE_FUNCTION), ("():", CODE_TEXT)]),
            ("3", [("    if", CODE_KEYWORD), (" ", CODE_TEXT), ("binary_center", CODE_FUNCTION), ("(", CODE_TEXT), ('"white"', CODE_STRING), (", ", CODE_TEXT), ("60", CODE_NUMBER), (", ", CODE_TEXT), ("False", CODE_KEYWORD), ("):", CODE_TEXT)]),
            ("4", [("        take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("5", [("        break", CODE_KEYWORD)]),
            ("6", [("    fly", CODE_FUNCTION), ("(", CODE_TEXT), ('"forward"', CODE_STRING), (", ", CODE_TEXT), ("0.4", CODE_NUMBER), (", ", CODE_TEXT), ("12", CODE_NUMBER), (")", CODE_TEXT)]),
            ("7", [("land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        565,
        137,
        341,
        190,
        "WHITE-PAPER-SEARCH.PY",
    )
    note_panel(c, "Fresh frame rule", "sees_binary() and binary_center() scan before deciding. scan_threshold() is useful when you want the full result in a variable.", 565, 344, 341, 93)
    footer(c, page, total)
    c.showPage()


def page_objects(c: canvas.Canvas, page: int, total: int) -> None:
    header(c, "06", "COCO objects and custom labels", "Confidence is a fraction from 0 to 1 in Python. The built-in detector draws boxes; Teachable Machine classifies the whole frame.", page, total)
    command_rows(
        c,
        [
            ("load_object_model()", "Load the local COCO-SSD network."),
            ("scan_objects(confidence=0.55)", "Return up to 10 detections; detect_objects is an alias."),
            ('sees_object("person", confidence=0.55)', "Scan and return True when that label is found."),
            ('object_coordinate("person", "x", 0.55)', "Last x or y value on a -100 to +100 scale."),
            ('object_x("person", 0.55)', "Shortcut for the most recent horizontal coordinate."),
            ('object_y("person", 0.55)', "Shortcut for the most recent vertical coordinate."),
        ],
        54,
        132,
        515,
        47,
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
            ("scan_custom_model()", "Return predictions from the loaded model."),
            ('sees_custom_label("red flag", 0.75)', "Scan and test one custom class."),
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
            ("scan_april_tags()", "Return every visible tag and update overlays."),
            ('sees_april_tag("any")', "Scan and return True for one or more tags."),
            ("sees_april_tag(42)", "Scan for one tag36h11 ID."),
            ('center_on_april_tag("any", 10, 5, 5, 3)', "Center x/y, align yaw, and stop after lost searches."),
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
            ("2", [("if", CODE_KEYWORD), (" ", CODE_TEXT), ("sees_april_tag", CODE_FUNCTION), ("(", CODE_TEXT), ("7", CODE_NUMBER), ("):", CODE_TEXT)]),
            ("3", [("    centered = ", CODE_TEXT), ("center_on_april_tag", CODE_FUNCTION), ("(", CODE_TEXT), ("7", CODE_NUMBER), (")", CODE_TEXT)]),
            ("4", [("    if", CODE_KEYWORD), (" centered:", CODE_TEXT)]),
            ("5", [("        take_photo", CODE_FUNCTION), ("()", CODE_TEXT)]),
            ("6", [("else", CODE_KEYWORD), (":", CODE_TEXT)]),
            ("7", [("    print", CODE_FUNCTION), ("(", CODE_TEXT), ('"Tag 7 not found"', CODE_STRING), (")", CODE_TEXT)]),
            ("8", [("land", CODE_FUNCTION), ("()", CODE_TEXT)]),
        ],
        580,
        140,
        326,
        215,
        "TAG-MISSION.PY",
    )
    note_panel(c, "Named options", 'center_on_april_tag(id=7, power=8, center_slack=4, angle_slack=5, lost_searches=4)', 54, 393, 852, 59)
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
            ("print(value)", "Write values to the program console."),
            ("len(value)", "Number of items or characters."),
            ("contains(collection, value)", "True when a list or string contains a value."),
            ("abs / min / max / round", "Common number helpers."),
            ("int / float / str / bool", "Convert one value to a new type."),
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
            ("range(4)", "0, 1, 2, 3"),
            ("range(2, 6)", "2, 3, 4, 5"),
            ("range(6, 0, -2)", "6, 4, 2"),
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
    header(c, "12", "Quick reference: units, rules, and support", "Keep this page nearby during a lab. The detailed pages explain every command listed here.", page, total)
    note_panel(c, "Units", "Power and threshold: 0-100 percent\nConfidence: 0-1 fraction\nTime: seconds\nRotation: degrees\nVision x/y: -100 to +100", 54, 132, 257, 134)
    note_panel(c, "Directions", "fly: up, down, left, right, forward, backward\nflip: forward, backward, left, right\nrotate: clockwise, counterclockwise", 54, 282, 257, 116, NAVY_2)
    note_panel(c, "Python rules", "Four spaces per level. Colon after block headers. Calls stay on one line. No await or import. Use True, False, None, and snake_case command names.", 54, 414, 257, 74, RED)
    note_panel(c, "Flight + state", "take_off  land  hover  wait  fly  rotate  flip  set_axis  reset_motion  battery_level  is_flying  is_landed  wait_for_battery_change  stopped  key_pressed", 333, 132, 273, 130)
    note_panel(c, "Photos + accessories", "take_photo  open_grabber  close_grabber  fire_gun  emergency_cutoff", 333, 278, 273, 78)
    note_panel(c, "Basic tools", "print  len  range  contains  abs  min  max  round  int  float  str  bool", 333, 372, 273, 80, NAVY_2)
    note_panel(c, "Vision", "scan_threshold  sees_binary  binary_center  load_object_model  scan_objects  detect_objects  sees_object  object_coordinate  object_x  object_y  scan_april_tags  sees_april_tag  center_on_april_tag  scan_custom_model  sees_custom_label", 628, 132, 278, 196)
    note_panel(c, "Safety", "Use conservative power and short motion times. Test vision while landed. Keep the area clear. Stop & Land remains the operator control; emergency_cutoff is for immediate motor shutdown only.", 628, 344, 278, 108, RED)
    set_font(c, "Helvetica", 7.4, MUTED)
    c.drawString(333, top(480), "Source of truth: lib/python.ts, lib/drone.ts, lib/vision.ts, and lib/runtime.ts")
    footer(c, page, total)
    c.showPage()


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
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
    shutil.copy2(OUTPUT, PUBLIC)
    print(OUTPUT)
    print(PUBLIC)


if __name__ == "__main__":
    build()
