"""Small dependency-free PDF canvas used when ReportLab is unavailable.

It intentionally implements only the drawing surface needed by the Hopper
information deck generator. PDF coordinates, text, vector paths, alpha states,
JPEG image XObjects, page resources and xref tables are emitted directly.
"""

from __future__ import annotations

import math
import zlib
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import BinaryIO

from PIL import Image, ImageFont


@dataclass(frozen=True)
class Color:
    red: float
    green: float
    blue: float
    alpha: float = 1.0


def HexColor(value: str) -> Color:
    normalized = value.strip().lstrip("#")
    if len(normalized) == 3:
        normalized = "".join(character * 2 for character in normalized)
    if len(normalized) != 6:
        raise ValueError(f"Expected 3 or 6 hex digits, got {value!r}")
    return Color(
        int(normalized[0:2], 16) / 255,
        int(normalized[2:4], 16) / 255,
        int(normalized[4:6], 16) / 255,
    )


white = Color(1, 1, 1)

FONT_FILES = {
    "Helvetica": "/System/Library/Fonts/Supplemental/Arial.ttf",
    "Helvetica-Bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "Courier": "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "Courier-Bold": "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
}
FONT_BASE_NAMES = {
    "Helvetica": "Helvetica",
    "Helvetica-Bold": "Helvetica-Bold",
    "Courier": "Courier",
    "Courier-Bold": "Courier-Bold",
}
FONT_RESOURCE_NAMES = {
    "Helvetica": "F1",
    "Helvetica-Bold": "F2",
    "Courier": "F3",
    "Courier-Bold": "F4",
}
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def stringWidth(text: str, font: str, size: float) -> float:
    path = FONT_FILES.get(font, FONT_FILES["Helvetica"])
    cache_size = max(1, int(round(size * 8)))
    key = (path, cache_size)
    loaded = _font_cache.get(key)
    if loaded is None:
        loaded = ImageFont.truetype(path, cache_size)
        _font_cache[key] = loaded
    return float(loaded.getlength(str(text))) / 8


class ImageReader:
    def __init__(self, source: str | Path | BytesIO):
        self.source = source

    def getSize(self) -> tuple[int, int]:
        if isinstance(self.source, (str, Path)):
            with Image.open(self.source) as image:
                return image.size
        position = self.source.tell()
        try:
            self.source.seek(0)
            with Image.open(self.source) as image:
                return image.size
        finally:
            self.source.seek(position)


def _number(value: float) -> str:
    if abs(value) < 1e-10:
        return "0"
    rounded = round(float(value), 5)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.5f}".rstrip("0").rstrip(".")


def _escape_text(value: str) -> str:
    encoded = str(value).encode("cp1252", "replace").decode("latin-1")
    return encoded.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_string(value: str) -> str:
    return f"({_escape_text(value)})"


def _paint_operator(fill: int, stroke: int) -> str:
    if fill and stroke:
        return "B"
    if fill:
        return "f"
    if stroke:
        return "S"
    return "n"


def _arc_beziers(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    start_degrees: float,
    extent_degrees: float,
) -> tuple[tuple[float, float], list[tuple[float, float, float, float, float, float]]]:
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    rx = abs(x2 - x1) / 2
    ry = abs(y2 - y1) / 2
    segments = max(1, int(math.ceil(abs(extent_degrees) / 90)))
    step = math.radians(extent_degrees / segments)
    angle = math.radians(start_degrees)
    start = (cx + rx * math.cos(angle), cy + ry * math.sin(angle))
    curves: list[tuple[float, float, float, float, float, float]] = []
    for _ in range(segments):
        next_angle = angle + step
        factor = 4 / 3 * math.tan((next_angle - angle) / 4)
        p0x = cx + rx * math.cos(angle)
        p0y = cy + ry * math.sin(angle)
        p3x = cx + rx * math.cos(next_angle)
        p3y = cy + ry * math.sin(next_angle)
        p1x = p0x - factor * rx * math.sin(angle)
        p1y = p0y + factor * ry * math.cos(angle)
        p2x = p3x + factor * rx * math.sin(next_angle)
        p2y = p3y - factor * ry * math.cos(next_angle)
        curves.append((p1x, p1y, p2x, p2y, p3x, p3y))
        angle = next_angle
    return start, curves


