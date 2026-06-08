import type { OpenCodeWorkspaceState, TodoItem } from "../../types";
import { catSpriteKey } from "./assets";
import {
  line,
  pixel,
  shadow,
  strokeRect,
  text,
  withAlpha,
} from "./canvasPrimitives";
import { CANVAS_HEIGHT, PIXEL_ALERT, officeLayout } from "./layout";
import { petDesks, visibleSessionCount } from "./model";
import { drawRoomStructure, drawWorkstationBackLayer, drawWorkstationFrontLayer } from "./room";
import { compactCanvasText, textVisualWidth } from "./text";
import type {
  CatSpritePose,
  CatSpriteRegistry,
  Desk,
  HitBox,
  OfficeLayout,
  OfficeStageRenderState,
} from "./types";

export interface RenderOfficeSceneInput extends OfficeStageRenderState {
  ctx: CanvasRenderingContext2D;
  sprites: CatSpriteRegistry;
}

function deskHoverLines(desk: Desk): string[] {
  const title = compactCanvasText(desk.label, 18).toUpperCase();
  const lines = [title];

  const status = desk.activityStatus ?? desk.status ?? "empty";
  const statusLabel = status === "working" ? "WORKING"
    : status === "completed" || status === "followed" ? "READY"
    : status === "error" ? "NEEDS ATTENTION"
    : status === "quiet" ? "NO RESPONSE"
    : status === "drift" ? "OUT OF SYNC"
    : status === "ready" ? "READY"
    : "IDLE";
  lines.push(statusLabel);

  if (desk.messageCount !== undefined) {
    lines.push(`${desk.messageCount} MESSAGES`);
  }

  if (desk.lastUserMessage) {
    lines.push(`YOU: ${compactCanvasText(desk.lastUserMessage, 16)}`);
  } else if (desk.lastAssistantMessage) {
    lines.push(`AI: ${compactCanvasText(desk.lastAssistantMessage, 16)}`);
  } else if (desk.toolName) {
    lines.push(`TOOL: ${compactCanvasText(desk.toolName, 14)}`);
  }

  return lines.slice(0, 4);
}

function drawPixelTooltip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: string[],
  accent: string,
  frame: number,
  widthLimit: number,
) {
  if (lines.length === 0) return;
  const width = Math.max(58, Math.min(150, Math.max(...lines.map((lineText) => lineText.length)) * 6 + 14));
  const height = 12 + lines.length * 10;
  const clampedX = Math.max(18, Math.min(widthLimit - width - 18, Math.round(x)));
  const clampedY = Math.max(82, Math.min(CANVAS_HEIGHT - height - 32, Math.round(y)));
  const blink = frame % 64 < 44;

  shadow(ctx, clampedX + 4, clampedY + height + 2, width, 7, 0.28);
  pixel(ctx, clampedX, clampedY, width, height, "#071012");
  pixel(ctx, clampedX + 2, clampedY + 2, width - 4, height - 4, "#172326");
  strokeRect(ctx, clampedX, clampedY, width, height, blink ? accent : "#536368");
  pixel(ctx, clampedX + 6, clampedY + 6, 5, 5, blink ? accent : "#425458");
  text(ctx, lines[0], clampedX + 15, clampedY + 4, "#d8fff4", 6);
  lines.slice(1).forEach((lineText, index) => {
    text(ctx, lineText, clampedX + 7, clampedY + 15 + index * 9, index === 0 ? "#f0e2bf" : "#9fb4b8", 6);
  });
}

