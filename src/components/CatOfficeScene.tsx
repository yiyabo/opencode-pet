import { useEffect, useRef } from "react";
import type {
  OpenCodeActivityItem,
  OpenCodeAttentionItem,
  OpenCodeEvent,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  TodoItem,
} from "../types";

interface SceneCat {
  id: string;
  name: string;
  provider: string;
  status: string;
  accent: string;
  face: string;
}

interface CatOfficeSceneProps {
  cats: SceneCat[];
  sessionLinks?: OpenCodeSessionLink[];
  activityItems?: OpenCodeActivityItem[];
  attentionItems?: OpenCodeAttentionItem[];
  workspaceState?: OpenCodeWorkspaceState | null;
  dispatchSignal?: SceneDispatchSignal | null;
  latestEvent?: OpenCodeEvent | null;
  eventHistory?: OpenCodeEvent[];
  focusedSessionId?: string | null;
  sessionTodos?: Record<string, TodoItem[]>;
  onSelectCat: (id: string) => void;
  onSelectSession?: (id: string) => void;
  onRunSessionAction?: (id: string) => void;
  onRunOpsAction?: (action: OpsActionKind) => void;
}

type OpsActionKind = "open" | "start" | "align" | "match" | "dispatch" | string;

interface SceneDispatchSignal {
  state: "pending" | "success" | "warning" | "error";
  targetSessionId?: string;
  dispatchContext?: string;
  dispatchLabel?: string;
  routeCode?: string;
  observation?: "idle" | "watching" | "observed" | "quiet";
  observedEvents?: number;
  observedMessages?: number;
}

