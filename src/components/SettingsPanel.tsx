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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          data-no-drag
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl w-[90%] max-w-md overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Settings</h2>
              <div className="flex items-center gap-2" data-no-drag>
                <button
                  type="button"
                  onPointerDown={(event) => void startWindowDrag(event)}
                  className="rounded-full border border-gray-600 bg-gray-800/80 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-200 transition-colors hover:border-cyan-300/40 hover:text-white"
                >
                  ⠿ Drag
                </button>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {settingsError && (
                <div className="rounded-lg border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-xs font-semibold leading-5 text-red-100">
                  {settingsError}
                </div>
              )}
              {isApplying && (
                <div className="rounded-lg border border-cyan-300/24 bg-cyan-300/[0.07] px-3 py-2 text-xs font-semibold leading-5 text-cyan-100">
                  Applying settings and refreshing the OpenCode office route...
                </div>
              )}
              <div className={initialFocus === "server" ? "rounded-xl border border-cyan-300/30 bg-cyan-300/[0.055] p-3 shadow-[0_0_24px_rgba(103,232,249,0.08)]" : ""}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-300">
                    OpenCode Server
                  </label>
                  {initialFocus === "server" && (
                    <span className="shrink-0 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">
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
                  className="w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-400/70"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {["http://127.0.0.1:4096", "http://127.0.0.1:4097"].map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setServerUrl(url)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        serverUrl === url
                          ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                          : "border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      {url.replace("http://127.0.0.1:", ":")}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-400">
                  For realtime independent TUI dispatch, start OpenCode with the same port:
                  {" "}
                  <span className="font-mono text-gray-200">opencode -s &lt;session&gt; --port 4097</span>
                </p>
              </div>

              <div className={initialFocus === "database" ? "rounded-xl border border-cyan-300/30 bg-cyan-300/[0.055] p-3 shadow-[0_0_24px_rgba(103,232,249,0.08)]" : ""}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-300">
                    OpenCode Database
                  </label>
                  <div className="flex shrink-0 items-center gap-2">
                    {initialFocus === "database" && (
                      <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">
                        route target
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isApplying}
                      onClick={() => void loadDatabases()}
                      className="rounded-md border border-gray-600 bg-gray-800/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-gray-200 transition-colors hover:border-cyan-300/40 hover:text-white disabled:cursor-default disabled:opacity-40"
                    >
                      {isLoading ? "Scanning" : "Rescan"}
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
                  <span className="rounded-md border border-gray-700 bg-gray-950/40 px-2 py-1">
                    {databases.length} found
                  </span>
                  {selectedDbIsCurrent && (
                    <span className="rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-emerald-100">
                      current route
                    </span>
                  )}
                  {currentDatabasePath && !selectedDbIsCurrent && (
                    <span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-100">
                      route differs
                    </span>
                  )}
                </div>
                
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                ) : databases.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    <p className="text-2xl mb-2">🐱</p>
                    <p>No OpenCode databases found</p>
                    <p className="text-xs mt-1">
                      Make sure you have run OpenCode at least once
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {databases.map((db) => (
                      <label
                        key={db}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedDb === db
                            ? "bg-blue-600/20 border border-blue-500/50"
                            : "bg-gray-800/50 border border-gray-700 hover:bg-gray-700/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="database"
                          value={db}
                          checked={selectedDb === db}
                          onChange={(e) => setSelectedDb(e.target.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{db}</p>
                          <p className="text-xs text-gray-400">OpenCode Database</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  The pet will monitor this database for task progress
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!serverUrl.trim() || isApplying}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
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
