import {
  line,
  pixel,
  shadow,
  strokeRect,
  text,
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
    floorY: 278,
    floorBottom: 463,
  };
}

function drawFloor(ctx: CanvasRenderingContext2D, bounds: RoomBounds, frame: number) {
  pixel(ctx, bounds.innerX + 2, bounds.floorY, bounds.innerWidth - 4, bounds.floorBottom - bounds.floorY, "#202429");
  pixel(ctx, bounds.innerX + 2, bounds.floorY, bounds.innerWidth - 4, 5, "#2f3a3f");
  pixel(ctx, bounds.innerX + 2, bounds.floorBottom - 5, bounds.innerWidth - 4, 5, "#090f11");

  for (let y = bounds.floorY + 20; y < bounds.floorBottom - 9; y += 24) {
    line(ctx, bounds.innerX + 4, y, bounds.rightWallX - 5, y, "#2a3035");
    line(ctx, bounds.innerX + 4, y + 1, bounds.rightWallX - 5, y + 1, "#171d21");
  }

  for (let x = bounds.innerX + 18; x < bounds.rightWallX - 10; x += 36) {
    const drift = Math.floor(frame / 70) % 2;
    line(ctx, x + drift, bounds.floorY + 9, x - 18 + drift, bounds.floorBottom - 8, "#171e22");
  }

  withAlpha(ctx, 0.18, () => {
    pixel(ctx, bounds.innerX + 16, bounds.floorY + 18, bounds.innerWidth - 34, 1, "#a99f74");
    pixel(ctx, bounds.innerX + 22, bounds.floorY + 74, bounds.innerWidth - 46, 1, "#a99f74");
  });
}

function drawWallPanels(ctx: CanvasRenderingContext2D, layout: OfficeLayout, bounds: RoomBounds) {
  const wallBottom = bounds.floorY;
  pixel(ctx, bounds.innerX + 2, 84, bounds.innerWidth - 4, wallBottom - 84, "#1b2629");
  pixel(ctx, bounds.innerX + 2, wallBottom - 12, bounds.innerWidth - 4, 7, "#26343a");
  pixel(ctx, bounds.innerX + 2, wallBottom - 5, bounds.innerWidth - 4, 5, "#10181b");

  for (let x = bounds.innerX + 18; x < bounds.rightWallX - 12; x += 72) {
    line(ctx, x, 92, x, wallBottom - 15, "#142024");
    line(ctx, x + 1, 92, x + 1, wallBottom - 15, "#263236");
  }

  if (layout.width > 600) {
    drawFullWallDecor(ctx, bounds);
  } else {
    drawDockWallDecor(ctx, bounds);
  }
}

function drawFullWallDecor(ctx: CanvasRenderingContext2D, bounds: RoomBounds) {
  const boardX = bounds.innerX + Math.round(bounds.innerWidth / 2) - 62;
  const boardY = 106;
  shadow(ctx, boardX + 4, boardY + 44, 124, 6, 0.22);
  pixel(ctx, boardX, boardY, 124, 42, "#0f181b");
  pixel(ctx, boardX + 3, boardY + 3, 118, 36, "#26313a");
  strokeRect(ctx, boardX, boardY, 124, 42, "#4b5d62");
  pixel(ctx, boardX + 12, boardY + 12, 28, 4, "#6d8d7a");
  pixel(ctx, boardX + 12, boardY + 22, 42, 3, "#9f7359");
  pixel(ctx, boardX + 69, boardY + 12, 34, 3, "#8ecaff");
  pixel(ctx, boardX + 69, boardY + 22, 24, 3, "#55d69e");
  pixel(ctx, boardX + 105, boardY + 12, 5, 16, "#d2b86a");

  const shelfX = bounds.rightWallX - 142;
  const shelfY = 214;
  pixel(ctx, shelfX, shelfY, 96, 5, "#4d3d2d");
  pixel(ctx, shelfX + 5, shelfY - 13, 13, 13, "#2f5f4a");
  pixel(ctx, shelfX + 8, shelfY - 20, 7, 8, "#55d69e");
  pixel(ctx, shelfX + 29, shelfY - 14, 8, 14, "#6b4a30");
  pixel(ctx, shelfX + 40, shelfY - 18, 8, 18, "#3f5667");
  pixel(ctx, shelfX + 52, shelfY - 11, 27, 11, "#26313a");
}

function drawDockWallDecor(ctx: CanvasRenderingContext2D, bounds: RoomBounds) {
  const boardX = bounds.innerX + 22;
  const boardY = 204;
  pixel(ctx, boardX, boardY, 52, 31, "#10181b");
  pixel(ctx, boardX + 3, boardY + 3, 46, 25, "#26313a");
  strokeRect(ctx, boardX, boardY, 52, 31, "#3d4d52");
  pixel(ctx, boardX + 8, boardY + 9, 17, 3, "#6d8d7a");
  pixel(ctx, boardX + 8, boardY + 17, 29, 3, "#9f7359");

  const railX = bounds.rightWallX - 80;
  const railY = 206;
  pixel(ctx, railX, railY, 54, 4, "#4d3d2d");
  pixel(ctx, railX + 8, railY - 11, 8, 11, "#2f5f4a");
  pixel(ctx, railX + 27, railY - 9, 18, 9, "#26313a");
}

export function drawRoomStructure(ctx: CanvasRenderingContext2D, layout: OfficeLayout, frame: number) {
  const bounds = roomBounds(layout);
  drawWallPanels(ctx, layout, bounds);
  drawFloor(ctx, bounds, frame);

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
  desks.forEach((desk, index) => {
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
    withAlpha(ctx, 0.28, () => pixel(ctx, x + 13, y + podHeight - 13, podWidth - 26, 1, desk.accent));

    const cableY = y + podHeight - 8;
    line(ctx, x + 16, cableY, x + podWidth - 18, cableY, "#0b1113");
    pixel(ctx, x + 24 + (index % 3) * 14, cableY - 4, 5, 5, desk.accent);

    if (layout.width > 600) {
      text(ctx, `${index + 1}`.padStart(2, "0"), x + podWidth - 20, y + 13, "#4f6568", 6);
    }
  });
}