interface HitBox {
  id: string;
  kind: "cat" | "session";
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Desk {
  x: number;
  y: number;
  label: string;
  accent: string;
  tone: "blue" | "green" | "amber" | "mint";
  worker: CatCoat;
  status?: "linked" | "drift" | "local" | "server" | "empty";
  activityStatus?: OpenCodeActivityItem["status"] | "linked" | "empty";
  phase?: string;
  sessionId?: string;
  detail?: string;
  summary?: string;
  statusReason?: string;
  lastSignal?: string;
  source?: string;
  toolName?: string;
  model?: string;
  messageCount?: number;
  eventType?: string;
  eventSeverity?: string;
  lastRole?: string;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  awaitingUser?: boolean;
  idleMs?: number;
  totalTools?: number;
  completedTools?: number;
  actionKind?: OpenCodeAttentionItem["action_kind"];
  actionLabel?: string;
  active?: boolean;
  focused?: boolean;
  hovered?: boolean;
}

type CatCoat = "tuxedo" | "orange" | "calico" | "gray";

const CANVAS_WIDTH = 840;
const CANVAS_HEIGHT = 500;
const PIXEL_ALERT = "#e8755f";

const desks: Desk[] = [
  { x: 200, y: 150, label: "frontend", accent: "#65b7ff", tone: "blue", worker: "tuxedo" },
  { x: 560, y: 150, label: "core", accent: "#55d69e", tone: "green", worker: "orange" },
  { x: 200, y: 350, label: "tests", accent: "#a7e56f", tone: "mint", worker: "calico" },
  { x: 560, y: 350, label: "review", accent: "#ffd166", tone: "amber", worker: "gray" },
];

function compactDeskLabel(value: string): string {
  const clean = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "session";
  const words = clean.split(" ").filter(Boolean);
  const label = words.length > 1 ? words.slice(0, 2).join(" ") : clean;
  return label.length > 12 ? `${label.slice(0, 11)}.` : label;
}

// CJK and other wide glyphs render at roughly double the width of ASCII in the
// canvas monospace font, so measure in "visual units" (wide = 2) to keep labels
// from overflowing their fixed-width boxes.
function charVisualWidth(code: number): number {
  return code > 0x2e7f ? 2 : 1;
}

function textVisualWidth(value: string): number {
  let width = 0;
  for (let index = 0; index < value.length; index += 1) {
    width += charVisualWidth(value.charCodeAt(index));
  }
  return width;
}

function compactCanvasText(value: string | undefined, maxLength: number): string {
  if (!value) return "";
  const clean = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (textVisualWidth(clean) <= maxLength) return clean;
  // Leave one unit for the trailing "." marker.
  const budget = Math.max(1, maxLength - 1);
  let used = 0;
  let out = "";
  for (let index = 0; index < clean.length; index += 1) {
    const charWidth = charVisualWidth(clean.charCodeAt(index));
    if (used + charWidth > budget) break;
    used += charWidth;
    out += clean[index];
  }
  return `${out}.`;
}

function shortSessionId(id: string): string {
  return id.length > 9 ? `${id.slice(0, 5)}..${id.slice(-2)}` : id;
}

function deskStatus(link?: OpenCodeSessionLink): Desk["status"] {
  if (!link) return "empty";
  if (link.status === "linked" || link.status === "title-diff") return "linked";
  if (link.status === "directory-diff") return "drift";
  if (link.status === "server-only") return "server";
  if (link.status === "local-only") return "local";
  return "drift";
}

function deskStatusFromActivity(item?: OpenCodeActivityItem): Desk["status"] {
  if (!item) return "empty";
  if (
    item.status === "working"
    || item.status === "completed"
    || item.status === "ready"
    || item.status === "followed"
    || item.status === "quiet"
  ) return "linked";
  if (item.status === "server-only") return "server";
  if (item.status === "local-only" || item.status === "error") return "local";
  if (item.status === "drift") return "drift";
  return "drift";
}

function linkTitle(link: OpenCodeSessionLink): string {
  return link.local?.title || link.server?.title || link.id;
}

function deskAccent(status: Desk["status"], active: boolean, fallback: string): string {
  if (active) return "#d8fff4";
  switch (status) {
    case "linked":
      return "#55d69e";
    case "drift":
      return "#ffd166";
    case "local":
      return PIXEL_ALERT;
    case "server":
      return "#8ecaff";
    default:
      return fallback;
  }
}

function deskActionLabel(actionKind?: OpenCodeAttentionItem["action_kind"]): string {
  switch (actionKind) {
    case "fix":
      return "FIX";
    case "continue":
      return "GO";
    case "retry-dispatch":
      return "TX";
    case "attach":
      return "TUI";
    case "web":
      return "WEB";
    case "focus":
      return "SYNC";
    case "review":
      return "OK";
    default:
      return "";
  }
}

function findHitBoxAt(hitBoxes: HitBox[], x: number, y: number): HitBox | undefined {
  return hitBoxes.find(
    (box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
  );
}

function attentionForSession(
  sessionId: string,
  attentionItems: OpenCodeAttentionItem[] = [],
): OpenCodeAttentionItem | undefined {
  return attentionItems.find((item) => item.session_id === sessionId);
}

function sessionDesks(
  sessionLinks: OpenCodeSessionLink[] = [],
  focusedSessionId?: string | null,
  attentionItems: OpenCodeAttentionItem[] = [],
): Desk[] {
  const orderedLinks = [
    ...sessionLinks.filter((link) => link.is_bound || link.is_current),
    ...sessionLinks.filter((link) => !link.is_bound && !link.is_current),
  ];
  const uniqueLinks = orderedLinks.filter(
    (link, index, items) => items.findIndex((item) => item.id === link.id) === index,
  );

  return desks.map((desk, index) => {
    const link = uniqueLinks[index];
    if (!link) return { ...desk, status: "empty" };

    const status = deskStatus(link);
    const active = link.is_bound || link.is_current;
    const focused = link.id === focusedSessionId;
    const attention = attentionForSession(link.id, attentionItems);
    return {
      ...desk,
      label: compactDeskLabel(linkTitle(link)),
      accent: deskAccent(status, active || focused, desk.accent),
      status,
      activityStatus: "linked",
      sessionId: link.id,
      detail: shortSessionId(link.id),
      summary: link.local?.directory || link.server?.directory,
      source: link.status,
      messageCount: link.local?.message_count ?? link.server?.message_count,
      model: link.server?.model_id,
      actionKind: attention?.action_kind,
      actionLabel: deskActionLabel(attention?.action_kind),
      active,
      focused,
    };
  });
}

function activityDesks(
  activityItems: OpenCodeActivityItem[] = [],
  fallbackLinks: OpenCodeSessionLink[] = [],
  focusedSessionId?: string | null,
  attentionItems: OpenCodeAttentionItem[] = [],
): Desk[] {
  if (activityItems.length === 0) return sessionDesks(fallbackLinks, focusedSessionId, attentionItems);
  const orderedItems = [
    ...activityItems.filter((item) => item.is_bound || item.is_current),
    ...activityItems.filter((item) => !item.is_bound && !item.is_current),
  ];
  const uniqueItems = orderedItems.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
  );

  return desks.map((desk, index) => {
    const item = uniqueItems[index];
    if (!item) return { ...desk, status: "empty" };

    const status = deskStatusFromActivity(item);
    const active = item.is_bound || item.is_current || item.status === "working";
    const focused = item.id === focusedSessionId;
    const attention = attentionForSession(item.id, attentionItems);
    return {
      ...desk,
      label: compactDeskLabel(item.title),
      accent: deskAccent(status, active || focused, desk.accent),
      status,
      activityStatus: item.status,
      phase: item.phase,
      sessionId: item.id,
      detail: `${shortSessionId(item.id)} ${item.status === "working" ? "run" : item.source}`,
      summary: item.last_message,
      statusReason: item.status_reason,
      lastSignal: item.last_signal,
      source: item.source,
      toolName: item.tool_name,
      model: item.model,
      messageCount: item.message_count,
      eventType: item.last_event?.event_type,
      eventSeverity: item.last_event?.severity,
      lastRole: item.last_role,
      lastUserMessage: item.last_user_message,
      lastAssistantMessage: item.last_assistant_message,
      awaitingUser: item.awaiting_user,
      idleMs: item.idle_ms,
      totalTools: item.total_tools,
      completedTools: item.completed_tools,
      actionKind: attention?.action_kind,
      actionLabel: deskActionLabel(attention?.action_kind),
      active,
      focused,
    };
  });
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function strokeRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(width), Math.round(height));
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 8) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Monaco, monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  draw();
  ctx.globalAlpha = previous;
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, alpha = 0.28) {
  withAlpha(ctx, alpha, () => pixel(ctx, x, y, width, height, "#000000"));
}

