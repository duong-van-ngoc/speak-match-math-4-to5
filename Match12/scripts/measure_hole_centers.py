from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw


Side = Literal["left", "right"]


@dataclass(frozen=True)
class HoleCenter:
    width: int
    height: int
    cx: float
    cy: float
    area: int


def _roi_for_side(w: int, h: int, side: Side) -> tuple[int, int, int, int]:
    # Focus on the side tabs (where the hole is) and avoid the big drop shadow at the bottom.
    y0, y1 = int(h * 0.12), int(h * 0.88)
    if side == "right":
        x0, x1 = int(w * 0.76), w
    else:
        x0, x1 = 0, int(w * 0.24)
    return x0, y0, x1, y1


def _connected_components(mask: np.ndarray) -> list[tuple[int, int, int]]:
    # Returns list of (area, sum_x, sum_y) for each component (4-neighborhood).
    h, w = mask.shape[:2]
    visited = np.zeros((h, w), dtype=np.uint8)
    comps: list[tuple[int, int, int]] = []
    stack: list[tuple[int, int]] = []

    for y in range(h):
        for x in range(w):
            if not mask[y, x] or visited[y, x]:
                continue
            area = 0
            sx = 0
            sy = 0
            stack.append((x, y))
            visited[y, x] = 1
            while stack:
                cx, cy = stack.pop()
                if not mask[cy, cx]:
                    continue
                area += 1
                sx += cx
                sy += cy
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    if visited[ny, nx]:
                        continue
                    visited[ny, nx] = 1
                    stack.append((nx, ny))
            comps.append((area, sx, sy))
    return comps


def find_hole_center(path: Path, side: Side, *, debug_out_dir: Path | None = None) -> HoleCenter:
    img = Image.open(path).convert("RGBA")
    a = np.array(img)
    h, w = a.shape[:2]

    x0, y0, x1, y1 = _roi_for_side(w, h, side)
    reg = a[y0:y1, x0:x1, :]

    rgb = reg[:, :, :3].astype(np.int32)
    alpha = reg[:, :, 3].astype(np.int32)
    brightness = rgb.sum(axis=2)

    # Dark-ish pixels inside ROI. White background is ~765, hole dot is much darker.
    mask = (brightness < 620) & (alpha > 0)

    comps = _connected_components(mask)
    if not comps:
        raise RuntimeError(f"No candidates found in ROI for {path.name}")

    # Choose a component with a plausible dot area.
    # Hole diameter is 26px => circle area ~ 530, but anti-aliasing can vary.
    best: HoleCenter | None = None
    for area, sx, sy in comps:
        if area < 120 or area > 1400:
            continue
        cx = x0 + (sx / area)
        cy = y0 + (sy / area)
        cand = HoleCenter(width=w, height=h, cx=float(cx), cy=float(cy), area=int(area))
        # Prefer larger components (more stable centroid).
        if best is None or cand.area > best.area:
            best = cand

    if best is None:
        # Fallback: pick the largest component in ROI.
        area, sx, sy = max(comps, key=lambda t: t[0])
        cx = x0 + (sx / area)
        cy = y0 + (sy / area)
        best = HoleCenter(width=w, height=h, cx=float(cx), cy=float(cy), area=int(area))

    if debug_out_dir is not None:
        debug_out_dir.mkdir(parents=True, exist_ok=True)
        out = img.copy()
        d = ImageDraw.Draw(out)
        r = 6
        d.ellipse((best.cx - r, best.cy - r, best.cx + r, best.cy + r), outline=(255, 0, 0), width=2)
        d.rectangle((x0, y0, x1, y1), outline=(0, 255, 0), width=2)
        out.save(debug_out_dir / f"{path.stem}_hole_debug.png")

    return best


def main() -> None:
    base = Path(__file__).resolve().parents[1] / "public" / "assets" / "card"
    debug_dir = Path(__file__).resolve().parents[1] / "scripts" / "_hole_debug"
    items: list[tuple[str, Side]] = [
        ("Group 13.png", "right"),
        ("Group 17.png", "left"),
    ]

    for name, side in items:
        r = find_hole_center(base / name, side, debug_out_dir=debug_dir)
        print(
            f"{name}: size={r.width}x{r.height} area={r.area} center=({r.cx:.2f},{r.cy:.2f}) "
            f"uv=({r.cx/r.width:.6f},{r.cy/r.height:.6f})"
        )


if __name__ == "__main__":
    main()
