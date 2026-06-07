import { useState, useEffect, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import { usePetStore } from "../store";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialFocus?: "database" | "server";
  currentDatabasePath?: string;
}

export function SettingsPanel({ isOpen, onClose, initialFocus, currentDatabasePath }: SettingsPanelProps) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [serverUrl, setServerUrl] = useState("http://127.0.0.1:4096");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const selectedDbIsCurrent = Boolean(selectedDb && currentDatabasePath && selectedDb === currentDatabasePath);

  const { findDatabases, setDatabasePath, fetchSettings, updateSettings, settings } = usePetStore();

  useEffect(() => {
    if (isOpen) {
      loadDatabases();
      fetchSettings();
    }
  }, [isOpen, fetchSettings]);

  useEffect(() => {
    if (isOpen) {
      setServerUrl(settings.opencode_server_url);
      setSettingsError(null);
    }
  }, [isOpen, settings.opencode_server_url]);

  const loadDatabases = async () => {
    setIsLoading(true);
    setSettingsError(null);
    try {
      const dbs = await findDatabases();
      const mergedDbs = currentDatabasePath && !dbs.includes(currentDatabasePath)
        ? [currentDatabasePath, ...dbs]
        : dbs;
      setDatabases(mergedDbs);
      if (currentDatabasePath) {
        setSelectedDb(currentDatabasePath);
      } else if (mergedDbs.length > 0 && !selectedDb) {
        setSelectedDb(mergedDbs[0]);
      }
    } catch (err) {
      console.error("Failed to find databases:", err);
      setSettingsError("Could not rescan OpenCode databases.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    setSettingsError(null);
    setIsApplying(true);
    try {
      const savedSettings = await updateSettings({ opencode_server_url: serverUrl });
      if (!savedSettings) {
        setSettingsError("Could not save OpenCode server URL.");
        return;
      }

      if (selectedDb) {
        const databaseSaved = await setDatabasePath(selectedDb);
        if (!databaseSaved) {
          setSettingsError("Could not apply the selected OpenCode database.");
          return;
        }
      }

      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const startWindowDrag = async (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) return;
    await getCurrentWindow().startDragging();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm"
          data-no-drag
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-[90%] max-w-md overflow-hidden rounded-xl border border-[#89b9c3]/18 bg-[#071012] text-white shadow-[0_24px_80px_rgba(0,0,0,0.74)]"
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#89b9c3]/14 bg-gradient-to-b from-black/40 to-transparent px-5 py-3.5">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">Settings</p>
              <div className="flex items-center gap-2" data-no-drag>
                <button
                  type="button"
                  onPointerDown={(event) => void startWindowDrag(event)}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 px-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#9fb4b8] transition-colors hover:border-[#33d1a0]/45 hover:text-white"
                >
                  ⠿ Drag
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 text-[#d7efe8] transition-colors hover:border-[#9fd7df]/45 hover:bg-[#d7efe8]/10 hover:text-white"
                  title="Close"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {settingsError && (
                <div className="rounded-lg border border-[#e8755f]/30 bg-[#e8755f]/[0.1] px-3 py-2 text-xs font-semibold leading-5 text-[#f4c4b8]">
                  {settingsError}
                </div>
              )}
              {isApplying && (
                <div className="rounded-lg border border-[#33d1a0]/24 bg-[#33d1a0]/[0.08] px-3 py-2 text-xs font-semibold leading-5 text-[#bfeede]">
                  Applying settings and refreshing the OpenCode office route...
                </div>
              )}
              <div className={initialFocus === "server" ? "rounded-xl border border-[#33d1a0]/30 bg-[#33d1a0]/[0.055] p-3 shadow-[0_0_24px_rgba(51,209,160,0.08)]" : ""}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-[#9fb4b8]">
                    OpenCode Server
                  </label>
                  {initialFocus === "server" && (
                    <span className="shrink-0 rounded-md border border-[#33d1a0]/30 bg-[#33d1a0]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#bfeede]">
                      route target
                    </span>
                  )}
                </div>
                <input
                  value={serverUrl}
                  onChange={(event) => {
                    setServerUrl(event.target.value);
                    setSettingsError(null);
                  }}
                  placeholder="http://127.0.0.1:4096"
                  className="w-full rounded-lg border border-[#9fd7df]/20 bg-[#050b0e] px-3 py-2 text-sm text-[#d7efe8] outline-none transition-colors placeholder:text-[#4f6166] focus:border-[#33d1a0]/70"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {["http://127.0.0.1:4096", "http://127.0.0.1:4097"].map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setServerUrl(url)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        serverUrl === url
                          ? "border-[#33d1a0]/60 bg-[#33d1a0]/15 text-[#c8f8e8]"
                          : "border-[#9fd7df]/18 bg-[#0e1a1d] text-[#9fb4b8] hover:border-[#9fd7df]/35 hover:text-[#d7efe8]"
                      }`}
                    >
                      {url.replace("http://127.0.0.1:", ":")}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-[#9fb4b8]">
                  For realtime independent TUI dispatch, start OpenCode with the same port:
                  {" "}
                  <span className="font-mono text-[#d8fff4]">opencode -s &lt;session&gt; --port 4097</span>
                </p>
              </div>

              <div className={initialFocus === "database" ? "rounded-xl border border-[#33d1a0]/30 bg-[#33d1a0]/[0.055] p-3 shadow-[0_0_24px_rgba(51,209,160,0.08)]" : ""}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-[#9fb4b8]">
                    OpenCode Database
                  </label>
                  <div className="flex shrink-0 items-center gap-2">
                    {initialFocus === "database" && (
                      <span className="rounded-md border border-[#33d1a0]/30 bg-[#33d1a0]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#bfeede]">
                        route target
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isApplying}
                      onClick={() => void loadDatabases()}
                      className="rounded-md border border-[#9fd7df]/25 bg-[#071012]/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#9fb4b8] transition-colors hover:border-[#33d1a0]/45 hover:text-white disabled:cursor-default disabled:opacity-40"
                    >
                      {isLoading ? "Scanning" : "Rescan"}
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em]">
                  <span className="rounded-md border border-[#9fd7df]/18 bg-[#050b0e]/60 px-2 py-1 text-[#9fb4b8]">
                    {databases.length} found
                  </span>
                  {selectedDbIsCurrent && (
                    <span className="rounded-md border border-[#55d69e]/25 bg-[#55d69e]/10 px-2 py-1 text-[#bfeede]">
                      current route
                    </span>
                  )}
                  {currentDatabasePath && !selectedDbIsCurrent && (
                    <span className="rounded-md border border-[#ffd166]/25 bg-[#ffd166]/10 px-2 py-1 text-[#f0e2bf]">
                      route differs
                    </span>
                  )}
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[#33d1a0]"></div>
                  </div>
                ) : databases.length === 0 ? (
                  <div className="py-4 text-center text-[#9fb4b8]">
                    <p className="mb-2 text-2xl">🐱</p>
                    <p className="text-sm">No OpenCode databases found</p>
                    <p className="mt-1 text-xs text-[#6f8c96]">
                      Make sure you have run OpenCode at least once
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {databases.map((db) => (
                      <label
                        key={db}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors ${
                          selectedDb === db
                            ? "border border-[#33d1a0]/45 bg-[#33d1a0]/[0.12]"
                            : "border border-[#9fd7df]/12 bg-[#0e1a1d] hover:border-[#9fd7df]/25 hover:bg-[#142226]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="database"
                          value={db}
                          checked={selectedDb === db}
                          onChange={(e) => setSelectedDb(e.target.value)}
                          className="h-4 w-4 accent-[#33d1a0]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#d7efe8]">{db}</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f8c96]">OpenCode Database</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-[#9fb4b8]">
                <svg className="h-4 w-4 shrink-0 text-[#33d1a0]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  The pet will monitor this database for task progress
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#89b9c3]/14 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#9fd7df]/20 bg-[#071012]/60 px-4 py-2 text-sm font-semibold text-[#9fb4b8] transition-colors hover:border-[#9fd7df]/40 hover:bg-[#d7efe8]/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!serverUrl.trim() || isApplying}
                className="rounded-lg bg-[#33d1a0] px-4 py-2 text-sm font-bold text-[#04201a] transition-colors hover:bg-[#55d69e] disabled:cursor-not-allowed disabled:bg-[#16262a] disabled:text-white/30"
              >
                {isApplying ? "Syncing..." : "Apply"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