function deskHoverLines(
  desk: Desk,
): string[] {
  const title = compactCanvasText(desk.label, 18).toUpperCase();
  const lines = [title];

  const status = desk.activityStatus ?? desk.status ?? "empty";
  const statusLabel = status === "working" ? "WORKING"
    : status === "completed" || status === "followed" ? "DONE"
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
) {
  if (lines.length === 0) return;
  const width = Math.max(58, Math.min(150, Math.max(...lines.map((lineText) => lineText.length)) * 6 + 14));
  const height = 12 + lines.length * 10;
  const clampedX = Math.max(58, Math.min(CANVAS_WIDTH - width - 46, Math.round(x)));
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

function drawPixelNoise(ctx: CanvasRenderingContext2D) {
  withAlpha(ctx, 0.13, () => {
    for (let y = 72; y < 468; y += 8) {
      for (let x = 58; x < 786; x += 8) {
        const value = (x * 17 + y * 31) % 11;
        if (value === 0) pixel(ctx, x, y, 2, 2, "#314044");
        if (value === 1) pixel(ctx, x + 5, y + 4, 1, 1, "#0e171a");
      }
    }
  });
  withAlpha(ctx, 0.08, () => {
    for (let index = 0; index < 34; index += 1) {
      const x = 72 + ((index * 131) % 690);
      const y = 94 + ((index * 73) % 350);
      pixel(ctx, x, y, 5 + (index % 3) * 2, 1, "#536368");
      pixel(ctx, x + 2, y + 2, 2, 1, "#0b1214");
    }
  });
}

function drawShell(ctx: CanvasRenderingContext2D) {
  pixel(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, "#050b0e");
  pixel(ctx, 38, 16, 764, 460, "#111a1d");
  pixel(ctx, 55, 77, 732, 386, "#1c282c");

  pixel(ctx, 38, 0, 764, 92, "#101a1e");
  pixel(ctx, 46, 14, 748, 12, "#263943");
  pixel(ctx, 46, 62, 748, 8, "#071012");
  pixel(ctx, 55, 75, 732, 5, "#31464d");
  pixel(ctx, 55, 463, 732, 8, "#090f11");
  pixel(ctx, 38, 75, 16, 401, "#293b42");
  pixel(ctx, 787, 75, 15, 401, "#080e10");

  for (let y = 88; y < 463; y += 16) {
    line(ctx, 55, y, 786, y, "#2a3a3f");
    line(ctx, 55, y + 1, 786, y + 1, "#152126");
  }

  for (let x = 63; x < 786; x += 18) {
    line(ctx, x, 76, x, 463, "#142126");
    if ((x / 18) % 4 === 0) line(ctx, x + 1, 76, x + 1, 463, "#26363b");
  }

  drawPixelNoise(ctx);
}

function drawWindows(ctx: CanvasRenderingContext2D, frame: number) {
  const windows = [88, 182, 276, 370, 464, 558, 652, 746];
  windows.forEach((x, index) => {
    pixel(ctx, x, 4, 72, 58, "#080f12");
    pixel(ctx, x + 7, 9, 58, 19, "#314858");
    pixel(ctx, x + 7, 35, 58, 20, "#243945");
    pixel(ctx, x + 11, 13, 50, 7, "#536d7e");
    pixel(ctx, x + 11, 39, 50, 6, "#3f5667");
    drawCityLights(ctx, x, index, frame);
    withAlpha(ctx, 0.2, () => line(ctx, x + 10, 11, x + 62, 48, "#c9f7ff"));
  });

  text(ctx, "OPEN  CODE  NIGHT  SHIFT", 344, 30, "#d7efe8", 8);
  withAlpha(ctx, 0.38, () => pixel(ctx, 337, 43, 168, 2, "#55d69e"));
}

function drawTodoBubble(
  ctx: CanvasRenderingContext2D,
  desk: Desk,
  todos: TodoItem[],
) {
  if (todos.length === 0) return;

  const completed = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const visible = todos.filter((t) => t.status !== "completed").slice(0, 3);
  const progressLabel = `${completed}/${todos.length}`;

  const lineHeight = 11;
  const headerHeight = 14;
  const padding = 6;
  const bubbleWidth = 100;
  const contentLines = visible.length + 1;
  const bubbleHeight = headerHeight + contentLines * lineHeight + padding * 2;
  const bubbleX = Math.round(desk.x + 50);
  const bubbleY = Math.round(Math.min(Math.max(36, desk.y - bubbleHeight / 2), CANVAS_HEIGHT - bubbleHeight - 8));

  shadow(ctx, bubbleX + 3, bubbleY + bubbleHeight + 2, bubbleWidth, 6, 0.25);
  pixel(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, "#0a1416");
  pixel(ctx, bubbleX + 2, bubbleY + 2, bubbleWidth - 4, bubbleHeight - 4, "#162326");
  strokeRect(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, "#3d5558");

  pixel(ctx, bubbleX + 4, bubbleY + 4, bubbleWidth - 8, headerHeight, "#1a2e32");
  text(ctx, "TODO", bubbleX + 8, bubbleY + 5, "#d8fff4", 7);
  text(ctx, progressLabel, bubbleX + bubbleWidth - 28, bubbleY + 5, completed === todos.length ? "#55d69e" : "#8ecaff", 7);

  const barX = bubbleX + 8;
  const barY = bubbleY + headerHeight + 4;
  const barWidth = bubbleWidth - 16;
  const barHeight = 3;
  pixel(ctx, barX, barY, barWidth, barHeight, "#1a2e32");
  const fillWidth = Math.round((completed / Math.max(todos.length, 1)) * barWidth);
  if (fillWidth > 0) {
    pixel(ctx, barX, barY, fillWidth, barHeight, completed === todos.length ? "#55d69e" : "#8ecaff");
  }

  let lineY = barY + barHeight + 4;
  for (const todo of visible) {
    const icon = todo.status === "in_progress" ? ">" : todo.status === "cancelled" ? "x" : "[ ]";
    const color = todo.status === "in_progress" ? "#ffd166" : "#9fb4b8";
    const label = compactCanvasText(todo.content, 14);
    text(ctx, icon, bubbleX + 8, lineY, color, 7);
    text(ctx, label, bubbleX + 20, lineY, color, 7);
    lineY += lineHeight;
  }

  if (todos.length - completed - inProgress > visible.length) {
    const remaining = todos.length - completed - visible.length;
    text(ctx, `+${remaining} more...`, bubbleX + 8, lineY, "#6d7d82", 6);
  }

  // Tail on the left edge, vertically centered, pointing toward the cat.
  const tailX = bubbleX - 6;
  const tailY = bubbleY + Math.round(bubbleHeight / 2) - 3;
  pixel(ctx, tailX, tailY, 6, 6, "#162326");
  pixel(ctx, tailX - 2, tailY + 2, 2, 2, "#162326");
}

function drawDeskNameplate(ctx: CanvasRenderingContext2D, desk: Desk) {
  const label = compactCanvasText(desk.label, 12).toUpperCase();
  const linked = desk.status === "linked";
  const drift = desk.status === "drift";
  const dotColor = linked ? "#55d69e" : drift ? "#ffd166" : "#7d8c91";
  const linkText = linked ? "LINKED" : drift ? "DRIFT" : "LOCAL";
  const w = Math.max(72, label.length * 6 + 30);
  const x = Math.round(desk.x - w / 2);
  const y = desk.y + 44;
  shadow(ctx, x + 3, y + 15, w, 4, 0.25);
  pixel(ctx, x, y, w, 15, "#0b1416");
  pixel(ctx, x + 1, y + 1, w - 2, 13, "#162326");
  strokeRect(ctx, x, y, w, 15, desk.hovered ? "#d8fff4" : "#33474c");
  pixel(ctx, x + 5, y + 5, 5, 5, dotColor);          // link 状态点
  text(ctx, label, x + 13, y + 4, "#d8fff4", 6);     // session 名
  text(ctx, linkText, x + w - linkText.length * 4 - 5, y + 5, dotColor, 5); // link 状态词
}

function drawWorkstation(ctx: CanvasRenderingContext2D, desk: Desk, frame: number, sprites: Record<string, HTMLImageElement>) {
  const isEmpty = !desk.sessionId || desk.status === "empty";
  const state = isEmpty ? "sleep"
    : (desk.activityStatus === "working" || desk.activityStatus === "followed") ? "work" : "idle";
  const img = sprites[`${desk.worker}-${state}`];
  drawDeskFocusFrame(ctx, desk, frame);           // 保留交互框
  if (desk.hovered) drawDeskHoverFrame(ctx, desk, frame);
  // 地面阴影
  shadow(ctx, desk.x - 32, desk.y + 36, 64, 9, 0.28);
  // bob 动效（睡觉不动）
  const bob = isEmpty ? 0 : Math.round(Math.sin(frame * 0.05 + desk.x * 0.1) * 2);
  const S = 92; // 贴图尺寸
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false; // 保持像素硬边
    ctx.drawImage(img, Math.round(desk.x - S / 2), Math.round(desk.y - S / 2 + bob), S, S);
  }
  // 名牌（session 名 + link 状态），仅非空工位
  if (desk.sessionId && !isEmpty) drawDeskNameplate(ctx, desk);
}

