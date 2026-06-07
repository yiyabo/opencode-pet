import { useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "framer-motion";
import type {
  CatSessionDigest,
  OfficeSyncState,
  OpenCodeAlignmentResult,
  OpenCodeActivityItem,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  SessionChoice,
  TodoItem,
} from "../types";
import { isTauriRuntime } from "../tauriEnv";
import { buildSessionChoices } from "../opencodeDigest";

interface SessionPickerProps {
  isOpen: boolean;
  digest: CatSessionDigest;
  workspaceState: OpenCodeWorkspaceState | null;
  sessionLinks: OpenCodeSessionLink[];
  activityItems: OpenCodeActivityItem[];
  sessionTodos: Record<string, TodoItem[]>;
  officeSync: OfficeSyncState;
  onClose: () => void;
  onOpenOffice: () => void;
  onOpenSettings: (focus?: "database" | "server") => void;
  onRefreshOfficeState: (source?: string) => Promise<unknown>;
  onBindSession: (sessionId: string | null) => Promise<OpenCodeAlignmentResult | null>;
}

function statusStyle(choice: SessionChoice): CSSProperties {
  if (choice.is_bound) {
    return { backgroundColor: "rgba(18, 50, 43, 0.78)", borderColor: "rgba(85, 214, 158, 0.55)", color: "#d8fff4" };
  }
  if (choice.status === "working") {
    return { backgroundColor: "rgba(16, 42, 56, 0.74)", borderColor: "rgba(142, 202, 255, 0.45)", color: "#dff6ff" };
  }
  if (choice.status === "error" || choice.status === "drift" || choice.status === "quiet") {
    return { backgroundColor: "rgba(42, 36, 22, 0.74)", borderColor: "rgba(255, 209, 102, 0.45)", color: "#fff1bf" };
  }
  if (!choice.is_bindable) {
    return { backgroundColor: "rgba(17, 25, 28, 0.62)", borderColor: "rgba(159, 180, 184, 0.18)", color: "#9fb4b8" };
  }
  return { backgroundColor: "rgba(16, 27, 30, 0.72)", borderColor: "rgba(159, 180, 184, 0.24)", color: "#d7efe8" };
}

function statusDot(choice: SessionChoice) {
  if (choice.is_bound) return "bg-[#55d69e]";
  if (choice.status === "working") return "bg-[#8ecaff]";
  if (choice.status === "error" || choice.status === "drift" || choice.status === "quiet") return "bg-[#ffd166]";
  if (!choice.is_bindable) return "bg-[#6f7f84]";
  return "bg-[#9fb4b8]";
}

function choiceMeta(choice: SessionChoice) {
  if (!choice.is_bindable) return "server only";
  if (choice.is_bound) return "bound";
  if (choice.is_current) return "current";
  return choice.status;
}

export function SessionPicker({
  isOpen,
  digest,
  workspaceState,
  sessionLinks,
  activityItems,
  sessionTodos,
  officeSync,
  onClose,
  onOpenOffice,
  onOpenSettings,
  onRefreshOfficeState,
  onBindSession,
}: SessionPickerProps) {
  const [bindingSessionId, setBindingSessionId] = useState<string | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const choices = useMemo(
    () => buildSessionChoices(sessionLinks, activityItems, sessionTodos),
    [sessionLinks, activityItems, sessionTodos],
  );
  const hasBoundSession = Boolean(workspaceState?.bound_session_id);
  const isSyncing = officeSync.status === "syncing";

  const startWindowDrag = async (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    if (!isTauriRuntime()) return;
    event.preventDefault();
    await getCurrentWindow().startDragging();
  };

  const bindChoice = async (choice: SessionChoice) => {
    if (!choice.is_bindable || bindingSessionId) return;
    setBindingError(null);
    setBindingSessionId(choice.id);
    try {
      const result = await onBindSession(choice.id);
      if (!result) {
        setBindingError("绑定失败，OpenCode 没有返回可用状态。");
      }
    } catch (error) {
      setBindingError(String(error));
    } finally {
      setBindingSessionId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.section
          className="absolute inset-0 z-40 overflow-hidden rounded-lg border border-[#89b9c3]/18 bg-[#071012] text-white shadow-[0_24px_80px_rgba(0,0,0,0.72)]"
          data-no-drag
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div
            className="flex cursor-grab items-center justify-between border-b border-[#89b9c3]/12 bg-black/24 px-4 py-3 active:cursor-grabbing"
            onPointerDown={(event) => void startWindowDrag(event)}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#89b9c3]/70">Focus OpenCode</div>
              <div className="mt-1 truncate text-sm font-black text-[#d8fff4]">{digest.headline}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 text-[#d7efe8] hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
              title="Close"
            >
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 1l10 10M11 1 1 11" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="grid h-[calc(100%-57px)] grid-rows-[auto_1fr_auto] gap-3 p-4">
              <div
                className="rounded-md border p-3"
                style={{ backgroundColor: "rgba(11, 24, 25, 0.78)", borderColor: "rgba(51, 209, 160, 0.22)" }}
              >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-[#d8fff4]">{digest.title}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#9fb4b8]">{digest.detail}</div>
                </div>
                {digest.todo_total > 0 && (
                  <div className="shrink-0 rounded-md border border-[#8ecaff]/26 bg-[#8ecaff]/10 px-2.5 py-1 text-right">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8ecaff]/80">Todo</div>
                    <div className="text-xs font-black text-[#dff6ff]">{digest.todo_completed}/{digest.todo_total}</div>
                  </div>
                )}
              </div>
              {digest.todo_total > 0 && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#1a2e32]">
                  <div
                    className="h-full rounded-full bg-[#55d69e] transition-all duration-300"
                    style={{ width: `${Math.round((digest.todo_completed / Math.max(digest.todo_total, 1)) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#89b9c3]/68">Sessions</span>
                <span className="text-[10px] font-bold text-[#89b9c3]/50">{choices.length} found</span>
              </div>
              {choices.length === 0 ? (
                <div className="rounded-md border border-[#ffd166]/26 bg-[#2a2416]/42 p-4 text-xs leading-5 text-[#fff1bf]">
                  还没有发现可绑定的 OpenCode 对话。先启动 OpenCode 或在设置里选择正确的数据库。
                </div>
              ) : (
                <div className="space-y-2">
                  {choices.map((choice) => {
                    const busy = bindingSessionId === choice.id;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={!choice.is_bindable || Boolean(bindingSessionId)}
                        onClick={() => void bindChoice(choice)}
                        className={`w-full rounded-md border p-3 text-left transition-all ${
                          choice.is_bindable ? "hover:border-[#d8fff4]/42 hover:bg-[#17282b]" : "cursor-not-allowed opacity-65"
                        }`}
                        style={statusStyle(choice)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(choice)}`} />
                              <span className="truncate text-xs font-black">{choice.title}</span>
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-current/70">
                              {choice.summary}
                            </div>
                            {choice.active_todo && (
                              <div className="mt-1 truncate text-[10px] font-bold text-[#ffd166]/82">
                                {choice.active_todo}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="rounded-sm border border-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-current/70">
                              {busy ? "binding" : choiceMeta(choice)}
                            </div>
                            {choice.todo_total > 0 && (
                              <div className="mt-1 text-[10px] font-bold text-current/60">
                                {choice.todo_completed}/{choice.todo_total}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[#89b9c3]/12 pt-3">
              <div className="min-w-0 text-[10px] text-[#9fb4b8]/72">
                {bindingError ?? (workspaceState?.database_path ? "选择一个对话后，小黑会开始跟踪它。" : "未选择 OpenCode 数据库。")}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void onRefreshOfficeState("session-picker")}
                  className="rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 px-3 py-1.5 text-[11px] font-bold text-[#d7efe8] hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
                  style={{ backgroundColor: "rgba(7, 16, 18, 0.8)", borderColor: "rgba(159, 215, 223, 0.25)" }}
                >
                  {isSyncing ? "Syncing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSettings("database")}
                  className="rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 px-3 py-1.5 text-[11px] font-bold text-[#d7efe8] hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
                  style={{ backgroundColor: "rgba(7, 16, 18, 0.8)", borderColor: "rgba(159, 215, 223, 0.25)" }}
                >
                  Settings
                </button>
                <button
                  type="button"
                  disabled={!hasBoundSession}
                  onClick={onOpenOffice}
                  className="rounded-md border border-[#55d69e]/42 bg-[#55d69e]/14 px-3 py-1.5 text-[11px] font-black text-[#d8fff4] hover:border-[#55d69e]/65 hover:bg-[#55d69e]/22 disabled:cursor-not-allowed disabled:border-[#9fb4b8]/16 disabled:bg-[#9fb4b8]/8 disabled:text-[#9fb4b8]/45 transition-colors"
                  style={{
                    backgroundColor: hasBoundSession ? "rgba(85, 214, 158, 0.14)" : "rgba(159, 180, 184, 0.08)",
                    borderColor: hasBoundSession ? "rgba(85, 214, 158, 0.42)" : "rgba(159, 180, 184, 0.16)",
                    color: hasBoundSession ? "#d8fff4" : "rgba(159, 180, 184, 0.45)",
                  }}
                >
                  Office
                </button>
              </div>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
