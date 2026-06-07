from __future__ import annotations

from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "pets"

LOGICAL_SIZE = 40
SCALE = 4
CANVAS = LOGICAL_SIZE * SCALE
TRANSPARENT = (0, 0, 0, 0)

OUTLINE = (4, 7, 13, 255)
FUR = (14, 17, 25, 255)
FUR_MID = (28, 34, 50, 255)
FUR_LIGHT = (54, 66, 95, 255)
EAR = (233, 116, 152, 255)
NOSE = (255, 148, 173, 255)
EYE = (108, 245, 162, 255)
EYE_GOLD = (255, 224, 103, 255)
EYE_RED = (255, 82, 112, 255)
CYAN = (88, 229, 255, 255)
CYAN_DIM = (34, 137, 171, 210)
PURPLE = (178, 142, 255, 255)
PINK = (255, 118, 188, 255)
SHADOW = (2, 5, 12, 100)


def logical_image() -> Image.Image:
    return Image.new("RGBA", (LOGICAL_SIZE, LOGICAL_SIZE), TRANSPARENT)


def scale_nearest(image: Image.Image) -> Image.Image:
    return image.resize((CANVAS, CANVAS), Image.Resampling.NEAREST)


def rect(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
    draw.rectangle(xy, fill=fill)


def sparkle(draw: ImageDraw.ImageDraw, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    rect(draw, (x, y - 2, x, y + 2), color)
    rect(draw, (x - 2, y, x + 2, y), color)


def z_mark(draw: ImageDraw.ImageDraw, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    rect(draw, (x, y, x + 4, y), color)
    rect(draw, (x + 3, y + 1, x + 3, y + 1), color)
    rect(draw, (x + 2, y + 2, x + 2, y + 2), color)
    rect(draw, (x, y + 3, x + 4, y + 3), color)


def draw_tail(
    draw: ImageDraw.ImageDraw,
    base_x: int,
    base_y: int,
    frame: int,
    mood: str,
    lying: bool = False,
) -> None:
    sway = [-1, 0, 1, 0][frame % 4]
    if mood == "error":
        points = [(base_x, base_y), (base_x + 6, base_y - 6), (base_x + 3, base_y - 12)]
    elif mood == "success":
        points = [(base_x, base_y), (base_x + 6, base_y - 9), (base_x + 2 + sway, base_y - 16)]
    elif lying:
        points = [(base_x, base_y), (base_x + 7, base_y + 1), (base_x + 11, base_y - 2)]
    else:
        points = [(base_x, base_y), (base_x + 6, base_y - 5), (base_x + 4 + sway, base_y - 13)]

    draw.line(points, fill=OUTLINE, width=5, joint="curve")
    draw.line(points, fill=FUR_MID, width=3, joint="curve")
    draw.point(points[-1], fill=FUR_LIGHT)


def draw_face(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    frame: int,
    mood: str,
    blink: bool = False,
    grooming: bool = False,
) -> None:
    eye_color = EYE
    if mood == "working" or mood == "chat":
        eye_color = CYAN
    elif mood == "success":
        eye_color = EYE_GOLD
    elif mood == "error":
        eye_color = EYE_RED

    if blink:
        rect(draw, (x + 8, y + 8, x + 10, y + 8), FUR_LIGHT)
        rect(draw, (x + 16, y + 8, x + 18, y + 8), FUR_LIGHT)
    elif mood == "sleep":
        rect(draw, (x + 8, y + 8, x + 11, y + 8), FUR_LIGHT)
        rect(draw, (x + 16, y + 8, x + 19, y + 8), FUR_LIGHT)
    else:
        rect(draw, (x + 8, y + 7, x + 10, y + 9), eye_color)
        rect(draw, (x + 16, y + 7, x + 18, y + 9), eye_color)
        draw.point((x + 9, y + 7), fill=(235, 255, 245, 255))
        draw.point((x + 17, y + 7), fill=(235, 255, 245, 255))

    draw.point((x + 13, y + 11), fill=NOSE)
    rect(draw, (x + 12, y + 13, x + 14, y + 13), FUR_LIGHT)
    if grooming:
        rect(draw, (x + 15, y + 13, x + 17, y + 14), PINK)
    else:
        draw.point((x + 11 + frame % 2, y + 12), fill=FUR_MID)
        draw.point((x + 16 - frame % 2, y + 12), fill=FUR_MID)


def draw_sitting_cat(frame: int, mood: str = "idle", paw: str | None = None) -> Image.Image:
    image = logical_image()
    draw = ImageDraw.Draw(image)
    bob = 1 if mood in {"working", "success", "chat"} and frame % 2 == 1 else 0
    head_y = 7 - bob
    body_y = 19 - bob
    blink = mood == "idle" and frame == 2

    draw.ellipse((9, 30, 31, 36), fill=SHADOW)
    draw_tail(draw, 27, body_y + 8, frame, mood)

    draw.ellipse((10, body_y - 1, 30, body_y + 14), fill=OUTLINE)
    draw.ellipse((11, body_y, 29, body_y + 13), fill=FUR)
    draw.arc((13, body_y + 1, 27, body_y + 14), 205, 340, fill=FUR_MID, width=2)
    rect(draw, (14, body_y + 11, 18, body_y + 14), FUR_MID)
    rect(draw, (22, body_y + 11, 26, body_y + 14), FUR_MID)

    if paw == "left":
        draw.ellipse((13, body_y + 5, 19, body_y + 11), fill=OUTLINE)
        draw.ellipse((14, body_y + 5, 18, body_y + 10), fill=FUR_LIGHT)
    elif paw == "right":
        draw.ellipse((21, body_y + 5, 27, body_y + 11), fill=OUTLINE)
        draw.ellipse((22, body_y + 5, 26, body_y + 10), fill=FUR_LIGHT)

    left_ear = [(11, head_y + 5), (14, head_y - 2), (17, head_y + 5)]
    right_ear = [(23, head_y + 5), (26, head_y - 2), (29, head_y + 5)]
    if mood == "error":
        left_ear = [(11, head_y + 5), (14, head_y + 1), (17, head_y + 6)]
        right_ear = [(23, head_y + 6), (26, head_y + 1), (29, head_y + 5)]

    draw.polygon(left_ear, fill=OUTLINE)
    draw.polygon(right_ear, fill=OUTLINE)
    draw.polygon([(13, head_y + 5), (14, head_y + 1), (16, head_y + 5)], fill=EAR)
    draw.polygon([(24, head_y + 5), (26, head_y + 1), (27, head_y + 5)], fill=EAR)
    draw.rounded_rectangle((9, head_y + 4, 31, head_y + 21), radius=7, fill=OUTLINE)
    draw.rounded_rectangle((10, head_y + 5, 30, head_y + 20), radius=6, fill=FUR)
    rect(draw, (12, head_y + 6, 17, head_y + 7), FUR_MID)
    rect(draw, (23, head_y + 6, 28, head_y + 7), FUR_MID)
    rect(draw, (13, head_y + 17, 27, head_y + 18), FUR_MID)
    draw_face(draw, 7, head_y + 4, frame, mood, blink=blink, grooming=paw is not None)

    return scale_nearest(image)


def draw_sleeping_cat(frame: int) -> Image.Image:
    image = logical_image()
    draw = ImageDraw.Draw(image)
    breathe = frame % 3 == 1
    y = 23 - (1 if breathe else 0)

    draw.ellipse((7, 31, 34, 36), fill=SHADOW)
    draw_tail(draw, 28, y + 5, frame, "sleep", lying=True)
    draw.rounded_rectangle((7, y - 1, 30, y + 9), radius=5, fill=OUTLINE)
    draw.rounded_rectangle((8, y, 29, y + 8), radius=4, fill=FUR)
    draw.rounded_rectangle((11, y - 9, 27, y + 5), radius=6, fill=OUTLINE)
    draw.rounded_rectangle((12, y - 8, 26, y + 4), radius=5, fill=FUR)
    draw.polygon([(13, y - 5), (15, y - 11), (17, y - 5)], fill=OUTLINE)
    draw.polygon([(22, y - 5), (24, y - 11), (26, y - 5)], fill=OUTLINE)
    draw_face(draw, 5, y - 8, frame, "sleep")
    z_mark(draw, 28, 11 - frame % 3, CYAN)
    z_mark(draw, 32, 5 - frame % 2, CYAN_DIM)
    return scale_nearest(image)


def draw_stretching_cat(frame: int) -> Image.Image:
    image = logical_image()
    draw = ImageDraw.Draw(image)
    reach = frame % 4
    y = 23 + (1 if reach in {1, 2} else 0)

    draw.ellipse((6, 31, 35, 36), fill=SHADOW)
    draw_tail(draw, 29, y + 5, frame, "success")
    draw.rounded_rectangle((8, y - 1, 31, y + 8), radius=5, fill=OUTLINE)
    draw.rounded_rectangle((9, y, 30, y + 7), radius=4, fill=FUR)
    rect(draw, (7, y + 5, 13, y + 7), FUR_MID)
    rect(draw, (25, y + 5, 34, y + 7), FUR_MID)
    draw.rounded_rectangle((5, y - 10, 20, y + 3), radius=5, fill=OUTLINE)
    draw.rounded_rectangle((6, y - 9, 19, y + 2), radius=4, fill=FUR)
    draw.polygon([(7, y - 6), (9, y - 12), (11, y - 6)], fill=OUTLINE)
    draw.polygon([(15, y - 6), (18, y - 12), (19, y - 5)], fill=OUTLINE)
    draw_face(draw, 1, y - 10, frame, "idle", blink=reach == 2)
    return scale_nearest(image)


def draw_state_frame(kind: str, frame: int) -> Image.Image:
    if kind == "sleep":
        return draw_sleeping_cat(frame)
    if kind == "grooming":
        return draw_sitting_cat(frame, "idle", paw="left" if frame % 2 == 0 else "right")
    if kind == "stretching":
        return draw_stretching_cat(frame)

    mood = {
        "idle": "idle",
        "working": "working",
        "thinking": "chat",
        "success": "success",
        "error": "error",
        "chat": "chat",
    }[kind]
    image = draw_sitting_cat(frame, mood)
    logical = image.resize((LOGICAL_SIZE, LOGICAL_SIZE), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(logical)

    if kind == "working":
        sparkle(draw, 31, 14 + frame % 2, CYAN)
        sparkle(draw, 8, 20 - frame % 2, CYAN_DIM)
        rect(draw, (14, 33, 26, 35), CYAN_DIM)
        rect(draw, (16 + frame % 3, 34, 17 + frame % 3, 34), CYAN)
    elif kind == "thinking":
        for i in range(3):
            color = CYAN if i == frame % 3 else PURPLE
            rect(draw, (29 + i * 3, 11 - i, 30 + i * 3, 12 - i), color)
    elif kind == "success":
        for x, y in [(8, 12), (31, 10), (33, 23), (10, 26)]:
            sparkle(draw, x + frame % 2, y, EYE_GOLD)
    elif kind == "error":
        rect(draw, (32, 9, 33, 18), EYE_RED)
        rect(draw, (32, 21, 33, 22), EYE_RED)
        sparkle(draw, 8, 20, EYE_RED)
    elif kind == "chat":
        draw.rounded_rectangle((26, 8, 38, 16), radius=2, fill=(5, 20, 31, 220), outline=CYAN)
        rect(draw, (29, 16, 31, 17), CYAN)
        for x in (29, 32, 35):
            rect(draw, (x, 11 + frame % 2, x + 1, 12 + frame % 2), CYAN)

    return scale_nearest(logical)


def save_gif(name: str, frame_factory: Callable[[int], Image.Image], count: int, duration: int) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames = [frame_factory(index) for index in range(count)]
    frames[0].save(
        OUT / name,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )


def write_attribution() -> None:
    (OUT / "ATTRIBUTION.md").write_text(
        "# Opencode Pet black cat assets\n\n"
        "The shipped `blackcat-*` GIFs are original procedural pixel art generated by "
        "`scripts/generate_pet_assets.py` for this project.\n\n"
        "Research note: VS Code Pets was evaluated as a reference because it is MIT licensed, "
        "but its `media/README.md` states that the cat author asked that cat assets not be "
        "freely distributed in GitHub. Those encrypted cat assets are therefore not bundled here.\n\n"
        "Design direction: cute black pixel cat, transparent background, OpenCode state overlays, "
        "no sound effects.\n",
        encoding="utf-8",
    )


def main() -> None:
    save_gif("blackcat-idle.gif", lambda index: draw_state_frame("idle", index), 4, 360)
    save_gif("blackcat-sleep.gif", lambda index: draw_state_frame("sleep", index), 6, 360)
    save_gif("blackcat-grooming.gif", lambda index: draw_state_frame("grooming", index), 6, 300)
    save_gif("blackcat-stretching.gif", lambda index: draw_state_frame("stretching", index), 4, 280)
    save_gif("blackcat-working.gif", lambda index: draw_state_frame("working", index), 4, 220)
    save_gif("blackcat-thinking.gif", lambda index: draw_state_frame("thinking", index), 4, 280)
    save_gif("blackcat-success.gif", lambda index: draw_state_frame("success", index), 4, 240)
    save_gif("blackcat-error.gif", lambda index: draw_state_frame("error", index), 4, 240)
    save_gif("blackcat-chat.gif", lambda index: draw_state_frame("chat", index), 4, 280)
    draw_state_frame("idle", 0).save(OUT / "blackcat-preview.png")
    write_attribution()


if __name__ == "__main__":
    main()