def _rounded_rect_commands(x: float, y: float, width: float, height: float, radius: float) -> list[str]:
    radius = max(0, min(radius, width / 2, height / 2))
    if radius == 0:
        return [f"{_number(x)} {_number(y)} {_number(width)} {_number(height)} re"]
    k = 0.5522847498
    commands = [
        f"{_number(x + radius)} {_number(y)} m",
        f"{_number(x + width - radius)} {_number(y)} l",
        (
            f"{_number(x + width - radius + k * radius)} {_number(y)} "
            f"{_number(x + width)} {_number(y + radius - k * radius)} "
            f"{_number(x + width)} {_number(y + radius)} c"
        ),
        f"{_number(x + width)} {_number(y + height - radius)} l",
        (
            f"{_number(x + width)} {_number(y + height - radius + k * radius)} "
            f"{_number(x + width - radius + k * radius)} {_number(y + height)} "
            f"{_number(x + width - radius)} {_number(y + height)} c"
        ),
        f"{_number(x + radius)} {_number(y + height)} l",
        (
            f"{_number(x + radius - k * radius)} {_number(y + height)} "
            f"{_number(x)} {_number(y + height - radius + k * radius)} "
            f"{_number(x)} {_number(y + height - radius)} c"
        ),
        f"{_number(x)} {_number(y + radius)} l",
        (
            f"{_number(x)} {_number(y + radius - k * radius)} "
            f"{_number(x + radius - k * radius)} {_number(y)} "
            f"{_number(x + radius)} {_number(y)} c"
        ),
        "h",
    ]
    return commands


class PDFPath:
    def __init__(self) -> None:
        self.commands: list[str] = []

    def rect(self, x: float, y: float, width: float, height: float) -> None:
        self.commands.append(f"{_number(x)} {_number(y)} {_number(width)} {_number(height)} re")

    def roundRect(self, x: float, y: float, width: float, height: float, radius: float) -> None:
        self.commands.extend(_rounded_rect_commands(x, y, width, height, radius))


@dataclass
class _Page:
    content: bytes
    images: set[str]
    alpha_states: set[str]


@dataclass
class _ImageAsset:
    name: str
    width: int
    height: int
    jpeg: bytes


