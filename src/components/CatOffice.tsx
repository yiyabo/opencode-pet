import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "framer-motion";
import type {
  OfficeSyncState,
  OpenCodeAlignmentResult,
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

const DOCK_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;
const SCENE_FADE_TRANSITION = { duration: 0.18, delay: 0.04, ease: "easeOut" } as const;
const OFFICE_SKELETON_DESKS = [0, 1, 2, 3, 4, 5];
const WEBVIEW_DOCK_DELAY_MS = 70;
const OPENING_STATE_MS = 520;

function OfficeSceneSkeleton({ docked }: { docked: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#050b0e]"
      style={{
        right: docked ? EMBEDDED_WEBVIEW_WIDTH : 0,
        transition: "right 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "linear-gradient(rgba(137,185,195,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(137,185,195,0.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="absolute left-7 top-6 h-2.5 w-24 rounded-sm bg-[#89b9c3]/14" />
      <div className="absolute left-7 top-20 grid grid-cols-3 gap-4">
        {OFFICE_SKELETON_DESKS.map((item) => (
          <div key={item} className="h-24 w-36 rounded-md border border-[#89b9c3]/10 bg-[#101b1e]/65 shadow-[0_14px_38px_rgba(0,0,0,0.22)]">
            <div className="mx-4 mt-4 h-2 w-20 rounded-sm bg-[#89b9c3]/12" />
            <div className="mx-4 mt-3 h-8 rounded-sm bg-[#33d1a0]/8" />
            <div className="mx-4 mt-3 h-1.5 w-16 rounded-sm bg-[#f0e2bf]/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function WebviewDockPreview({
  visible,
  opening,
  sessionTitle,
}: {
  visible: boolean;
  opening: boolean;
  sessionTitle?: string;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          className="pointer-events-none absolute bottom-0 right-0 top-0 z-30 overflow-hidden border-l border-[#89b9c3]/18 bg-[#071012]"
          style={{ width: EMBEDDED_WEBVIEW_WIDTH }}
          initial={{ opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 22 }}
          transition={DOCK_TRANSITION}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(rgba(51,209,160,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(137,185,195,0.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <motion.div
            className="absolute left-5 right-5 top-5 rounded-md border border-[#33d1a0]/20 bg-[#0d191b]/88 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.06, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#33d1a0] shadow-[0_0_12px_rgba(51,209,160,0.85)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#89b9c3]/70">
                {opening ? "Opening OpenCode" : "OpenCode Dock"}
              </span>
            </div>
            <div className="mt-2 truncate text-xs font-bold text-[#d8fff4]">
              {sessionTitle || "Session workspace"}
            </div>
          </motion.div>
          <motion.div
            className="absolute bottom-0 left-0 top-0 w-1 bg-[#33d1a0]"
            initial={{ opacity: 0.25 }}
            animate={{ opacity: opening ? [0.25, 0.85, 0.25] : 0.32 }}
            transition={{ duration: 0.9, repeat: opening ? Infinity : 0, ease: "easeInOut" }}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

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
  onBindSession: (sessionId: string | null) => Promise<OpenCodeAlignmentResult | null>;
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
  onBindSession,
}: CatOfficeProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [webviewSessionId, setWebviewSessionId] = useState<string | null>(null);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const selectionSequenceRef = useRef(0);
  const webviewOpenTimerRef = useRef<number | null>(null);
  const openingTimerRef = useRef<number | null>(null);

  const startWindowDrag = async (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    if (!isTauriRuntime()) return;
    e.preventDefault();
    await getCurrentWindow().startDragging();
  };

  const closeEmbeddedWebview = async () => {
    if (!isTauriRuntime()) return;
    try {
      await invoke("close_embedded_webview");
    } catch (e) {
      console.error("Failed to close webview:", e);
    }
  };

  const encodeDirectory = (dir: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(dir);
    const str = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };

  const clearWebviewTimers = () => {
    if (webviewOpenTimerRef.current !== null) {
      window.clearTimeout(webviewOpenTimerRef.current);
      webviewOpenTimerRef.current = null;
    }
    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
  };

  const openSessionWebview = (
    sessionId: string,
    serverUrl: string,
    directory: string,
    selectionSequence: number,
  ) => {
    if (!isTauriRuntime()) return false;

    const webviewUrl = `${serverUrl}/${encodeDirectory(directory)}/session/${sessionId}`;
    clearWebviewTimers();
    setWebviewSessionId(sessionId);
    setOpeningSessionId(sessionId);
    webviewOpenTimerRef.current = window.setTimeout(() => {
      webviewOpenTimerRef.current = null;
      if (selectionSequence !== selectionSequenceRef.current) return;
      void invoke("open_embedded_webview", { url: webviewUrl, title: "OpenCode" })
        .then(() => {
          if (selectionSequence !== selectionSequenceRef.current) return;
          openingTimerRef.current = window.setTimeout(() => {
            if (selectionSequence === selectionSequenceRef.current) {
              setOpeningSessionId(null);
            }
            openingTimerRef.current = null;
          }, OPENING_STATE_MS);
        })
        .catch((e) => {
          console.error("Failed to open webview:", e);
          if (selectionSequence === selectionSequenceRef.current) {
            setWebviewSessionId(null);
            setOpeningSessionId(null);
          }
        });
    }, WEBVIEW_DOCK_DELAY_MS);
    return true;
  };

  const fastWebviewTarget = (sessionId: string) => {
    const currentLink = sessionLinks.find((link) => link.id === sessionId);
    const workspaceSessionDirectory =
      workspaceState?.session?.id === sessionId ? workspaceState.session.directory : undefined;
    const directory =
      currentLink?.server?.directory
      || currentLink?.local?.directory
      || workspaceSessionDirectory
      || workspaceState?.project_dir;
    if (!directory || workspaceState?.server_online === false) {
      return null;
    }
    return {
      serverUrl: workspaceState?.server_url ?? "http://127.0.0.1:4096",
      directory,
      isServerDirectory: Boolean(currentLink?.server?.directory),
    };
  };

  const handleSelectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const selectionSequence = selectionSequenceRef.current + 1;
    selectionSequenceRef.current = selectionSequence;
    const fastTarget = fastWebviewTarget(sessionId);
    const openedFastWebview = fastTarget
      ? openSessionWebview(sessionId, fastTarget.serverUrl, fastTarget.directory, selectionSequence)
      : false;

    try {
      const result = await onBindSession(sessionId);
      if (selectionSequence !== selectionSequenceRef.current) return;
      if (!result) {
        if (!openedFastWebview) setSelectedSessionId(null);
        return;
      }

      const nextWorkspace = result.workspace_state ?? workspaceState;
      const nextSessionLinks = result.session_links.length > 0 ? result.session_links : sessionLinks;
      const serverUrl = nextWorkspace?.server_url ?? workspaceState?.server_url ?? "http://127.0.0.1:4096";
      const selectedLink = nextSessionLinks.find((link) => link.id === sessionId);
      const workspaceServerSession =
        nextWorkspace?.server_session?.id === sessionId ? nextWorkspace.server_session : undefined;
      const serverHasSession = Boolean(selectedLink?.server || workspaceServerSession || result.tui_selected);
      const selectedDirectory =
        selectedLink?.server?.directory
        || workspaceServerSession?.directory
        || (serverHasSession ? selectedLink?.local?.directory || nextWorkspace?.session?.directory : undefined);
      
      const shouldCorrectFastWebview =
        openedFastWebview
        && fastTarget
        && !fastTarget.isServerDirectory
        && selectedDirectory
        && selectedDirectory !== fastTarget.directory;

      if (
        (!openedFastWebview || shouldCorrectFastWebview)
        && nextWorkspace?.server_online
        && selectedDirectory
        && serverHasSession
      ) {
        openSessionWebview(sessionId, serverUrl, selectedDirectory, selectionSequence);
      }
    } catch (e) {
      console.error("Failed to bind session:", e);
      if (selectionSequence === selectionSequenceRef.current && !openedFastWebview) {
        setSelectedSessionId(null);
      }
    }
  };

  const handleCloseWebview = () => {
    selectionSequenceRef.current += 1;
    clearWebviewTimers();
    setSelectedSessionId(null);
    setWebviewSessionId(null);
    setOpeningSessionId(null);
    void closeEmbeddedWebview();
  };

  const handleCloseOffice = () => {
    handleCloseWebview();
    onClose();
  };

  useEffect(() => {
    if (isOpen) return;
    selectionSequenceRef.current += 1;
    clearWebviewTimers();
    setSelectedSessionId(null);
    setWebviewSessionId(null);
    setOpeningSessionId(null);
    void closeEmbeddedWebview();
  }, [isOpen]);

  useEffect(() => () => {
    clearWebviewTimers();
  }, []);

  const selectedLink = sessionLinks?.find((l) => l.id === selectedSessionId);
  const selectedTitle = selectedLink?.local?.title || selectedLink?.server?.title;
  const selectedTodos = selectedSessionId ? sessionTodos[selectedSessionId] : undefined;
  const selectedCompleted = selectedTodos?.filter((t) => t.status === "completed").length ?? 0;
  const selectedTotal = selectedTodos?.length ?? 0;

  const isSyncing = officeSync.status === "syncing";
  const isWebviewDocked = Boolean(webviewSessionId);
  const isOpeningWebview = Boolean(openingSessionId);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-40 overflow-hidden rounded-lg border border-[#89b9c3]/18 bg-[#071012] text-white shadow-[0_24px_80px_rgba(0,0,0,0.74)]"
          data-no-drag
          onPointerDown={(e) => void startWindowDrag(e)}
          style={{ transformOrigin: "left center" }}
          initial={{ opacity: 0, x: -18, scaleX: 0.92, scaleY: 0.98 }}
          animate={{ opacity: 1, x: 0, scaleX: 1, scaleY: 1 }}
          exit={{ opacity: 0, x: -12, scaleX: 0.96, scaleY: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          <Suspense
            fallback={<OfficeSceneSkeleton docked={isWebviewDocked} />}
          >
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={SCENE_FADE_TRANSITION}
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
                isWebviewOpen={isWebviewDocked}
                rightInset={isWebviewDocked ? EMBEDDED_WEBVIEW_WIDTH : 0}
                onSelectCat={() => setSelectedSessionId(null)}
                onSelectSession={handleSelectSession}
                onRunSessionAction={() => {}}
                onRunOpsAction={() => {}}
              />
            </motion.div>
          </Suspense>

          <WebviewDockPreview
            visible={isWebviewDocked}
            opening={isOpeningWebview}
            sessionTitle={selectedTitle}
          />

          <motion.header
            className="absolute left-0 top-0 z-50 flex cursor-grab items-center justify-between gap-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-5 py-3 active:cursor-grabbing"
            initial={false}
            animate={{ right: isWebviewDocked ? EMBEDDED_WEBVIEW_WIDTH : 0 }}
            transition={DOCK_TRANSITION}
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
              <AnimatePresence>
                {isOpeningWebview && (
                  <motion.span
                    className="rounded-md border border-[#f0e2bf]/25 bg-[#f0e2bf]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#f0e2bf]"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                  >
                    Opening
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AnimatePresence initial={false}>
                {webviewSessionId && (
                  <motion.button
                    type="button"
                    onClick={handleCloseWebview}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#ff8a6b]/40 bg-[#ff8a6b]/15 px-3 text-[11px] font-bold text-[#ff8a6b] backdrop-blur-md hover:border-[#ff8a6b]/60 hover:bg-[#ff8a6b]/25 transition-colors"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={DOCK_TRANSITION}
                  >
                    <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 1l10 10M11 1 1 11" strokeLinecap="round" />
                    </svg>
                    Close Web
                  </motion.button>
                )}
              </AnimatePresence>
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
                onClick={handleCloseOffice}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 text-[#d7efe8] backdrop-blur-md hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white transition-colors"
                title="Close office"
              >
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 1l10 10M11 1 1 11" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </motion.header>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
