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

interface WorkstationFurnitureMetrics {
  deskWidth: number;
  topHeight: number;
  frontHeight: number;
  x: number;
  topY: number;
  frontY: number;
  bottomY: number;
  chairWidth: number;
  chairX: number;
  chairY: number;
  legWidth: number;
}

const furnitureTone: Record<Desk["tone"], { surface: string; trim: string; front: string; support: string }> = {
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

function workstationFurnitureMetrics(desk: Desk, layout: OfficeLayout): WorkstationFurnitureMetrics {
  const deskWidth = layout.width > 600 ? 178 : 142;
  const topHeight = layout.width > 600 ? 13 : 11;
  const frontHeight = layout.width > 600 ? 39 : 33;
  const x = Math.round(desk.x - deskWidth / 2);
  const topY = Math.round(desk.y + 18);
  const frontY = topY + topHeight;
  const bottomY = frontY + frontHeight;
  const chairWidth = layout.width > 600 ? 78 : 62;
  const chairX = Math.round(desk.x - chairWidth / 2);
  const chairY = Math.round(desk.y + 2);
  const legWidth = layout.width > 600 ? 14 : 11;

  return {
    deskWidth,
    topHeight,
    frontHeight,
    x,
    topY,
    frontY,
    bottomY,
    chairWidth,
    chairX,
    chairY,
    legWidth,
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

function drawFileRack(ctx: CanvasRenderingContext2D, x: number, y: number, accent: string) {
  const width = 58;
  const height = 92;
  shadow(ctx, x + 5, y + height + 4, width - 2, 6, 0.18);
  pixel(ctx, x, y, width, height, "#0b1214");
  pixel(ctx, x + 4, y + 4, width - 8, height - 8, "#17242a");
  strokeRect(ctx, x, y, width, height, "#33464c");

  for (let shelfY = y + 24; shelfY <= y + 66; shelfY += 22) {
    pixel(ctx, x + 5, shelfY, width - 10, 4, "#0a1012");
    pixel(ctx, x + 7, shelfY, width - 14, 1, "#4a6269");
  }

  pixel(ctx, x + 10, y + 11, 12, 13, "#263942");
  pixel(ctx, x + 25, y + 9, 17, 15, "#2c3f48");
  pixel(ctx, x + 44, y + 13, 6, 11, accent);
  pixel(ctx, x + 12, y + 34, 10, 20, "#40535a");
  pixel(ctx, x + 25, y + 37, 16, 17, "#273942");
  pixel(ctx, x + 44, y + 32, 7, 22, "#5f6f72");
  pixel(ctx, x + 10, y + 61, 18, 14, "#2d3e45");
  pixel(ctx, x + 31, y + 61, 19, 14, "#1f3037");
  withAlpha(ctx, 0.45, () => {
    pixel(ctx, x + 13, y + 14, 5, 1, "#d8fff4");
    pixel(ctx, x + 28, y + 13, 8, 1, "#d8fff4");
    pixel(ctx, x + 14, y + 39, 5, 1, "#d8fff4");
    pixel(ctx, x + 34, y + 66, 8, 1, "#d8fff4");
  });
}

function drawPottedPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x + 4, y + 58, 38, 6, 0.2);

  pixel(ctx, x + 13, y + 39, 24, 20, "#4f6073");
  pixel(ctx, x + 10, y + 36, 30, 8, "#7f96ad");
  pixel(ctx, x + 14, y + 41, 22, 14, "#5f7890");
  pixel(ctx, x + 17, y + 36, 16, 4, "#4a2f22");
  strokeRect(ctx, x + 13, y + 39, 24, 20, "#2e3e4b");

  pixel(ctx, x + 24, y + 21, 4, 19, "#355f3c");
  pixel(ctx, x + 13, y + 23, 13, 6, "#4f8a52");
  pixel(ctx, x + 8, y + 17, 15, 6, "#5fa05f");
  pixel(ctx, x + 27, y + 20, 14, 6, "#4f8a52");
  pixel(ctx, x + 33, y + 12, 12, 6, "#6ab66b");
  pixel(ctx, x + 20, y + 10, 8, 15, "#6ab66b");
  pixel(ctx, x + 16, y + 3, 7, 13, "#5fa05f");
  pixel(ctx, x + 28, y + 4, 7, 13, "#6ab66b");
  pixel(ctx, x + 36, y + 23, 8, 13, "#427645");

  withAlpha(ctx, 0.38, () => {
    pixel(ctx, x + 18, y + 7, 2, 6, "#c9f7cf");
    pixel(ctx, x + 31, y + 8, 2, 6, "#c9f7cf");
    pixel(ctx, x + 36, y + 15, 2, 4, "#c9f7cf");
  });
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x + 4, y + 70, 42, 7, 0.2);

  pixel(ctx, x + 11, y, 26, 22, "#8aa7bd");
  pixel(ctx, x + 14, y + 3, 20, 16, "#b7dbf0");
  pixel(ctx, x + 15, y + 11, 18, 5, "#7fb2df");
  pixel(ctx, x + 18, y + 15, 12, 3, "#d8f3ff");
  strokeRect(ctx, x + 11, y, 26, 22, "#4a6474");

  pixel(ctx, x + 7, y + 22, 34, 45, "#263840");
  pixel(ctx, x + 10, y + 25, 28, 39, "#344952");
  strokeRect(ctx, x + 7, y + 22, 34, 45, "#4a6269");

  pixel(ctx, x + 13, y + 31, 22, 11, "#0b1416");
  pixel(ctx, x + 16, y + 34, 8, 3, "#7fb2df");
  pixel(ctx, x + 27, y + 34, 5, 3, "#d8fff4");
  pixel(ctx, x + 18, y + 43, 13, 9, "#17242a");
  pixel(ctx, x + 21, y + 46, 7, 3, "#5f7890");

  pixel(ctx, x + 9, y + 64, 30, 5, "#10191d");
  pixel(ctx, x + 13, y + 68, 8, 7, "#0a1113");
  pixel(ctx, x + 28, y + 68, 8, 7, "#0a1113");
}