function drawDeskFocusFrame(ctx: CanvasRenderingContext2D, desk: Desk, frame: number) {
  if (!desk.focused) return;
  const x = desk.x - 88;
  const y = desk.y - 73;
  const width = 176;
  const height = 145;
  const color = frame % 50 < 34 ? "#d8fff4" : desk.accent;
  withAlpha(ctx, 0.42, () => {
    pixel(ctx, x, y, 28, 2, color);
    pixel(ctx, x, y, 2, 22, color);
    pixel(ctx, x + width - 28, y, 28, 2, color);
    pixel(ctx, x + width - 2, y, 2, 22, color);
    pixel(ctx, x, y + height - 2, 28, 2, color);
    pixel(ctx, x, y + height - 22, 2, 22, color);
    pixel(ctx, x + width - 28, y + height - 2, 28, 2, color);
    pixel(ctx, x + width - 2, y + height - 22, 2, 22, color);
  });
  withAlpha(ctx, 0.16, () => {
    const sweep = y + 8 + (Math.floor(frame / 3) % Math.max(1, height - 18));
    pixel(ctx, x + 5, sweep, width - 10, 1, color);
  });
  pixel(ctx, desk.x - 15, desk.y - 72, 32, 9, "#d8fff4");
  text(ctx, "FOCUS", desk.x - 12, desk.y - 71, "#0d1a18", 6);
}

function drawDeskHoverFrame(ctx: CanvasRenderingContext2D, desk: Desk, frame: number) {
  const x = desk.x - 87;
  const y = desk.y - 71;
  const width = 174;
  const height = 141;
  const color = frame % 54 < 36 ? "#f7fff7" : desk.accent;
  const shimmer = Math.floor(frame / 5) % Math.max(1, width - 52);

  withAlpha(ctx, 0.18, () => {
    pixel(ctx, x + 9, y + 9, width - 18, height - 18, desk.accent);
  });
  withAlpha(ctx, 0.55, () => {
    pixel(ctx, x, y, 24, 2, color);
    pixel(ctx, x, y, 2, 18, color);
    pixel(ctx, x + width - 24, y, 24, 2, color);
    pixel(ctx, x + width - 2, y, 2, 18, color);
    pixel(ctx, x, y + height - 2, 24, 2, color);
    pixel(ctx, x, y + height - 18, 2, 18, color);
    pixel(ctx, x + width - 24, y + height - 2, 24, 2, color);
    pixel(ctx, x + width - 2, y + height - 18, 2, 18, color);
  });
  withAlpha(ctx, 0.34, () => pixel(ctx, x + 26 + shimmer, y + 3, 26, 1, color));
}

function drawCityLights(ctx: CanvasRenderingContext2D, x: number, index: number, frame: number) {
  const drift = Math.floor(frame / 34);
  for (let col = 0; col < 5; col += 1) {
    const height = 7 + ((index * 11 + col * 5) % 14);
    const bx = x + 12 + col * 9;
    const by = 54 - height;
    pixel(ctx, bx, by, 6, height, col % 2 === 0 ? "#17262c" : "#1c3138");
    for (let row = 0; row < Math.floor(height / 5); row += 1) {
      const on = (index * 19 + col * 7 + row * 5 + drift) % 4 !== 0;
      if (on) pixel(ctx, bx + 2, by + 2 + row * 5, 2, 1, row % 2 === 0 ? "#f6d879" : "#8ecaff");
    }
  }
}

function drawPixelNoise(ctx: CanvasRenderingContext2D, layout: OfficeLayout, innerX: number, innerWidth: number) {
  withAlpha(ctx, 0.13, () => {
    for (let y = 72; y < 468; y += 8) {
      for (let x = innerX + 3; x < innerX + innerWidth - 8; x += 8) {
        const value = (x * 17 + y * 31) % 11;
        if (value === 0) pixel(ctx, x, y, 2, 2, "#314044");
        if (value === 1) pixel(ctx, x + 5, y + 4, 1, 1, "#0e171a");
      }
    }
  });
  withAlpha(ctx, 0.08, () => {
    for (let index = 0; index < layout.noiseMarks; index += 1) {
      const x = innerX + 12 + ((index * 131) % Math.max(1, innerWidth - 48));
      const y = 94 + ((index * 73) % 350);
      pixel(ctx, x, y, 5 + (index % 3) * 2, 1, "#536368");
      pixel(ctx, x + 2, y + 2, 2, 1, "#0b1214");
    }
  });
}