function workstationHitBox(desk: Desk): HitBox | null {
  if (!desk.sessionId) return null;
  return { id: desk.sessionId, kind: "session", x: desk.x - 50, y: desk.y - 52, width: 210, height: 116 };
}

function drawHoverTooltip(
  ctx: CanvasRenderingContext2D,
  liveDesks: Desk[],
  hoverHit: HitBox | null,
  frame: number,
) {
  if (!hoverHit || hoverHit.kind !== "session") return;
  const desk = liveDesks.find((item) => item.sessionId === hoverHit.id);
  if (!desk) return;
  const tooltipX = desk.x - 102;
  const tooltipY = desk.y - 100;
  drawPixelTooltip(ctx, tooltipX, tooltipY, deskHoverLines(desk), desk.accent, frame);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  sessionLinks: OpenCodeSessionLink[],
  activityItems: OpenCodeActivityItem[],
  attentionItems: OpenCodeAttentionItem[],
  focusedSessionId: string | null,
  frame: number,
  hoverHit: HitBox | null,
  sessionTodos: Record<string, TodoItem[]>,
  sprites: Record<string, HTMLImageElement>,
): HitBox[] {
  const hoverSessionId = hoverHit?.kind === "session" ? hoverHit.id : null;
  const liveDesks = activityDesks(activityItems, sessionLinks, focusedSessionId, attentionItems).map((desk) => ({
    ...desk,
    hovered: Boolean(desk.sessionId && desk.sessionId === hoverSessionId),
  }));
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawShell(ctx);
  drawWindows(ctx, frame);
  liveDesks.forEach((desk) => drawWorkstation(ctx, desk, frame, sprites));
  liveDesks.forEach((desk) => {
    if (desk.sessionId && sessionTodos[desk.sessionId]?.length) {
      drawTodoBubble(ctx, desk, sessionTodos[desk.sessionId]);
    }
  });
  const deskHitBoxes = liveDesks
    .map((desk) => workstationHitBox(desk))
    .filter((box): box is HitBox => Boolean(box));
  const hitBoxes = [
    ...deskHitBoxes,
  ].filter((box): box is HitBox => Boolean(box));
  if (frame < 240) {
    const fade = (240 - frame) / 240;
    const breath = (Math.sin(frame * 0.18) + 1) / 2;
    withAlpha(ctx, fade * (0.14 + breath * 0.32), () => {
      hitBoxes.forEach((box) => strokeRect(ctx, box.x - 1, box.y - 1, box.width + 2, box.height + 2, "#55d69e"));
    });
  }
  pixel(ctx, 12, 488, 4, 4, "#55d69e");
  text(ctx, "CLICK A DESK", 20, 489, "#6f8c96", 6);
  drawHoverTooltip(ctx, liveDesks, hoverHit, frame);
  return hitBoxes;
}

