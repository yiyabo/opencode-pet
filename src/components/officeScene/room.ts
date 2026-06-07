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

const podTone: Record<Desk["tone"], { surface: string; trim: string; front: string; support: string }> = {
  blue: { surface: "#172831", trim: "#3d6577", front: "#13202a", support: "#0b1418" },
  green: { surface: "#172a22", trim: "#3d654f", front: "#122119", support: "#0b1510" },
  amber: { surface: "#2d2518", trim: "#765d2b", front: "#21190e", support: "#130f08" },
  mint: { surface: "#1b2a20", trim: "#4d6f4d", front: "#152117", support: "#0c150e" },
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
    const deskWidth = layout.width > 600 ? 178 : 142;
    const topHeight = layout.width > 600 ? 13 : 11;
    const frontHeight = layout.width > 600 ? 43 : 36;
    const x = Math.round(desk.x - deskWidth / 2);
    const topY = Math.round(desk.y + 18);
    const frontY = topY + topHeight - 2;
    const bottomY = frontY + frontHeight;
    const pulse = desk.focused ? frame % 54 < 36 : false;
    const chairWidth = layout.width > 600 ? 78 : 62;
    const chairX = Math.round(desk.x - chairWidth / 2);
    const chairY = Math.round(desk.y + 2);
    const legWidth = layout.width > 600 ? 14 : 11;

    shadow(ctx, x + 10, bottomY + 4, deskWidth - 12, 9, 0.28);

    pixel(ctx, chairX, chairY, chairWidth, 46, "#0b1214");
    pixel(ctx, chairX + 4, chairY + 4, chairWidth - 8, 38, "#152024");
    strokeRect(ctx, chairX, chairY, chairWidth, 46, "#273a3f");
    pixel(ctx, chairX + 8, chairY + 8, 5, 30, "#223238");
    pixel(ctx, chairX + chairWidth - 13, chairY + 8, 5, 30, "#091012");

    pixel(ctx, x, topY, deskWidth, topHeight, "#0a1113");
    pixel(ctx, x + 3, topY + 2, deskWidth - 6, topHeight - 3, tone.surface);
    pixel(ctx, x + 8, topY + 3, deskWidth - 16, 2, tone.trim);
    strokeRect(ctx, x, topY, deskWidth, topHeight, pulse ? "#d8fff4" : "#3b4e52");

    pixel(ctx, x + 7, frontY, deskWidth - 14, frontHeight, tone.front);
    pixel(ctx, x + 12, frontY + 5, deskWidth - 24, 4, "#26383d");
    pixel(ctx, x + 14, bottomY - 9, deskWidth - 28, 3, "#0a1113");
    withAlpha(ctx, 0.28, () => pixel(ctx, x + 12, frontY + 13, deskWidth - 24, 1, tone.trim));

    pixel(ctx, x + 16, frontY + 24, legWidth, frontHeight + 7, tone.support);
    pixel(ctx, x + deskWidth - 16 - legWidth, frontY + 24, legWidth, frontHeight + 7, tone.support);
    pixel(ctx, x + 11, bottomY + 8, legWidth + 10, 4, "#070d0f");
    pixel(ctx, x + deskWidth - 21 - legWidth, bottomY + 8, legWidth + 10, 4, "#070d0f");

    withAlpha(ctx, desk.hovered ? 0.24 : 0.14, () => {
      pixel(ctx, x + 10, frontY + 11, deskWidth - 20, 1, desk.accent);
      pixel(ctx, x + 10, bottomY - 3, deskWidth - 20, 1, "#d8fff4");
    });
  });
}