function drawShell(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
  const shellX = layout.shellX;
  const shellW = layout.width - shellX * 2;
  const innerX = shellX + 17;
  const innerW = layout.width - innerX * 2;
  const rightWallX = innerX + innerW;

  pixel(ctx, 0, 0, layout.width, CANVAS_HEIGHT, "#050b0e");
  pixel(ctx, shellX, 16, shellW, 460, "#111a1d");
  pixel(ctx, innerX, 77, innerW, 386, "#1c282c");

  pixel(ctx, shellX, 0, shellW, 92, "#101a1e");
  pixel(ctx, shellX + 8, 14, shellW - 16, 12, "#263943");
  pixel(ctx, shellX + 8, 62, shellW - 16, 8, "#071012");
  pixel(ctx, innerX, 75, innerW, 5, "#31464d");
  pixel(ctx, innerX, 463, innerW, 8, "#090f11");
  pixel(ctx, shellX, 75, 16, 401, "#293b42");
  pixel(ctx, rightWallX, 75, 15, 401, "#080e10");

  for (let y = 88; y < 463; y += 16) {
    line(ctx, innerX, y, innerX + innerW - 1, y, "#2a3a3f");
    line(ctx, innerX, y + 1, innerX + innerW - 1, y + 1, "#152126");
  }

  for (let x = innerX + 8; x < innerX + innerW; x += 18) {
    line(ctx, x, 76, x, 463, "#142126");
    if ((x / 18) % 4 === 0) line(ctx, x + 1, 76, x + 1, 463, "#26363b");
  }

  drawPixelNoise(ctx, layout, innerX, innerW);
}

function drawWindows(ctx: CanvasRenderingContext2D, frame: number, layout: OfficeLayout) {
  layout.windowXs.forEach((x, index) => {
    const windowWidth = layout.windowWidth;
    pixel(ctx, x, 4, windowWidth, 58, "#080f12");
    pixel(ctx, x + 7, 9, windowWidth - 14, 19, "#314858");
    pixel(ctx, x + 7, 35, windowWidth - 14, 20, "#243945");
    pixel(ctx, x + 11, 13, windowWidth - 22, 7, "#536d7e");
    pixel(ctx, x + 11, 39, windowWidth - 22, 6, "#3f5667");
    drawCityLights(ctx, x, index, frame);
    withAlpha(ctx, 0.2, () => line(ctx, x + 10, 11, x + windowWidth - 10, 48, "#c9f7ff"));
  });

  const titleX = Math.round(layout.width / 2 - (layout.title.length * 5) / 2);
  text(ctx, layout.title, titleX, 30, "#d7efe8", 8);
  withAlpha(ctx, 0.38, () => pixel(ctx, titleX - 7, 43, layout.title.length * 5 + 14, 2, "#55d69e"));
}

function statusBubbleAccent(desk: Desk): string {
  if (desk.awaitingUser) return "#ffd166";
  const status = desk.activityStatus;
  if (status === "working" || status === "followed") return "#8ecaff";
  if (status === "error" || status === "drift" || status === "quiet") return PIXEL_ALERT;
  if (status === "completed") return "#55d69e";
  return desk.accent;
}

