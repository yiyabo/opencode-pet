import { useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CatSessionDigest, OpenCodeEvent, PetConfig } from "../types";
import { isTauriRuntime } from "../tauriEnv";

// Only show the speech bubble for events newer than this; older events stay in
// the persistent status chip instead of lingering in the bubble.
const FRESH_WINDOW_MS = 45_000;
const DRAG_DISTANCE_PX = 4;
const DRAG_HOLD_MS = 180;
const DRAG_CLICK_SUPPRESS_MS = 240;
const DRAG_FALLBACK_RESET_MS = 1_500;

type CatMood = "sleeping" | "idle" | "thinking" | "working" | "success" | "error" | "waiting";

interface XiaoHeiProps {
  petConfig: PetConfig;
  lastEvent: OpenCodeEvent | null;
  isChatOpen: boolean;
  canDragWindow: boolean;
  digest: CatSessionDigest;
  onClick: () => void;
}

function getMood(
  digest: CatSessionDigest,
  hasBoundSession: boolean,
  lastEvent: OpenCodeEvent | null,
  isChatOpen: boolean,
): CatMood {
  if (isChatOpen) return "idle";
  if (hasBoundSession && lastEvent && lastEvent.session_id === digest.session_id) {
    if (lastEvent.severity === "error" || lastEvent.event_type.includes("error")) return "error";
    if (lastEvent.severity === "success" || lastEvent.event_type.includes("success")) return "success";
  }
  if (!hasBoundSession || digest.phase === "unbound") return "sleeping";
  if (digest.phase === "blocked") return "error";
  if (digest.phase === "completed") return "success";
  if (digest.phase === "working") return "working";
  if (digest.phase === "waiting") return "thinking";
  return "idle";
}

// Map the pet mood to one of the three tuxedo sprite poses.
function spritePose(mood: CatMood): "idle" | "work" | "sleep" {
  if (mood === "sleeping") return "sleep";
  if (mood === "working") return "work";
  return "idle";
}