export function CatOfficeScene({
  cats,
  sessionLinks = [],
  activityItems = [],
  attentionItems = [],
  workspaceState = null,
  dispatchSignal = null,
  latestEvent = null,
  eventHistory = [],
  focusedSessionId = null,
  sessionTodos = {},
  onSelectCat,
  onSelectSession,
  onRunSessionAction,
  onRunOpsAction,
}: CatOfficeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSelectRef = useRef(onSelectCat);
  const onSelectSessionRef = useRef(onSelectSession);
  const onRunSessionActionRef = useRef(onRunSessionAction);
  const onRunOpsActionRef = useRef(onRunOpsAction);
  const catsRef = useRef(cats);
  const sessionLinksRef = useRef(sessionLinks);
  const activityItemsRef = useRef(activityItems);
  const attentionItemsRef = useRef(attentionItems);
  const workspaceStateRef = useRef<OpenCodeWorkspaceState | null>(workspaceState);
  const dispatchSignalRef = useRef<SceneDispatchSignal | null>(dispatchSignal);
  const latestEventRef = useRef<OpenCodeEvent | null>(latestEvent);
  const eventHistoryRef = useRef<OpenCodeEvent[]>(eventHistory);
  const focusedSessionRef = useRef<string | null>(focusedSessionId);
  const sessionTodosRef = useRef<Record<string, TodoItem[]>>(sessionTodos);
  const hitBoxesRef = useRef<HitBox[]>([]);
  const hoverHitRef = useRef<HitBox | null>(null);
  const spritesRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const coats = ["tuxedo", "orange", "calico", "gray"];
    const states = ["idle", "work", "sleep"];
    const map: Record<string, HTMLImageElement> = {};
    for (const c of coats) for (const s of states) {
      const img = new Image();
      img.src = `/pets/sprites/${c}-${s}.png`;
      map[`${c}-${s}`] = img;
    }
    spritesRef.current = map;
  }, []);

  useEffect(() => {
    onSelectRef.current = onSelectCat;
    onSelectSessionRef.current = onSelectSession;
    onRunSessionActionRef.current = onRunSessionAction;
    onRunOpsActionRef.current = onRunOpsAction;
  }, [onSelectCat, onSelectSession, onRunSessionAction, onRunOpsAction]);

  useEffect(() => {
    catsRef.current = cats;
    sessionLinksRef.current = sessionLinks;
    activityItemsRef.current = activityItems;
    attentionItemsRef.current = attentionItems;
    workspaceStateRef.current = workspaceState;
    dispatchSignalRef.current = dispatchSignal;
    latestEventRef.current = latestEvent;
    eventHistoryRef.current = eventHistory;
    focusedSessionRef.current = focusedSessionId;
    sessionTodosRef.current = sessionTodos;
  }, [cats, sessionLinks, activityItems, attentionItems, workspaceState, dispatchSignal, latestEvent, eventHistory, focusedSessionId, sessionTodos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let animationId = 0;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetWidth = Math.round(rect.width * dpr);
      const targetHeight = Math.round(rect.height * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      const scaleX = targetWidth / CANVAS_WIDTH;
      const scaleY = targetHeight / CANVAS_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = (targetWidth - CANVAS_WIDTH * scale) / 2;
      const offsetY = (targetHeight - CANVAS_HEIGHT * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);

    const render = () => {
      frame += 1;
      hitBoxesRef.current = drawScene(
        ctx,
        sessionLinksRef.current,
        activityItemsRef.current,
        attentionItemsRef.current,
        focusedSessionRef.current,
        frame,
        hoverHitRef.current,
        sessionTodosRef.current,
        spritesRef.current,
      );
      animationId = window.requestAnimationFrame(render);
    };

    const canvasPointFromEvent = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = canvasPointFromEvent(event);
      const hit = findHitBoxAt(hitBoxesRef.current, point.x, point.y);
      hoverHitRef.current = hit ?? null;
      canvas.style.cursor = hit ? "pointer" : "default";
    };

    const onPointerLeave = () => {
      hoverHitRef.current = null;
      canvas.style.cursor = "default";
    };

    const onPointerDown = (event: PointerEvent) => {
      const point = canvasPointFromEvent(event);
      const hit = findHitBoxAt(hitBoxesRef.current, point.x, point.y);
      if (hit?.kind === "session") {
        onSelectSessionRef.current?.(hit.id);
        return;
      }
      if (hit?.kind === "cat") onSelectRef.current(hit.id);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerDown);
    render();

    return () => {
      window.cancelAnimationFrame(animationId);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full bg-[#050b0e]"
      data-office-scene="pixel-office"
    />
  );
}
