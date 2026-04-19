#!/usr/bin/env python3
import binascii
import os
import struct
import zlib


BACKGROUND = (0xF2, 0x8A, 0x57, 0xFF)
WHITE = (0xFF, 0xFF, 0xFF, 0xFF)
BLACK = (0x00, 0x00, 0x00, 0xFF)
TRANSPARENT = (0x00, 0x00, 0x00, 0x00)


class Canvas:
    def __init__(self, width: int, height: int, background: tuple[int, int, int, int]) -> None:
        self.width = width
        self.height = height
        self.pixels = bytearray(background * width * height)

    def fill_rect(self, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
        x0 = max(0, x0)
        y0 = max(0, y0)
        x1 = min(self.width, x1)
        y1 = min(self.height, y1)

        for y in range(y0, y1):
            row_start = (y * self.width + x0) * 4
            row_end = (y * self.width + x1) * 4
            self.pixels[row_start:row_end] = bytes(color) * (x1 - x0)

    def fill_circle(self, cx: int, cy: int, radius: int, color: tuple[int, int, int, int]) -> None:
        radius_squared = radius * radius
        for y in range(max(0, cy - radius), min(self.height, cy + radius + 1)):
            dy = y - cy
            for x in range(max(0, cx - radius), min(self.width, cx + radius + 1)):
                dx = x - cx
                if dx * dx + dy * dy <= radius_squared:
                    self._set_pixel(x, y, color)

    def fill_rounded_rect(
        self,
        x0: int,
        y0: int,
        x1: int,
        y1: int,
        radius: int,
        color: tuple[int, int, int, int],
    ) -> None:
        radius = max(0, min(radius, (x1 - x0) // 2, (y1 - y0) // 2))
        inner_x0 = x0 + radius
        inner_x1 = x1 - radius
        inner_y0 = y0 + radius
        inner_y1 = y1 - radius

        self.fill_rect(inner_x0, y0, inner_x1, y1, color)
        self.fill_rect(x0, inner_y0, x1, inner_y1, color)
        self.fill_circle(inner_x0, inner_y0, radius, color)
        self.fill_circle(inner_x1 - 1, inner_y0, radius, color)
        self.fill_circle(inner_x0, inner_y1 - 1, radius, color)
        self.fill_circle(inner_x1 - 1, inner_y1 - 1, radius, color)

    def _set_pixel(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        index = (y * self.width + x) * 4
        self.pixels[index:index + 4] = bytes(color)


def write_png(path: str, canvas: Canvas) -> None:
    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + chunk_type
            + data
            + struct.pack("!I", binascii.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    row_stride = canvas.width * 4
    for y in range(canvas.height):
        raw.append(0)
        start = y * row_stride
        raw.extend(canvas.pixels[start:start + row_stride])

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack("!IIBBBBB", canvas.width, canvas.height, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
    png.extend(chunk(b"IEND", b""))

    with open(path, "wb") as file:
        file.write(png)


def draw_icon(width: int, height: int, *, background: tuple[int, int, int, int], foreground: tuple[int, int, int, int], note_cutout: tuple[int, int, int, int]) -> Canvas:
    canvas = Canvas(width, height, background)
    scale = min(width, height) / 1024.0

    def scaled(value: int) -> int:
        return int(round(value * scale))

    plate_center_x = scaled(580)
    plate_center_y = scaled(600)
    outer_radius = scaled(285)
    inner_radius = scaled(208)

    canvas.fill_circle(plate_center_x, plate_center_y, outer_radius, foreground)
    canvas.fill_circle(plate_center_x, plate_center_y, inner_radius, background)

    canvas.fill_rounded_rect(scaled(220), scaled(340), scaled(288), scaled(808), scaled(32), foreground)
    canvas.fill_rect(scaled(214), scaled(296), scaled(356), scaled(376), foreground)
    tine_positions = (214, 252, 290, 328)
    for left in tine_positions:
        canvas.fill_rounded_rect(
            scaled(left),
            scaled(180),
            scaled(left + 28),
            scaled(336),
            scaled(12),
            foreground,
        )

    canvas.fill_rounded_rect(scaled(620), scaled(186), scaled(844), scaled(404), scaled(38), foreground)
    line_specs = (
        (668, 250, 788, 274),
        (668, 296, 760, 320),
        (668, 342, 808, 366),
    )
    for x0, y0, x1, y1 in line_specs:
        canvas.fill_rounded_rect(scaled(x0), scaled(y0), scaled(x1), scaled(y1), scaled(12), note_cutout)

    return canvas


def main() -> None:
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")

    targets = {
        "icon.png": draw_icon(1024, 1024, background=BACKGROUND, foreground=WHITE, note_cutout=BACKGROUND),
        "adaptive-icon.png": draw_icon(1024, 1024, background=BACKGROUND, foreground=WHITE, note_cutout=BACKGROUND),
        "adaptive-foreground.png": draw_icon(1024, 1024, background=TRANSPARENT, foreground=WHITE, note_cutout=TRANSPARENT),
        "adaptive-monochrome.png": draw_icon(1024, 1024, background=TRANSPARENT, foreground=BLACK, note_cutout=TRANSPARENT),
        "favicon.png": draw_icon(48, 48, background=BACKGROUND, foreground=WHITE, note_cutout=BACKGROUND),
        "splash-icon.png": draw_icon(1024, 1024, background=BACKGROUND, foreground=WHITE, note_cutout=BACKGROUND),
    }

    for filename, canvas in targets.items():
        write_png(os.path.join(assets_dir, filename), canvas)


if __name__ == "__main__":
    main()