function compactText(value: string | undefined, fallback: string, maxChars: number) {
  const text = (value ?? "").split(/\s+/).filter(Boolean).join(" ").trim() || fallback;
  const chars = Array.from(text);
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join("")}...` : text;
}

function eventBubbleText(event: OpenCodeEvent | null) {
  if (!event) return "";
  const tool = compactText(event.tool_name, "工具", 22);
  switch (event.event_type) {
    case "tool.started":
      return `正在跑 ${tool}`;
    case "tool.completed":
      return `${tool} 跑完了`;
    case "tool.failed":
      return `${tool} 运行失败`;
    case "runtime.error":
      return "OpenCode 报错了";
    case "permission.asked":
      return event.summary || "OpenCode 在等你确认权限";
    case "assistant.completed":
    case "session.idle":
      return "这一轮可继续对话";
    case "assistant.started":
    case "session.working":
    case "session.retry":
      return "OpenCode 正在处理";
    case "user.prompted":
      return "OpenCode 收到新任务";
    default:
      return event.summary;
  }
}

export function CatPet({ petConfig, lastEvent, isChatOpen, canDragWindow, digest, onClick }: XiaoHeiProps) {
  const hasBoundSession = Boolean(petConfig.bound_session_id);
  const mood = useMemo(
    () => getMood(digest, hasBoundSession, lastEvent, isChatOpen),
    [digest, hasBoundSession, lastEvent, isChatOpen],
  );
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const dragTimerRef = useRef<number | null>(null);
  const dragResetTimerRef = useRef<number | null>(null);
  const dragStartedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const isWorking = hasBoundSession && digest.phase === "working";
  const toolName = digest.current_tool;
  const eventFresh = !!lastEvent
    && lastEvent.session_id === petConfig.bound_session_id
    && Date.now() - lastEvent.timestamp < FRESH_WINDOW_MS;
  const freshBubbleText = eventFresh ? eventBubbleText(lastEvent) : "";
  const bubbleText = !hasBoundSession
    ? ""
    : isChatOpen
      ? digest.headline
    : freshBubbleText
      ? freshBubbleText
      : digest.phase === "ready"
        ? ""
        : digest.headline;
  const chipText = isWorking && toolName ? toolName :
    digest.todo_total > 0 ? `${digest.todo_completed}/${digest.todo_total}` :
    digest.phase === "blocked" ? "error" :
    digest.phase === "completed" ? "ready" :
    !hasBoundSession || digest.phase === "unbound" ? "bind" :
    mood === "sleeping" ? "sleeping" : "idle";

  const coat = petConfig.coat && ["tuxedo", "orange", "calico", "gray"].includes(petConfig.coat)
    ? petConfig.coat
    : "tuxedo";
  const sprite = `/pets/sprites/${coat}-${spritePose(mood)}.png`;

  // Body micro-animation (reuse the existing keyframes; sleeping stays calm).
  const bodyAnim =
    mood === "sleeping" ? "cat-sleep" :
    mood === "working"  ? "cat-work-bob" :
    mood === "thinking" ? "cat-think" :
    mood === "success"  ? "cat-bounce" :
    mood === "error"    ? "cat-shake" : "cat-breathe";

  // Status-tinted glow so error/success read at a glance even without a bubble.
  const glow =
    mood === "error"   ? "drop-shadow-[0_0_12px_rgba(232,117,95,0.75)]" :
    mood === "success" ? "drop-shadow-[0_0_12px_rgba(85,214,158,0.75)]" :
    "drop-shadow-[0_6px_16px_rgba(0,0,0,0.55)]";

  const clearDragTimer = () => {
    if (dragTimerRef.current === null) return;
    window.clearTimeout(dragTimerRef.current);
    dragTimerRef.current = null;
  };

  const clearDragResetTimer = () => {
    if (dragResetTimerRef.current === null) return;
    window.clearTimeout(dragResetTimerRef.current);
    dragResetTimerRef.current = null;
  };

  const resetDragStateSoon = (delay = DRAG_CLICK_SUPPRESS_MS) => {
    clearDragResetTimer();
    dragResetTimerRef.current = window.setTimeout(() => {
      dragStartedRef.current = false;
      suppressClickRef.current = false;
      dragResetTimerRef.current = null;
    }, delay);
  };

  const releasePointerCapture = (target: HTMLButtonElement, pointerId: number) => {
    if (!target.hasPointerCapture(pointerId)) return;
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Native window drag can take ownership of the pointer before React sees pointerup.
    }
  };

  useEffect(() => {
    return () => {
      clearDragTimer();
      clearDragResetTimer();
    };
  }, []);

  const startWindowDrag = (target: HTMLButtonElement, pointerId: number) => {
    if (dragStartedRef.current || !canDragWindow || !isTauriRuntime()) return;
    clearDragTimer();
    clearDragResetTimer();
    dragStartedRef.current = true;
    suppressClickRef.current = true;
    releasePointerCapture(target, pointerId);
    void getCurrentWindow().startDragging().catch(() => {
      dragStartedRef.current = false;
      suppressClickRef.current = false;
    });
    resetDragStateSoon(DRAG_FALLBACK_RESET_MS);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !canDragWindow || !isTauriRuntime()) return;
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    dragStartedRef.current = false;
    suppressClickRef.current = false;
    clearDragResetTimer();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    dragTimerRef.current = window.setTimeout(() => startWindowDrag(target, pointerId), DRAG_HOLD_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId || dragStartedRef.current) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved >= DRAG_DISTANCE_PX) startWindowDrag(event.currentTarget, event.pointerId);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const wasDragging = dragStartedRef.current;
    clearDragTimer();
    dragStartRef.current = null;
    releasePointerCapture(event.currentTarget, event.pointerId);
    if (wasDragging) resetDragStateSoon();
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      dragStartedRef.current = false;
      suppressClickRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className={`relative flex w-32 flex-col items-center select-none border-0 bg-transparent p-0 outline-none group ${
        canDragWindow ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
      title={canDragWindow ? `${petConfig.name}: 点击打开，拖动移动。${digest.detail}` : `${petConfig.name}: 点击打开。${digest.detail}`}
      data-no-drag
    >
      {/* Speech bubble — ring opacity signals priority: /55 for error/success, /40 for neutral */}
      {!!bubbleText && (
        <div className={`absolute left-1/2 top-0 z-10 max-w-[124px] -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-normal break-words rounded-xl bg-[#0b1416]/95 px-2.5 py-1 text-center text-[9px] font-semibold leading-3 text-[#d8fff4] shadow-[0_4px_14px_rgba(0,0,0,0.55)] ring-1 ${
          mood === "error" ? "ring-[#e8755f]/55" : mood === "success" ? "ring-[#55d69e]/55" : "ring-[#33d1a0]/40"
        }`}>
          {bubbleText}
          <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#0b1416]/95" />
        </div>
      )}

      {/* Tuxedo sprite cat — same asset as the office desks for a unified look */}
      <img
        src={sprite}
        width={96}
        height={96}
        alt={petConfig.name}
        draggable={false}
        className={`${bodyAnim} ${glow} transition-transform duration-200 group-hover:scale-[1.06]`}
        style={{ imageRendering: "pixelated" }}
      />

      {/* Status chip */}
      <div className={`-mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold transition-all duration-300 ${
        isWorking              ? "bg-blue-500/20 text-blue-300" :
        digest.phase === "blocked"     ? "bg-red-500/20 text-red-300" :
        digest.phase === "completed" ? "bg-green-500/20 text-green-300" :
        !hasBoundSession || digest.phase === "unbound" ? "bg-[#ffd166]/15 text-[#ffd166]/80" :
        "bg-white/5 text-white/25"
      }`}>
        {chipText}
      </div>
    </button>
  );
}
