import { lazy, Suspense, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "framer-motion";
import type {
  OfficeSyncState,
  OpenCodeActivityItem,
  OpenCodeAttentionItem,
  OpenCodeEvent,
  OpenCodeOfficeSnapshot,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  TodoItem,
} from "../types";
import { isTauriRuntime } from "../tauriEnv";
import { EMBEDDED_WEBVIEW_WIDTH } from "../constants";

const CatOfficeScene = lazy(() =>
  import("./CatOfficeScene").then((module) => ({ default: module.CatOfficeScene })),
);

interface CatOfficeProps {
  isOpen: boolean;
  event: OpenCodeEvent | null;
  eventHistory: OpenCodeEvent[];
  workspaceState: OpenCodeWorkspaceState | null;
  sessionLinks: OpenCodeSessionLink[];
  activityItems: OpenCodeActivityItem[];
  attentionItems: OpenCodeAttentionItem[];
  officeSync: OfficeSyncState;
  sessionTodos: Record<string, TodoItem[]>;
  onClose: () => void;
  onRefreshOfficeState: (source?: string) => Promise<OpenCodeOfficeSnapshot | null>;
  onOpenSettings: (focus?: "database" | "server") => void;
}

export function CatOffice({
  isOpen,
  sessionLinks,
  activityItems,
  attentionItems,
  workspaceState,
  event,
  eventHistory,
  officeSync,
  sessionTodos,
  onClose,
  onOpenSettings,
  onRefreshOfficeState,
}: CatOfficeProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const startWindowDrag = async (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    if (!isTauriRuntime()) return;
    e.preventDefault();
    await getCurrentWindow().startDragging();
  };

  const handleSelectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    
    const serverUrl = workspaceState?.server_url ?? "http://127.0.0.1:4096";
    const selectedLink = sessionLinks?.find((l) => l.id === sessionId);
    const selectedDirectory = selectedLink?.local?.directory || selectedLink?.server?.directory;
    
    if (selectedDirectory) {
      const encodeDirectory = (dir: string) => {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(dir);
        const str = Array.from(bytes, r => String.fromCharCode(r)).join("");
        return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      };
      
      const webviewUrl = `${serverUrl}/${encodeDirectory(selectedDirectory)}/session/${sessionId}`;
      
      if (isTauriRuntime()) {
        try {
          await invoke("open_embedded_webview", { url: webviewUrl, title: "OpenCode" });
        } catch (e) {
          console.error("Failed to open webview:", e);
        }
      }
    }
  };

  const handleCloseWebview = async () => {
    setSelectedSessionId(null);
    if (isTauriRuntime()) {
      try {
        await invoke("close_embedded_webview");
      } catch (e) {
        console.error("Failed to close webview:", e);
      }
    }
  };

  const selectedLink = sessionLinks?.find((l) => l.id === selectedSessionId);
  const selectedTitle = selectedLink?.local?.title || selectedLink?.server?.title;
  const selectedTodos = selectedSessionId ? sessionTodos[selectedSessionId] : undefined;
  const selectedCompleted = selectedTodos?.filter((t) => t.status === "completed").length ?? 0;
  const selectedTotal = selectedTodos?.length ?? 0;

  const isSyncing = officeSync.status === "syncing";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-40 overflow-hidden rounded-lg border border-[#89b9c3]/18 bg-[#071012] text-white shadow-[0_24px_80px_rgba(0,0,0,0.74)]"
          data-no-drag
          onPointerDown={(e) => void startWindowDrag(e)}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-[#101210] text-xs font-black uppercase tracking-[0.16em] text-white/40">
                Loading XiaoHei office
              </div>
            }
          >
            <CatOfficeScene
              cats={[{ id: "xiaohei", name: "XiaoHei", provider: "OpenCode", status: "idle", accent: "#33d1a0", face: "black" }]}
              sessionLinks={sessionLinks}
              activityItems={activityItems}
              attentionItems={attentionItems}
              workspaceState={workspaceState}
              latestEvent={event}
              eventHistory={eventHistory}
              sessionTodos={sessionTodos}
              focusedSessionId={selectedSessionId}
              isWebviewOpen={Boolean(selectedSessionId)}
              rightInset={selectedSessionId ? EMBEDDED_WEBVIEW_WIDTH : 0}
              onSelectCat={() => setSelectedSessionId(null)}
              onSelectSession={handleSelectSession}
              onRunSessionAction={() => {}}
              onRunOpsAction={() => {}}
            />
          </Suspense>

          <header
            className="absolute left-0 top-0 z-50 flex cursor-grab items-center justify-between gap-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-5 py-3 active:cursor-grabbing transition-all duration-200"
            style={{ right: selectedSessionId ? EMBEDDED_WEBVIEW_WIDTH : 0 }}
            onPointerDown={(e) => void startWindowDrag(e)}
          >
            <div className="min-w-0 flex items-center gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">Cat Office</p>
              {selectedTitle && (
                <div className="flex items-center gap-2 rounded-md border border-[#33d1a0]/30 bg-[#33d1a0]/10 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#33d1a0]" />
                  <span className="max-w-[120px] truncate text-[11px] font-bold text-[#c8f8e8]">{selectedTitle}</span>
                  {selectedTotal > 0 && (
                    <span className="text-[10px] font-bold text-[#c8f8e8]/60">{selectedCompleted}/{selectedTotal}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedSessionId && (
                <button
                  type="button"
                  onClick={() => void handleCloseWebview()}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-[#ff8a6b]/40 bg-[#ff8a6b]/15 px-3 text-[11px] font-bold text-[#ff8a6b] backdrop-blur-md hover:border-[#ff8a6b]/60 hover:bg-[#ff8a6b]/25 transition-colors"
                >
                  <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 1l10 10M11 1 1 11" strokeLinecap="round" />
                  </svg>
                  Close Web
                </button>
              )}
              <button
                type="button"
                onClick={() => void onRefreshOfficeState("manual")}
                className="rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 px-3 py-1.5 text-[11px] font-bold text-[#d7efe8] backdrop-blur-md hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
              >
                {isSyncing ? "Syncing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => onOpenSettings()}
                className="rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 px-3 py-1.5 text-[11px] font-bold text-[#d7efe8] backdrop-blur-md hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 text-[#d7efe8] backdrop-blur-md hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
                title="Close office"
              >
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l10 10M11 1 1 11" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
