#!/usr/bin/env python3
"""Generate cat sprite candidates via the image API, save as PNG.

Run OUTSIDE the Claude sandbox (your own terminal), because the sandbox blocks
the image host. The API key is read from the IMG_API_KEY environment variable so
it never gets hard-coded into a committed file.

Usage:
    export IMG_API_KEY='sk-...your key...'
    python3 scripts/gen_cat_sprites.py            # generate the trial set
    python3 scripts/gen_cat_sprites.py --all      # generate the full set later

Output: public/pets/generated/<name>.png
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

API_URL = "https://unity2.ai/v1/images/generations"
MODEL = "gpt-image-2"
SIZE = "1024x1024"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "pets" / "generated"

# Shared style spine so every cat looks like it belongs to the same game.
STYLE = (
    "pixel art game sprite, single cat, full body, centered, front-facing, "
    "big friendly eyes, clean dark pixel outline, cozy and charming, "
    "limited cohesive color palette, crisp hard pixels with no anti-aliasing, "
    "the ENTIRE background is ONE solid flat pure magenta color #FF00FF used as a chroma key, "
    "absolutely NO checkerboard, no transparency pattern, no gradient, no shadow, no border, no frame, no text, "
    "character asset for a cozy coding-office game in the spirit of an 'OpenCode agent cat'"
)

# Trial set: a few wordings/poses to judge quality + transparency before bulk.
TRIAL = {
    "trial-tuxedo-sit": f"A cute tuxedo cat (black fur, white chest and paws) sitting upright, wearing a small green tech collar with a glowing dot. {STYLE}",
    "trial-tuxedo-type": f"A cute tuxedo cat (black fur, white chest and paws) sitting upright with both front paws resting on a small keyboard, wearing a small green tech collar. {STYLE}",
    "trial-orange-sit": f"A cute orange tabby cat sitting upright, wearing a small green tech collar with a glowing dot. {STYLE}",
}

# Full set (4 desk coats x key states) — enable later with --all once style is locked.
FULL = {
    # tuxedo / black
    "tuxedo-idle":  f"A cute tuxedo cat (black, white chest/paws) sitting upright, calm idle pose, green tech collar. {STYLE}",
    "tuxedo-work":  f"A cute tuxedo cat (black, white chest/paws) sitting upright with both paws resting on a keyboard, focused, green tech collar. {STYLE}",
    "tuxedo-sleep": f"A cute tuxedo cat (black, white chest/paws) curled up asleep, eyes closed, green tech collar. {STYLE}",
    # orange tabby
    "orange-idle":  f"A cute orange tabby cat sitting upright, calm idle pose, green tech collar. {STYLE}",
    "orange-work":  f"A cute orange tabby cat sitting upright with both paws resting on a keyboard, focused, green tech collar. {STYLE}",
    # calico
    "calico-idle":  f"A cute calico cat (white with orange and black patches) sitting upright, holding a tiny laser pointer, green tech collar. {STYLE}",
    "calico-work":  f"A cute calico cat (white with orange and black patches) sitting upright with both paws resting on a keyboard, green tech collar. {STYLE}",
    # gray (VR/reviewer)
    "gray-idle":    f"A cute gray cat sitting upright wearing small tech goggles, green tech collar. {STYLE}",
    "gray-work":    f"A cute gray cat sitting upright with both paws resting on a keyboard, wearing small tech goggles, green tech collar. {STYLE}",
    # sleeping (for empty desks)
    "orange-sleep": f"A cute orange tabby cat curled up asleep, eyes closed, green tech collar. {STYLE}",
    "calico-sleep": f"A cute calico cat (white with orange and black patches) curled up asleep, eyes closed, green tech collar. {STYLE}",
    "gray-sleep":   f"A cute gray cat curled up asleep, eyes closed, green tech collar. {STYLE}",
}


def generate(name: str, prompt: str, key: str) -> bool:
    body = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "size": SIZE,
        "response_format": "b64_json",
    }).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read())
    except Exception as exc:  # noqa: BLE001 - surface any failure to the user
        print(f"  ✗ {name}: {exc}")
        return False

    try:
        b64 = payload["data"][0]["b64_json"]
    except (KeyError, IndexError, TypeError):
        print(f"  ✗ {name}: unexpected response shape: {str(payload)[:200]}")
        return False

    out = OUT_DIR / f"{name}.png"
    out.write_bytes(base64.b64decode(b64))
    print(f"  ✓ {name} -> {out}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="generate the full set instead of the trial set")
    args = parser.parse_args()

    key = os.environ.get("IMG_API_KEY")
    if not key:
        print("ERROR: set IMG_API_KEY env var first:  export IMG_API_KEY='sk-...'")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = FULL if args.all else TRIAL
    print(f"Generating {len(jobs)} image(s) -> {OUT_DIR}")
    ok = sum(generate(name, prompt, key) for name, prompt in jobs.items())
    print(f"Done: {ok}/{len(jobs)} succeeded.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
