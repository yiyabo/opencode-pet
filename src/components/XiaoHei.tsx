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

export function XiaoHei({ petState, lastEvent, isChatOpen, onClick }: XiaoHeiProps) {
  const mood = useMemo(() => getMood(petState, lastEvent, isChatOpen), [petState, lastEvent, isChatOpen]);

  const isWorking = petState.progress.status === "working";
  const toolName = petState.progress.current_tool;
  const eventFresh = !!lastEvent && Date.now() - lastEvent.timestamp < FRESH_WINDOW_MS;

  /* body animation */
  const bodyAnim =
    mood === "sleeping"  ? "cat-sleep"    :
    mood === "working"   ? "cat-work-bob" :
    mood === "thinking"  ? "cat-think"    :
    mood === "success"   ? "cat-bounce"   :
    mood === "error"     ? "cat-shake"    : "cat-breathe";

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

      {/* ── SVG Cat ── */}
      <svg
        width="96" height="108" viewBox="0 0 96 108"
        style={{ background: "transparent", overflow: "visible" }}
        className={`${bodyAnim} drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition-transform duration-200 group-hover:scale-[1.06]`}
      >
        {/* Tail */}
        <path
          d="M 48 96 Q 20 105 16 90 Q 12 74 28 78"
          stroke="#0d0d0d" strokeWidth="7" fill="none" strokeLinecap="round"
          className={mood === "working" ? "cat-tail-work" : mood === "success" ? "cat-tail-happy" : "cat-tail-idle"}
          style={{ transformOrigin: "48px 96px" }}
        />

        {/* Body — squat oval */}
        <ellipse cx="48" cy="88" rx="22" ry="16" fill="#0d0d0d" />

        {/* Head — big flat circle, hallmark of Xiaohei */}
        <ellipse cx="48" cy="52" rx="36" ry="34" fill="#0d0d0d" />

        {/* Left ear */}
        <polygon points="18,24 10,4 30,20" fill="#0d0d0d" />
        {/* left ear inner */}
        <polygon points="18,24 13,10 26,20" fill="#3ecf72" />

        {/* Right ear */}
        <polygon points="78,24 86,4 66,20" fill="#0d0d0d" />
        {/* right ear inner */}
        <polygon points="78,24 83,10 70,20" fill="#3ecf72" />

        {/* ── Eyes ── */}
        {mood === "sleeping" ? (
          /* closed arcs */
          <g>
            <path d="M 28 50 Q 35 44 42 50" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 54 50 Q 61 44 68 50" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        ) : mood === "error" ? (
          /* × eyes */
          <g>
            <line x1="26" y1="43" x2="40" y2="57" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
            <line x1="40" y1="43" x2="26" y2="57" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
            <line x1="56" y1="43" x2="70" y2="57" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
            <line x1="70" y1="43" x2="56" y2="57" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
          </g>
        ) : mood === "success" ? (
          /* star / sparkle eyes */
          <g>
            <text x="33" y="58" fontSize="22" fill="white" textAnchor="middle" dominantBaseline="middle">✦</text>
            <text x="63" y="58" fontSize="22" fill="white" textAnchor="middle" dominantBaseline="middle">✦</text>
          </g>
        ) : (
          /* ── Normal big oval eyes — Xiaohei signature ── */
          <g className={mood === "idle" ? "cat-blink" : undefined}>
            {/* left eye white — large oval */}
            <ellipse cx="33" cy="52" rx="13" ry="15" fill="white" />
            {/* left pupil — small */}
            <ellipse cx={mood === "thinking" ? 35 : 33} cy="54" rx="5" ry="7" fill="#0d0d0d" className={mood === "idle" ? "pupil-look" : undefined} />
            {/* glare */}
            <circle cx="38" cy="46" r="3" fill="white" />
            <circle cx="29" cy="53" r="1.4" fill="white" />

            {/* right eye white */}
            <ellipse cx="63" cy="52" rx="13" ry="15" fill="white" />
            {/* right pupil */}
            <ellipse cx={mood === "thinking" ? 65 : 63} cy="54" rx="5" ry="7" fill="#0d0d0d" className={mood === "idle" ? "pupil-look" : undefined} />
            {/* glare */}
            <circle cx="68" cy="46" r="3" fill="white" />
            <circle cx="59" cy="53" r="1.4" fill="white" />
          </g>
        )}

        {/* Tiny nose */}
        <ellipse cx="48" cy="66" rx="2.5" ry="1.8" fill="#4a9eff" />

        {/* Mouth — only on normal states */}
        {mood !== "sleeping" && mood !== "error" && (
          <path d="M 44 69 Q 48 73 52 69" stroke="#4a9eff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        )}

        {/* Sleep Zzz */}
        {mood === "sleeping" && (
          <g style={{ animation: "sparkle 2.2s ease-in-out infinite" }}>
            <text x="78" y="32" fontSize="11" fill="#8e8e93" fontWeight="bold">z</text>
            <text x="86" y="22" fontSize="9" fill="#8e8e93" fontWeight="bold">z</text>
          </g>
        )}

        {/* Working dots */}
        {isWorking && (
          <g>
            {[38,48,58].map((x, i) => (
              <circle key={x} cx={x} cy="106" r="3" fill="#0a84ff"
                style={{ animation: `tool-dot 0.8s ease-in-out ${i * 0.18}s infinite` }} />
            ))}
          </g>
        )}

        {/* Success sparkles */}
        {mood === "success" && (
          <g>
            <text x="82" y="26" fontSize="13" style={{ animation: "sparkle 1s ease-in-out infinite" }}>✨</text>
            <text x="4" y="32" fontSize="11" style={{ animation: "sparkle 1s ease-in-out 0.35s infinite" }}>✨</text>
          </g>
        )}
      </svg>

      {/* Status chip */}
      <div className={`mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold transition-all duration-300 ${
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