// One adaptive pixel bubble above each cat's head: status headline + (optional)
// todo progress bar. Replaces the old side/bottom todo bubbles — one cat, one bubble.
function drawStatusBubble(
  ctx: CanvasRenderingContext2D,
  desk: Desk,
  todos: TodoItem[],
  widthLimit: number,
  compact: boolean,
) {
  const fontSize = compact ? 6 : 7;
  const charWidth = fontSize * 0.62;
  const padX = 7;
  const padY = 5;
  const dotSize = 5;
  const lineHeight = fontSize + 5;

  const accent = statusBubbleAccent(desk);
  const fallback = compactCanvasText(desk.label, 16).toUpperCase();
  const rawHeadline = (desk.bubbleHeadline ?? "").trim() || fallback;
  const headline = compactCanvasText(rawHeadline, compact ? 16 : 28);

  const hasTodos = todos.length > 0;
  const completed = hasTodos ? todos.filter((todo) => todo.status === "completed").length : 0;
  const done = hasTodos && completed === todos.length;
  const progressLabel = hasTodos ? `${completed}/${todos.length}` : "";

  const headlineWidth = textVisualWidth(headline) * charWidth + dotSize + 5;
  const progressWidth = hasTodos ? 30 + progressLabel.length * charWidth : 0;
  const innerWidth = Math.max(headlineWidth, progressWidth);
  const bubbleWidth = Math.round(Math.min(widthLimit - 24, Math.max(compact ? 60 : 78, innerWidth + padX * 2)));
  const bubbleHeight = Math.round(padY * 2 + lineHeight + (hasTodos ? lineHeight : 0));

  const tailHeight = 5;
  const headTop = desk.y - 46;
  const bubbleX = Math.max(12, Math.min(widthLimit - bubbleWidth - 12, Math.round(desk.x - bubbleWidth / 2)));
  const bubbleY = Math.max(78, Math.round(headTop - tailHeight - bubbleHeight - 2));

  shadow(ctx, bubbleX + 3, bubbleY + bubbleHeight + 2, bubbleWidth, 6, 0.28);
  pixel(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, "#0a1416");
  pixel(ctx, bubbleX + 2, bubbleY + 2, bubbleWidth - 4, bubbleHeight - 4, "#162326");
  strokeRect(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, "#33474c");
  pixel(ctx, bubbleX, bubbleY, 3, bubbleHeight, accent);

  const textX = bubbleX + padX;
  const headlineY = bubbleY + padY;
  pixel(ctx, textX, headlineY + 1, dotSize, dotSize, accent);
  text(ctx, headline, textX + dotSize + 5, headlineY, "#d8fff4", fontSize);

  if (hasTodos) {
    const rowY = headlineY + lineHeight;
    const labelWidth = progressLabel.length * charWidth + 4;
    const barX = textX;
    const barWidth = Math.max(12, bubbleWidth - padX * 2 - labelWidth - 4);
    const barY = rowY + 2;
    pixel(ctx, barX, barY, barWidth, 3, "#1a2e32");
    const fillWidth = Math.round((completed / Math.max(todos.length, 1)) * barWidth);
    if (fillWidth > 0) pixel(ctx, barX, barY, fillWidth, 3, done ? "#55d69e" : "#8ecaff");
    text(ctx, progressLabel, barX + barWidth + 4, rowY, done ? "#55d69e" : "#8ecaff", fontSize);
  }

  const tailX = Math.max(bubbleX + 6, Math.min(bubbleX + bubbleWidth - 12, Math.round(desk.x - 3)));
  const tailTop = bubbleY + bubbleHeight;
  pixel(ctx, tailX, tailTop, 6, 3, "#162326");
  pixel(ctx, tailX + 1, tailTop + 3, 3, 2, "#162326");
}

function drawDeskNameplate(ctx: CanvasRenderingContext2D, desk: Desk) {
  const label = compactCanvasText(desk.label, 12).toUpperCase();
  const empty = !desk.sessionId || desk.status === "empty";
  const linked = desk.status === "linked";
  const drift = desk.status === "drift";
  const dotColor = empty ? "#7d8c91" : linked ? "#55d69e" : drift ? "#ffd166" : "#7d8c91";
  const linkText = empty ? "BIND" : linked ? "LINKED" : drift ? "DRIFT" : "LOCAL";
  const w = Math.max(72, label.length * 6 + 30);
  const x = Math.round(desk.x - w / 2);
  const y = desk.y + 44;
  const borderColor = desk.focused ? "#d8fff4" : desk.hovered ? "#d8fff4" : "#33474c";
  shadow(ctx, x + 3, y + 15, w, 4, 0.25);
  pixel(ctx, x, y, w, 15, "#0b1416");
  pixel(ctx, x + 1, y + 1, w - 2, 13, "#162326");
  strokeRect(ctx, x, y, w, 15, borderColor);
  pixel(ctx, x + 5, y + 5, 5, 5, dotColor);
  text(ctx, label, x + 13, y + 4, "#d8fff4", 6);
  text(ctx, linkText, x + w - linkText.length * 4 - 5, y + 5, dotColor, 5);
}