class Canvas:
    def __init__(
        self,
        filename: str,
        pagesize: tuple[float, float],
        pageCompression: int = 1,
        invariant: int = 1,
    ) -> None:
        self.filename = filename
        self.width, self.height = pagesize
        self._commands: list[str] = []
        self._pages: list[_Page] = []
        self._page_images: set[str] = set()
        self._page_alpha_states: set[str] = set()
        self._images: dict[str, _ImageAsset] = {}
        self._title = ""
        self._author = ""
        self._subject = ""
        self._creator = ""
        self._current_font = "Helvetica"
        self._current_font_size = 10.0

    def _append(self, command: str) -> None:
        self._commands.append(command)

    def setTitle(self, value: str) -> None:
        self._title = value

    def setAuthor(self, value: str) -> None:
        self._author = value

    def setSubject(self, value: str) -> None:
        self._subject = value

    def setCreator(self, value: str) -> None:
        self._creator = value

    def setFillColor(self, color: Color) -> None:
        self._set_alpha(color.alpha)
        self._append(f"{_number(color.red)} {_number(color.green)} {_number(color.blue)} rg")

    def setStrokeColor(self, color: Color) -> None:
        self._set_alpha(color.alpha)
        self._append(f"{_number(color.red)} {_number(color.green)} {_number(color.blue)} RG")

    def _set_alpha(self, alpha: float) -> None:
        clamped = max(0, min(1, float(alpha)))
        name = f"GS{int(round(clamped * 100)):03d}"
        self._page_alpha_states.add(name)
        self._append(f"/{name} gs")

    def setLineWidth(self, width: float) -> None:
        self._append(f"{_number(width)} w")

    def setFont(self, font: str, size: float) -> None:
        normalized = font if font in FONT_RESOURCE_NAMES else "Helvetica"
        self._current_font = normalized
        self._current_font_size = float(size)

    def drawString(self, x: float, y: float, value: str) -> None:
        self._append(
            f"BT /{FONT_RESOURCE_NAMES[self._current_font]} {_number(self._current_font_size)} Tf "
            f"{_number(x)} {_number(y)} Td {_pdf_string(value)} Tj ET"
        )

    def drawRightString(self, x: float, y: float, value: str) -> None:
        self.drawString(
            x - stringWidth(value, self._current_font, self._current_font_size),
            y,
            value,
        )

    def drawCentredString(self, x: float, y: float, value: str) -> None:
        self.drawString(
            x - stringWidth(value, self._current_font, self._current_font_size) / 2,
            y,
            value,
        )

    def rect(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        fill: int = 0,
        stroke: int = 1,
    ) -> None:
        self._append(
            f"{_number(x)} {_number(y)} {_number(width)} {_number(height)} re {_paint_operator(fill, stroke)}"
        )

    def roundRect(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        radius: float,
        fill: int = 0,
        stroke: int = 1,
    ) -> None:
        self._commands.extend(_rounded_rect_commands(x, y, width, height, radius))
        self._append(_paint_operator(fill, stroke))

    def circle(
        self,
        x: float,
        y: float,
        radius: float,
        fill: int = 0,
        stroke: int = 1,
    ) -> None:
        k = 0.5522847498
        commands = [
            f"{_number(x + radius)} {_number(y)} m",
            (
                f"{_number(x + radius)} {_number(y + k * radius)} "
                f"{_number(x + k * radius)} {_number(y + radius)} "
                f"{_number(x)} {_number(y + radius)} c"
            ),
            (
                f"{_number(x - k * radius)} {_number(y + radius)} "
                f"{_number(x - radius)} {_number(y + k * radius)} "
                f"{_number(x - radius)} {_number(y)} c"
            ),
            (
                f"{_number(x - radius)} {_number(y - k * radius)} "
                f"{_number(x - k * radius)} {_number(y - radius)} "
                f"{_number(x)} {_number(y - radius)} c"
            ),
            (
                f"{_number(x + k * radius)} {_number(y - radius)} "
                f"{_number(x + radius)} {_number(y - k * radius)} "
                f"{_number(x + radius)} {_number(y)} c h"
            ),
            _paint_operator(fill, stroke),
        ]
        self._commands.extend(commands)

    def line(self, x1: float, y1: float, x2: float, y2: float) -> None:
        self._append(f"{_number(x1)} {_number(y1)} m {_number(x2)} {_number(y2)} l S")

    def arc(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        startAng: float,
        extent: float,
    ) -> None:
        start, curves = _arc_beziers(x1, y1, x2, y2, startAng, extent)
        self._append(f"{_number(start[0])} {_number(start[1])} m")
        for curve in curves:
            self._append(" ".join(_number(value) for value in curve) + " c")
        self._append("S")

    def wedge(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        startAng: float,
        extent: float,
        fill: int = 0,
        stroke: int = 1,
    ) -> None:
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        start, curves = _arc_beziers(x1, y1, x2, y2, startAng, extent)
        self._append(f"{_number(cx)} {_number(cy)} m {_number(start[0])} {_number(start[1])} l")
        for curve in curves:
            self._append(" ".join(_number(value) for value in curve) + " c")
        self._append(f"{_number(cx)} {_number(cy)} l h {_paint_operator(fill, stroke)}")

    def saveState(self) -> None:
        self._append("q")

    def restoreState(self) -> None:
        self._append("Q")

    def translate(self, x: float, y: float) -> None:
        self._append(f"1 0 0 1 {_number(x)} {_number(y)} cm")

    def rotate(self, degrees: float) -> None:
        radians = math.radians(degrees)
        cosine = math.cos(radians)
        sine = math.sin(radians)
        self._append(
            f"{_number(cosine)} {_number(sine)} {_number(-sine)} {_number(cosine)} 0 0 cm"
        )

    def beginPath(self) -> PDFPath:
        return PDFPath()

    def clipPath(self, path: PDFPath, stroke: int = 0, fill: int = 0) -> None:
        self._commands.extend(path.commands)
        self._append("W n")

    def _image_key(self, source: object) -> str:
        if isinstance(source, ImageReader):
            source = source.source
        if isinstance(source, (str, Path)):
            return str(Path(source).resolve())
        return f"memory:{id(source)}"

    def _load_image(self, source: object) -> _ImageAsset:
        reader = source if isinstance(source, ImageReader) else ImageReader(source)  # type: ignore[arg-type]
        key = self._image_key(reader)
        existing = self._images.get(key)
        if existing is not None:
            return existing
        if isinstance(reader.source, (str, Path)):
            image = Image.open(reader.source)
        else:
            reader.source.seek(0)
            image = Image.open(reader.source)
        with image:
            converted = image.convert("RGBA")
            background = Image.new("RGB", converted.size, "white")
            background.paste(converted, mask=converted.getchannel("A"))
            buffer = BytesIO()
            background.save(buffer, "JPEG", quality=90, optimize=True)
            asset = _ImageAsset(
                name=f"Im{len(self._images) + 1}",
                width=background.width,
                height=background.height,
                jpeg=buffer.getvalue(),
            )
        self._images[key] = asset
        return asset

    def drawImage(
        self,
        image: object,
        x: float,
        y: float,
        width: float,
        height: float,
        preserveAspectRatio: bool = True,
        mask: str | None = None,
    ) -> None:
        asset = self._load_image(image)
        self._page_images.add(asset.name)
        self._append(
            f"q {_number(width)} 0 0 {_number(height)} {_number(x)} {_number(y)} cm /{asset.name} Do Q"
        )

    def showPage(self) -> None:
        content = ("\n".join(self._commands) + "\n").encode("latin-1", "replace")
        self._pages.append(_Page(content, set(self._page_images), set(self._page_alpha_states)))
        self._commands = []
        self._page_images.clear()
        self._page_alpha_states.clear()

    def _stream_object(self, dictionary: str, payload: bytes, compress: bool = False) -> bytes:
        data = zlib.compress(payload, 9) if compress else payload
        filter_entry = " /Filter /FlateDecode" if compress else ""
        return (
            f"<< {dictionary} /Length {len(data)}{filter_entry} >>\nstream\n".encode("ascii")
            + data
            + b"\nendstream"
        )

    def save(self) -> None:
        if self._commands:
            self.showPage()
        objects: dict[int, bytes] = {}
        catalog_id = 1
        pages_id = 2
        font_ids: dict[str, int] = {}
        next_id = 3
        for font_name in FONT_RESOURCE_NAMES:
            font_ids[font_name] = next_id
            base_name = FONT_BASE_NAMES[font_name]
            objects[next_id] = (
                f"<< /Type /Font /Subtype /Type1 /BaseFont /{base_name} /Encoding /WinAnsiEncoding >>"
            ).encode("ascii")
            next_id += 1

        image_ids: dict[str, int] = {}
        for asset in self._images.values():
            image_ids[asset.name] = next_id
            objects[next_id] = self._stream_object(
                (
                    f"/Type /XObject /Subtype /Image /Width {asset.width} /Height {asset.height} "
                    "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode"
                ),
                asset.jpeg,
                False,
            )
            next_id += 1

        page_ids: list[int] = []
        for page in self._pages:
            content_id = next_id
            next_id += 1
            page_id = next_id
            next_id += 1
            objects[content_id] = self._stream_object("", page.content, True)
            font_resource = " ".join(
                f"/{FONT_RESOURCE_NAMES[name]} {font_ids[name]} 0 R"
                for name in FONT_RESOURCE_NAMES
            )
            image_resource = " ".join(
                f"/{name} {image_ids[name]} 0 R" for name in sorted(page.images)
            )
            alpha_resource = " ".join(
                f"/{name} << /Type /ExtGState /ca {int(name[2:]) / 100:.2f} /CA {int(name[2:]) / 100:.2f} >>"
                for name in sorted(page.alpha_states)
            )
            resources = (
                f"<< /Font << {font_resource} >> "
                f"/XObject << {image_resource} >> "
                f"/ExtGState << {alpha_resource} >> >>"
            )
            objects[page_id] = (
                f"<< /Type /Page /Parent {pages_id} 0 R "
                f"/MediaBox [0 0 {_number(self.width)} {_number(self.height)}] "
                f"/Resources {resources} /Contents {content_id} 0 R >>"
            ).encode("ascii")
            page_ids.append(page_id)

        info_id = next_id
        objects[info_id] = (
            "<< "
            f"/Title {_pdf_string(self._title)} "
            f"/Author {_pdf_string(self._author)} "
            f"/Subject {_pdf_string(self._subject)} "
            f"/Creator {_pdf_string(self._creator)} "
            ">>"
        ).encode("latin-1", "replace")
        objects[pages_id] = (
            f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] "
            f"/Count {len(page_ids)} >>"
        ).encode("ascii")
        objects[catalog_id] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")

        maximum_id = max(objects)
        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0] * (maximum_id + 1)
        for object_id in range(1, maximum_id + 1):
            offsets[object_id] = len(output)
            output.extend(f"{object_id} 0 obj\n".encode("ascii"))
            output.extend(objects[object_id])
            output.extend(b"\nendobj\n")
        xref_offset = len(output)
        output.extend(f"xref\n0 {maximum_id + 1}\n".encode("ascii"))
        output.extend(b"0000000000 65535 f \n")
        for object_id in range(1, maximum_id + 1):
            output.extend(f"{offsets[object_id]:010d} 00000 n \n".encode("ascii"))
        output.extend(
            (
                f"trailer\n<< /Size {maximum_id + 1} /Root {catalog_id} 0 R /Info {info_id} 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF\n"
            ).encode("ascii")
        )
        Path(self.filename).write_bytes(output)


canvas = SimpleNamespace(Canvas=Canvas)
