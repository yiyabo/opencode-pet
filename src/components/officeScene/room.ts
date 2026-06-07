import {
  line,
  pixel,
  shadow,
  strokeRect,
  withAlpha,
} from "./canvasPrimitives";
import { CANVAS_HEIGHT } from "./layout";
import type { Desk, OfficeLayout } from "./types";

interface RoomBounds {
  innerX: number;
  innerWidth: number;
  rightWallX: number;
  floorY: number;
  floorBottom: number;
}

const podTone: Record<Desk["tone"], { base: string; trim: string; rug: string }> = {
  blue: { base: "#16242d", trim: "#2d5265", rug: "#203a4b" },
  green: { base: "#152820", trim: "#2e5945", rug: "#203f34" },
  amber: { base: "#2c2417", trim: "#6a5529", rug: "#473a1f" },
  mint: { base: "#18271f", trim: "#3f6143", rug: "#263d2e" },
};

function roomBounds(layout: OfficeLayout): RoomBounds {
  const innerX = layout.shellX + 17;
  const innerWidth = layout.width - innerX * 2;
  return {
    innerX,
    innerWidth,
    rightWallX: innerX + innerWidth,
    floorY: 84,
    floorBottom: 463,
  };
}

function drawFloor(ctx: CanvasRenderingContext2D, bounds: RoomBounds) {
  pixel(ctx, bounds.innerX + 2, bounds.floorY, bounds.innerWidth - 4, bounds.floorBottom - bounds.floorY, "#202429");
  pixel(ctx, bounds.innerX + 2, bounds.floorY, bounds.innerWidth - 4, 5, "#2f3a3f");
  pixel(ctx, bounds.innerX + 2, bounds.floorBottom - 5, bounds.innerWidth - 4, 5, "#090f11");

  for (let y = bounds.floorY + 22; y < bounds.floorBottom - 9; y += 26) {
    line(ctx, bounds.innerX + 8, y, bounds.rightWallX - 9, y, "#2b3136");
    line(ctx, bounds.innerX + 8, y + 1, bounds.rightWallX - 9, y + 1, "#171d21");
  }

  for (let x = bounds.innerX + 28; x < bounds.rightWallX - 12; x += 42) {
    line(ctx, x, bounds.floorY + 9, x, bounds.floorBottom - 9, "#171e22");
    line(ctx, x + 1, bounds.floorY + 9, x + 1, bounds.floorBottom - 9, "#242b2f");
  }

  withAlpha(ctx, 0.18, () => {
    pixel(ctx, bounds.innerX + 12, bounds.floorY + 18, bounds.innerWidth - 24, 1, "#a99f74");
  });
}

export function drawRoomStructure(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
  const bounds = roomBounds(layout);
  drawFloor(ctx, bounds);

  withAlpha(ctx, 0.12, () => {
    pixel(ctx, bounds.innerX + 8, 96, 4, CANVAS_HEIGHT - 136, "#e2f4ef");
    pixel(ctx, bounds.rightWallX - 12, 100, 3, CANVAS_HEIGHT - 144, "#000000");
  });
}

export function drawDeskPods(
  ctx: CanvasRenderingContext2D,
  desks: Desk[],
  layout: OfficeLayout,
  frame: number,
) {
  desks.forEach((desk) => {
    const tone = podTone[desk.tone];
    const podWidth = layout.width > 600 ? 172 : 136;
    const podHeight = layout.width > 600 ? 56 : 48;
    const x = Math.round(desk.x - podWidth / 2);
    const y = Math.round(desk.y + 21);
    const pulse = desk.focused ? frame % 54 < 36 : false;

    shadow(ctx, x + 8, y + podHeight + 3, podWidth - 8, 8, 0.28);
    pixel(ctx, x, y, podWidth, podHeight, "#11181b");
    pixel(ctx, x + 4, y + 4, podWidth - 8, podHeight - 8, tone.base);
    pixel(ctx, x + 9, y + 10, podWidth - 18, podHeight - 18, tone.rug);
    strokeRect(ctx, x, y, podWidth, podHeight, pulse ? "#d8fff4" : "#33474c");

    pixel(ctx, x + 8, y + 6, podWidth - 16, 3, tone.trim);
    withAlpha(ctx, 0.18, () => pixel(ctx, x + 12, y + podHeight - 12, podWidth - 24, 1, "#d8fff4"));
  });
}