function drawFallbackCat(ctx: CanvasRenderingContext2D, desk: Desk, state: CatSpritePose, bob: number) {
  const x = Math.round(desk.x);
  const y = Math.round(desk.y + bob);
  const coat = desk.worker === "orange" ? "#d8874d"
    : desk.worker === "calico" ? "#f0d8b5"
    : desk.worker === "gray" ? "#9fa7aa"
    : "#15191d";
  const shade = desk.worker === "tuxedo" ? "#f2f2e8" : "#273238";
  const eye = state === "sleep" ? "#5c7177" : "#91ffbc";

  pixel(ctx, x - 23, y - 16, 46, 32, "#070b0d");
  pixel(ctx, x - 17, y - 24, 10, 10, "#070b0d");
  pixel(ctx, x + 7, y - 24, 10, 10, "#070b0d");
  pixel(ctx, x - 20, y - 13, 40, 27, coat);
  pixel(ctx, x - 13, y + 1, 26, 13, shade);
  pixel(ctx, x - 12, y - 6, 4, 3, eye);
  pixel(ctx, x + 8, y - 6, 4, 3, eye);
  pixel(ctx, x - 2, y - 1, 4, 3, "#eaa0ad");
  if (state === "work") pixel(ctx, x + 21, y - 7, 13, 5, desk.accent);
  if (state === "sleep") text(ctx, "z", x + 24, y - 27, "#8ecaff", 6);
}

function drawWorkstation(
  ctx: CanvasRenderingContext2D,
  desk: Desk,
  frame: number,
  sprites: CatSpriteRegistry,
) {
  const isEmpty = !desk.sessionId || desk.status === "empty";
  const state: CatSpritePose = isEmpty ? "sleep"
    : (desk.activityStatus === "working" || desk.activityStatus === "followed") ? "work" : "idle";
  const img = sprites[catSpriteKey(desk.worker, state)];
  drawDeskFocusFrame(ctx, desk, frame);
  if (desk.hovered) drawDeskHoverFrame(ctx, desk, frame);

  shadow(ctx, desk.x - 32, desk.y + 36, 64, 9, 0.28);
  const bob = isEmpty ? 0 : Math.round(Math.sin(frame * 0.05 + desk.x * 0.1) * 2);
  const spriteSize = 92;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(desk.x - spriteSize / 2), Math.round(desk.y - spriteSize / 2 + bob), spriteSize, spriteSize);
  } else {
    drawFallbackCat(ctx, desk, state, bob);
  }

}

function workstationHitBox(desk: Desk): HitBox | null {
  if (!desk.sessionId && !desk.petId) return null;
  if (!desk.sessionId && desk.petId) {
    return { id: desk.petId, kind: "cat", x: desk.x - 64, y: desk.y - 52, width: 128, height: 118 };
  }
  if (!desk.sessionId) return null;
  return { id: desk.sessionId, kind: "session", x: desk.x - 64, y: desk.y - 52, width: 128, height: 118 };
}

function drawHoverTooltip(
  ctx: CanvasRenderingContext2D,
  liveDesks: Desk[],
  hoverHit: HitBox | null,
  frame: number,
  widthLimit: number,
) {
  if (!hoverHit || hoverHit.kind !== "session") return;
  const desk = liveDesks.find((item) => item.sessionId === hoverHit.id);
  if (!desk) return;
  const tooltipX = desk.x - 102;
  const tooltipY = desk.y - 100;
  drawPixelTooltip(ctx, tooltipX, tooltipY, deskHoverLines(desk), desk.accent, frame, widthLimit);
}

function officeIssueLabel(workspaceState: OpenCodeWorkspaceState | null): string | null {
  if (!workspaceState) return null;
  if (!workspaceState.database_valid) {
    return workspaceState.database_status === "missing" ? "DATABASE MISSING" : "DATABASE CHECK";
  }
  if (!workspaceState.server_online) return "SERVER OFFLINE";
  return null;
}

