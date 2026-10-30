#!/usr/bin/env python3
"""Draws the app icons (the favicon's dumbbell) as PNGs, with no image libraries.

  python3 tools/make_icons.py   -> app/frontend/public/icons/*.png
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "frontend" / "public" / "icons"
BG = (0x11, 0x13, 0x15)
LIME = (0xD4, 0xFF, 0x3A)
BAR = (0xEC, 0xEF, 0xF2)

# On the favicon's 64×64 grid: (x, y, w, h, corner radius, colour)
SHAPES = [
    (8, 22, 8, 20, 2.5, LIME),
    (16, 17, 8, 30, 2.5, LIME),
    (40, 17, 8, 30, 2.5, LIME),
    (48, 22, 8, 20, 2.5, LIME),
    (24, 29, 16, 6, 2, BAR),
]


def inside(px: float, py: float, x, y, w, h, r) -> bool:
    if not (x <= px <= x + w and y <= py <= y + h):
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def draw(size: int, scale: float, rounded: bool) -> bytes:
    """scale: how much of the canvas the 64-grid drawing fills (maskable icons need a safe margin)."""
    k = size * scale / 64
    off = size * (1 - scale) / 2
    radius = size * 14 / 64 if rounded else 0
    sub = [(i + 0.5) / 4 for i in range(4)]
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in sub:
                for sx in sub:
                    X, Y = px + sx, py + sy
                    if rounded and not inside(X, Y, 0, 0, size, size, radius):
                        continue
                    colour = BG
                    gx, gy = (X - off) / k, (Y - off) / k
                    for x, y, w, h, r, c in SHAPES:
                        if inside(gx, gy, x, y, w, h, r):
                            colour = c
                    acc[0] += colour[0]
                    acc[1] += colour[1]
                    acc[2] += colour[2]
                    acc[3] += 255
            n = 16
            a = acc[3] / n
            if a:
                row += bytes([round(acc[0] / (acc[3] / 255)), round(acc[1] / (acc[3] / 255)), round(acc[2] / (acc[3] / 255)), round(a)])
            else:
                row += b"\0\0\0\0"
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # Regular icons: rounded square like the favicon. Maskable: full square, drawing inside the safe zone.
    for name, size, scale, rounded in [
        ("icon-192.png", 192, 1.0, True),
        ("icon-512.png", 512, 1.0, True),
        ("maskable-512.png", 512, 0.72, False),
        ("apple-touch-icon.png", 180, 0.9, False),
    ]:
        (OUT / name).write_bytes(draw(size, scale, rounded))
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
