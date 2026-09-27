#!/usr/bin/env python3
"""Generate the app icons (PNG, ICO and ICNS) without external project dependencies.

Run it once; the files land in src-tauri/icons/.
Requires Pillow (python3 -m pip install pillow).
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
SIZE = 1024

# Icon palette: dark background with a blue -> purple gradient (the same
# accents the interface uses in the dark theme).
TOP = (31, 111, 235)
BOTTOM = (163, 113, 247)
TILE = (13, 17, 23)


def rounded_gradient(size: int, radius: int) -> Image.Image:
    """Rounded square with a vertical gradient."""
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (size, size))
    pixels = gradient.load()
    for y in range(size):
        ratio = y / max(size - 1, 1)
        color = tuple(
            int(TOP[channel] + (BOTTOM[channel] - TOP[channel]) * ratio) for channel in range(3)
        )
        for x in range(size):
            pixels[x, y] = (*color, 255)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    base.paste(gradient, (0, 0), mask)
    return base


def draw_mark(image: Image.Image, scale: float = 1.0) -> None:
    """Draw the white 'M' mark with the down arrow."""
    draw = ImageDraw.Draw(image)
    white = (255, 255, 255, 255)
    stroke = int(58 * scale)

    left, right = int(232 * scale), int(470 * scale)
    top, bottom = int(360 * scale), int(672 * scale)
    mid = (left + right) // 2
    valley = int(top + (bottom - top) * 0.42)

    # Letter M (thick stroke with rounded joints).
    draw.line([(left, bottom), (left, top)], fill=white, width=stroke, joint="curve")
    draw.line([(left, top), (mid, valley)], fill=white, width=stroke, joint="curve")
    draw.line([(mid, valley), (right, top)], fill=white, width=stroke, joint="curve")
    draw.line([(right, top), (right, bottom)], fill=white, width=stroke, joint="curve")

    # Down arrow.
    arrow_x = int(724 * scale)
    shaft_top, shaft_bottom = int(360 * scale), int(596 * scale)
    draw.line([(arrow_x, shaft_top), (arrow_x, shaft_bottom)], fill=white, width=stroke)

    half = int(74 * scale)
    draw.polygon(
        [
            (arrow_x - half, shaft_bottom - int(10 * scale)),
            (arrow_x + half, shaft_bottom - int(10 * scale)),
            (arrow_x, int(672 * scale)),
        ],
        fill=white,
    )

    for point in ((left, bottom), (left, top), (mid, valley), (right, top), (right, bottom)):
        draw.ellipse(
            (point[0] - stroke // 2, point[1] - stroke // 2, point[0] + stroke // 2, point[1] + stroke // 2),
            fill=white,
        )


def master() -> Image.Image:
    image = rounded_gradient(SIZE, radius=int(SIZE * 0.22))
    # A quiet inner tile so the mark breathes inside the gradient.
    inner = ImageDraw.Draw(image)
    inner.rounded_rectangle(
        (int(SIZE * 0.085), int(SIZE * 0.085), int(SIZE * 0.915), int(SIZE * 0.915)),
        radius=int(SIZE * 0.16),
        fill=TILE + (255,),
    )
    draw_mark(image)
    return image


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write_icns(path: Path, sources: dict[str, Image.Image]) -> None:
    """Build an .icns with embedded PNGs (the format modern macOS accepts)."""
    chunks = b""
    for kind, image in sources.items():
        payload = png_bytes(image)
        chunks += kind.encode("ascii") + struct.pack(">I", len(payload) + 8) + payload
    path.write_bytes(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    base = master()

    for size, name in ((32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png"), (512, "icon.png")):
        base.resize((size, size), Image.LANCZOS).save(OUT / name)

    # Windows: multi-resolution .ico.
    base.resize((256, 256), Image.LANCZOS).save(
        OUT / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # macOS: .icns with one PNG per size (ic13/ic14 are the retina variants).
    write_icns(
        OUT / "icon.icns",
        {
            "ic11": base.resize((32, 32), Image.LANCZOS),
            "ic12": base.resize((64, 64), Image.LANCZOS),
            "ic07": base.resize((128, 128), Image.LANCZOS),
            "ic08": base.resize((256, 256), Image.LANCZOS),
            "ic09": base.resize((512, 512), Image.LANCZOS),
            "ic10": base.resize((1024, 1024), Image.LANCZOS),
            "ic13": base.resize((512, 512), Image.LANCZOS),
            "ic14": base.resize((1024, 1024), Image.LANCZOS),
        },
    )

    print(f"Icons written to {OUT}")


if __name__ == "__main__":
    main()
