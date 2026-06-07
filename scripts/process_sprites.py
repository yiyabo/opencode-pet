#!/usr/bin/env python3
"""Post-process AI-generated cat images into clean transparent pixel sprites.

Runs INSIDE the sandbox (pure local image processing, no network needed).
Reads  public/pets/generated/*.png|webp
Writes public/pets/sprites/<name>.png  (transparent, downsampled, centered)

Background removal is automatic:
  - if the image has a flat magenta (#FF00FF) chroma background -> key it out (clean)
  - otherwise fall back to flood-filling a light/checkerboard background from the edges

Usage:  python3 scripts/process_sprites.py
"""
from __future__ import annotations

import glob
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = "public/pets/generated"
OUT = "public/pets/sprites"
TARGET = 96   # square output canvas
CAT_H = 82    # target cat height inside the canvas


def remove_bg(path: str) -> Image.Image:
    rgb = Image.open(path).convert("RGB")
    arr = np.array(rgb)
    # Preferred: flat magenta chroma key (what the updated prompt asks for).
    mag = (arr[:, :, 0] > 200) & (arr[:, :, 1] < 90) & (arr[:, :, 2] > 200)
    if mag.mean() > 0.12:
        alpha = np.where(mag, 0, 255).astype("uint8")
        return Image.fromarray(np.dstack([arr, alpha]), "RGBA")
    # Fallback: flood-fill a light/checkerboard background from the edges.
    w, h = rgb.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    px = rgb.load()
    for s in seeds:
        r, g, b = px[s]
        if min(r, g, b) > 195:
            ImageDraw.floodfill(rgb, s, (255, 0, 255), thresh=60)
    a2 = np.array(rgb)
    m2 = (a2[:, :, 0] > 240) & (a2[:, :, 1] < 20) & (a2[:, :, 2] > 240)
    return Image.fromarray(np.dstack([a2, np.where(m2, 0, 255).astype("uint8")]), "RGBA")


def process(path: str) -> bool:
    name = os.path.splitext(os.path.basename(path))[0].replace("trial-", "")
    src_size = Image.open(path).size
    im = remove_bg(path)
    bbox = im.getbbox()
    if not bbox:
        print(f"  ! {name}: empty after keying — skipped")
        return False
    bg_clean = bbox != (0, 0, *src_size)
    im = im.crop(bbox)
    sc = CAT_H / im.height
    small = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.NEAREST)
    canvas = Image.new("RGBA", (TARGET, TARGET), (0, 0, 0, 0))
    canvas.paste(small, ((TARGET - small.width) // 2, (TARGET - small.height) // 2), small)
    out = os.path.join(OUT, f"{name}.png")
    canvas.save(out)
    opaque = int((np.array(canvas)[:, :, 3] > 0).sum())
    flag = "ok" if bg_clean else "BG-NOT-CLEAN"
    print(f"  {'✓' if bg_clean else '⚠'} {name} -> {out}  cat={small.size} opaque={opaque}/{TARGET*TARGET} [{flag}]")
    return bg_clean


def main() -> int:
    paths = sorted(glob.glob(f"{SRC}/*.png")) + sorted(glob.glob(f"{SRC}/*.webp"))
    if not paths:
        print(f"No images in {SRC}/ — run scripts/gen_cat_sprites.py first.")
        return 1
    os.makedirs(OUT, exist_ok=True)
    print(f"Processing {len(paths)} image(s) -> {OUT}/")
    clean = sum(process(p) for p in paths)
    print(f"DONE: {clean}/{len(paths)} backgrounds fully clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