export function drawRoomStructure(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
  const bounds = roomBounds(layout);
  drawFloor(ctx, bounds);

  if (layout.width > 600) {
    drawFileRack(ctx, bounds.innerX + 10, 204, "#65b7ff");
    drawFileRack(ctx, bounds.rightWallX - 68, 204, "#55d69e");
    drawWaterCooler(ctx, bounds.innerX + 18, 92);
    drawWaterCooler(ctx, bounds.innerX + 64, 92);
    drawPottedPlant(ctx, bounds.innerX + 18, 385);
    drawPottedPlant(ctx, bounds.rightWallX - 58, 385);
  }

  withAlpha(ctx, 0.12, () => {
    pixel(ctx, bounds.innerX + 8, 96, 4, CANVAS_HEIGHT - 136, "#e2f4ef");
    pixel(ctx, bounds.rightWallX - 12, 100, 3, CANVAS_HEIGHT - 144, "#000000");
  });
}

function drawDeskMonitor(
  ctx: CanvasRenderingContext2D,
  desk: Desk,
  layout: OfficeLayout,
  frame: number,
  topY: number,
) {
  const active = Boolean(desk.sessionId && desk.status !== "empty");
  if (!active) return;
  const working = desk.activityStatus === "working" || desk.activityStatus === "followed";
  const screenWidth = layout.width > 600 ? 118 : 92;
  const screenHeight = layout.width > 600 ? 42 : 34;
  const screenX = Math.round(desk.x - screenWidth / 2);
  const screenY = Math.round(topY - screenHeight + 4);
  const minX = layout.shellX + 34;
  const maxX = layout.width - layout.shellX - screenWidth - 34;
  const x = Math.max(minX, Math.min(maxX, screenX));
  const y = screenY;
  const borderColor = desk.focused ? "#d8fff4" : desk.accent;

  withAlpha(ctx, 0.2, () => {
    pixel(ctx, x + 5, y + 5, screenWidth - 10, screenHeight - 10, desk.accent);
  });
  withAlpha(ctx, 0.42, () => {
    pixel(ctx, x, y, screenWidth, 1, borderColor);
    pixel(ctx, x, y + screenHeight - 1, screenWidth, 1, borderColor);
    pixel(ctx, x, y, 1, screenHeight, borderColor);
    pixel(ctx, x + screenWidth - 1, y, 1, screenHeight, borderColor);
    pixel(ctx, x + 5, y + 5, 10, 1, "#d8fff4");
    pixel(ctx, x + screenWidth - 15, y + screenHeight - 6, 10, 1, "#d8fff4");
  });

  const lineColor = working ? desk.accent : "#9fb4b8";
  const codeY = y + 11;
  withAlpha(ctx, 0.62, () => pixel(ctx, x + 12, codeY, screenWidth - 35, 2, "#d8fff4"));
  withAlpha(ctx, 0.62, () => pixel(ctx, x + 12, codeY + 9, screenWidth - 49, 2, lineColor));
  withAlpha(ctx, 0.5, () => pixel(ctx, x + 12, codeY + 18, screenWidth - 42, 2, "#88a8ab"));
  if (working && frame % 42 < 26) {
    withAlpha(ctx, 0.8, () => pixel(ctx, x + screenWidth - 22, codeY + 18, 5, 2, "#d8fff4"));
  }
}

function drawDeskKeyboard(
  ctx: CanvasRenderingContext2D,
  desk: Desk,
  layout: OfficeLayout,
  topY: number,
) {
  if (!desk.sessionId || desk.status === "empty") return;
  const keyboardWidth = layout.width > 600 ? 56 : 44;
  const keyboardX = Math.round(desk.x - keyboardWidth / 2);
  const keyboardY = topY + 11;

  pixel(ctx, keyboardX, keyboardY, keyboardWidth, 8, "#070c0e");
  pixel(ctx, keyboardX + 3, keyboardY + 2, keyboardWidth - 6, 4, "#2d3b40");
  for (let x = keyboardX + 6; x < keyboardX + keyboardWidth - 6; x += 7) {
    pixel(ctx, x, keyboardY + 3, 3, 2, "#9fb4b8");
  }
  withAlpha(ctx, 0.4, () => pixel(ctx, keyboardX + keyboardWidth - 11, keyboardY + 3, 5, 2, desk.accent));
}