function drawOfficeHint(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  liveDesks: Desk[],
  workspaceState: OpenCodeWorkspaceState | null,
) {
  const issue = officeIssueLabel(workspaceState);
  const empty = liveDesks.every((desk) => !desk.sessionId);
  if (!issue && !empty) return;

  const label = issue ?? "NO ACTIVE SESSIONS";
  const detail = issue ? "CHECK SETTINGS" : "REFRESH OFFICE";
  const width = Math.max(118, label.length * 6 + 18);
  const x = Math.round(layout.width / 2 - width / 2);
  const y = 236;

  shadow(ctx, x + 4, y + 31, width, 6, 0.2);
  pixel(ctx, x, y, width, 32, "#0a1416");
  pixel(ctx, x + 2, y + 2, width - 4, 28, "#162326");
  strokeRect(ctx, x, y, width, 32, issue ? PIXEL_ALERT : "#33474c");
  text(ctx, label, x + 9, y + 7, issue ? "#ffb49f" : "#d8fff4", 7);
  text(ctx, detail, x + 9, y + 19, "#6f8c96", 6);
}

function drawOfficeFooter(ctx: CanvasRenderingContext2D, layout: OfficeLayout, overflowCount: number) {
  pixel(ctx, 12, 488, 4, 4, "#55d69e");
  text(ctx, layout.footer, 20, 489, "#6f8c96", 6);
  if (overflowCount > 0) {
    const label = `+${overflowCount} MORE`;
    const x = Math.max(20, layout.width - label.length * 5 - 18);
    text(ctx, label, x, 489, "#ffd166", 6);
  }
}

export function renderOfficeScene({
  ctx,
  sessionLinks,
  pets = [],
  activityItems,
  attentionItems,
  workspaceState,
  focusedSessionId,
  frame,
  hoverHit,
  sessionTodos,
  sprites,
  isWebviewOpen,
}: RenderOfficeSceneInput): HitBox[] {
  const hoverSessionId = hoverHit?.kind === "session" ? hoverHit.id : null;
  const hoverPetId = hoverHit?.kind === "cat" ? hoverHit.id : null;
  const layout = officeLayout(isWebviewOpen);
  const liveDesks = petDesks(layout.desks, pets, activityItems, sessionLinks, focusedSessionId, attentionItems, sessionTodos).map((desk) => ({
    ...desk,
    hovered: Boolean((desk.sessionId && desk.sessionId === hoverSessionId) || (desk.petId && desk.petId === hoverPetId)),
  }));
  const overflowCount = Math.max(0, visibleSessionCount(activityItems, sessionLinks, pets) - layout.desks.length);

  ctx.clearRect(0, 0, layout.width, CANVAS_HEIGHT);
  drawShell(ctx, layout);
  drawWindows(ctx, frame, layout);
  drawRoomStructure(ctx, layout);
  drawWorkstationBackLayer(ctx, liveDesks, layout);
  liveDesks.forEach((desk) => drawWorkstation(ctx, desk, frame, sprites));
  drawWorkstationFrontLayer(ctx, liveDesks, layout, frame);
  liveDesks.forEach((desk) => {
    if (desk.sessionId || desk.petId) drawDeskNameplate(ctx, desk);
  });
  liveDesks.forEach((desk) => {
    if (desk.sessionId && desk.status !== "empty") {
      drawStatusBubble(ctx, desk, sessionTodos[desk.sessionId] ?? [], layout.width, isWebviewOpen);
    }
  });
  drawOfficeHint(ctx, layout, liveDesks, workspaceState);

  const hitBoxes = liveDesks
    .map((desk) => workstationHitBox(desk))
    .filter((box): box is HitBox => Boolean(box));

  if (frame < 240) {
    const fade = (240 - frame) / 240;
    const breath = (Math.sin(frame * 0.18) + 1) / 2;
    withAlpha(ctx, fade * (0.14 + breath * 0.32), () => {
      hitBoxes.forEach((box) => strokeRect(ctx, box.x - 1, box.y - 1, box.width + 2, box.height + 2, "#55d69e"));
    });
  }

  drawOfficeFooter(ctx, layout, overflowCount);
  if (!isWebviewOpen) {
    drawHoverTooltip(ctx, liveDesks, hoverHit, frame, layout.width);
  }

  return hitBoxes;
}
