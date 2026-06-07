import { useMemo } from "react";
import type { OpenCodeEvent, PetState } from "../types";

// Only show the speech bubble for events newer than this; older events stay in
// the persistent status chip instead of lingering in the bubble.
const FRESH_WINDOW_MS = 45_000;

type CatMood = "sleeping" | "idle" | "thinking" | "working" | "success" | "error" | "waiting";

interface XiaoHeiProps {
  petState: PetState;
  lastEvent: OpenCodeEvent | null;
  isChatOpen: boolean;
  onClick: () => void;
}

function getMood(petState: PetState, lastEvent: OpenCodeEvent | null, isChatOpen: boolean): CatMood {
  if (isChatOpen) return "idle";
  if (lastEvent) {
    if (lastEvent.severity === "error" || lastEvent.event_type.includes("error")) return "error";
    if (lastEvent.severity === "success" || lastEvent.event_type.includes("success")) return "success";
  }
  const s = petState.progress.status;
  if (s === "error") return "error";
  if (s === "completed") return "success";
  if (s === "working") return "working";
  const m = petState.mood;
  if (m === "sleeping") return "sleeping";
  if (m === "working" || m === "curious") return "thinking";
  return "idle";
}

// Map the pet mood to one of the three tuxedo sprite poses.
function spritePose(mood: CatMood): "idle" | "work" | "sleep" {
  if (mood === "sleeping") return "sleep";
  if (mood === "working") return "work";
  return "idle";
}

export function XiaoHei({ petState, lastEvent, isChatOpen, onClick }: XiaoHeiProps) {
  const mood = useMemo(() => getMood(petState, lastEvent, isChatOpen), [petState, lastEvent, isChatOpen]);

  const isWorking = petState.progress.status === "working";
  const toolName = petState.progress.current_tool;
  const eventFresh = !!lastEvent && Date.now() - lastEvent.timestamp < FRESH_WINDOW_MS;

  const sprite = `/pets/sprites/tuxedo-${spritePose(mood)}.png`;

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

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center select-none border-0 bg-transparent p-0 outline-none group"
      title="点击打开面板"
      data-no-drag
    >
      {/* Speech bubble — ring opacity signals priority: /55 for error/success, /40 for neutral */}
      {(isChatOpen || (eventFresh && !!lastEvent?.summary)) && (
        <div className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#0b1416]/95 px-2.5 py-1 text-[9px] font-semibold text-[#d8fff4] shadow-[0_4px_14px_rgba(0,0,0,0.55)] ring-1 max-w-[150px] truncate z-10 ${
          mood === "error" ? "ring-[#e8755f]/55" : mood === "success" ? "ring-[#55d69e]/55" : "ring-[#33d1a0]/40"
        }`}>
          {isChatOpen ? "聊天中..." : lastEvent?.summary}
          <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#0b1416]/95" />
        </div>
      )}

      {/* Tuxedo sprite cat — same asset as the office desks for a unified look */}
      <img
        src={sprite}
        width={96}
        height={96}
        alt="XiaoHei"
        draggable={false}
        className={`${bodyAnim} ${glow} transition-transform duration-200 group-hover:scale-[1.06]`}
        style={{ imageRendering: "pixelated" }}
      />

      {/* Status chip */}
      <div className={`-mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold transition-all duration-300 ${
        isWorking              ? "bg-blue-500/20 text-blue-300" :
        petState.progress.status === "error"     ? "bg-red-500/20 text-red-300" :
        petState.progress.status === "completed" ? "bg-green-500/20 text-green-300" :
        "bg-white/5 text-white/25"
      }`}>
        {isWorking && toolName ? toolName :
         petState.progress.status === "error"     ? "error" :
         petState.progress.status === "completed" ? "done ✓" :
         mood === "sleeping" ? "sleeping" : "idle"}
      </div>
    </button>
  );
}