export function drawWorkstationBackLayer(
  ctx: CanvasRenderingContext2D,
  desks: Desk[],
  layout: OfficeLayout,
) {
  desks.forEach((desk) => {
    const tone = furnitureTone[desk.tone];
    const metrics = workstationFurnitureMetrics(desk, layout);

    pixel(ctx, metrics.chairX, metrics.chairY, metrics.chairWidth, 46, "#0b1214");
    pixel(ctx, metrics.chairX + 4, metrics.chairY + 4, metrics.chairWidth - 8, 38, "#152024");
    strokeRect(ctx, metrics.chairX, metrics.chairY, metrics.chairWidth, 46, "#273a3f");
    pixel(ctx, metrics.chairX + 8, metrics.chairY + 8, 5, 30, "#223238");
    pixel(ctx, metrics.chairX + metrics.chairWidth - 13, metrics.chairY + 8, 5, 30, "#091012");

    pixel(ctx, metrics.x + 9, metrics.topY - 2, metrics.deskWidth - 18, 6, "#0a1113");
    pixel(ctx, metrics.x + 14, metrics.topY, metrics.deskWidth - 28, 3, tone.surface);
    withAlpha(ctx, 0.22, () => pixel(ctx, metrics.x + 16, metrics.topY + 3, metrics.deskWidth - 32, 1, tone.trim));
  });
}

export function drawWorkstationFrontLayer(
  ctx: CanvasRenderingContext2D,
  desks: Desk[],
  layout: OfficeLayout,
  frame: number,
) {
  desks.forEach((desk) => {
    const tone = furnitureTone[desk.tone];
    const metrics = workstationFurnitureMetrics(desk, layout);
    const pulse = desk.focused ? frame % 54 < 36 : false;

    shadow(ctx, metrics.x + 6, metrics.bottomY + 7, metrics.deskWidth + 2, 11, 0.34);

    drawDeskMonitor(ctx, desk, layout, frame, metrics.topY);

    pixel(ctx, metrics.x - 6, metrics.topY + 7, metrics.deskWidth + 12, metrics.topHeight + 9, "#05090b");
    pixel(ctx, metrics.x - 2, metrics.topY + 9, metrics.deskWidth + 4, metrics.topHeight + 3, tone.surface);
    pixel(ctx, metrics.x + 8, metrics.topY + 10, metrics.deskWidth - 16, 3, tone.trim);
    pixel(ctx, metrics.x - 6, metrics.topY + metrics.topHeight + 13, metrics.deskWidth + 12, 5, "#060b0d");
    strokeRect(ctx, metrics.x - 6, metrics.topY + 7, metrics.deskWidth + 12, metrics.topHeight + 9, pulse ? "#d8fff4" : "#33484e");

    drawDeskKeyboard(ctx, desk, layout, metrics.topY);

    pixel(ctx, metrics.x, metrics.frontY, metrics.deskWidth, metrics.frontHeight + 3, "#060b0d");
    pixel(ctx, metrics.x + 5, metrics.frontY + 4, metrics.deskWidth - 10, metrics.frontHeight - 5, tone.front);
    pixel(ctx, metrics.x + 13, metrics.frontY + 8, metrics.deskWidth - 26, 6, "#2b4248");
    pixel(ctx, metrics.x + 13, metrics.bottomY - 8, metrics.deskWidth - 26, 5, "#050a0c");
    pixel(ctx, metrics.x + 5, metrics.frontY + 4, 13, metrics.frontHeight - 5, tone.support);
    pixel(ctx, metrics.x + metrics.deskWidth - 18, metrics.frontY + 4, 13, metrics.frontHeight - 5, tone.support);
    strokeRect(ctx, metrics.x, metrics.frontY, metrics.deskWidth, metrics.frontHeight + 3, "#1f3136");
    withAlpha(ctx, 0.28, () => pixel(ctx, metrics.x + 20, metrics.frontY + 16, metrics.deskWidth - 40, 1, tone.trim));

    pixel(ctx, metrics.x + 12, metrics.frontY + 21, metrics.legWidth + 7, metrics.frontHeight + 11, tone.support);
    pixel(ctx, metrics.x + metrics.deskWidth - 19 - metrics.legWidth, metrics.frontY + 21, metrics.legWidth + 7, metrics.frontHeight + 11, tone.support);
    pixel(ctx, metrics.x + 5, metrics.bottomY + 10, metrics.legWidth + 20, 5, "#05090a");
    pixel(ctx, metrics.x + metrics.deskWidth - 25 - metrics.legWidth, metrics.bottomY + 10, metrics.legWidth + 20, 5, "#05090a");

    withAlpha(ctx, desk.hovered ? 0.24 : 0.14, () => {
      pixel(ctx, metrics.x + 10, metrics.frontY + 11, metrics.deskWidth - 20, 1, desk.accent);
      pixel(ctx, metrics.x + 10, metrics.bottomY - 3, metrics.deskWidth - 20, 1, "#d8fff4");
    });
  });
}
