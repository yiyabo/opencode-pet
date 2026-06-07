import { useState, useEffect, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "./store";
import { XiaoHei } from "./components/XiaoHei";
import { CatOffice } from "./components/CatOffice";
import { SettingsPanel } from "./components/SettingsPanel";
import { isTauriRuntime } from "./tauriEnv";

function App() {
  const [showPanel, setShowPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<"database" | "server" | undefined>(undefined);

  const {
    petState,
    lastEvent,
    eventHistory,
    workspaceState,
    sessionLinks,
    activityItems,
    attentionItems,
    officeSync,
    sessionTodos,
    startListening,
    fetchPetConfigs,
    refreshOfficeState,
    bindSession,
    fetchSettings,
    findDatabases,
    setDatabasePath,
    fetchAllTodos,
    hideWindow,
  } = usePetStore();

  useEffect(() => {
    void refreshOfficeState("startup");
    if (!isTauriRuntime()) return;
    startListening();
    void fetchPetConfigs();
    void fetchSettings();
    void fetchAllTodos();
    void (async () => {
      const dbs = await findDatabases();
      if (dbs.length > 0 && await setDatabasePath(dbs[0])) {
        await refreshOfficeState("database");
        await fetchAllTodos();
      }
    })();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const mode = showPanel ? "office" : showSettings ? "settings" : "compact";
    void invoke("set_window_mode", { mode });
  }, [showPanel, showSettings]);

  const openPanel = () => {
    if (isTauriRuntime()) {
      void invoke("set_window_mode", { mode: "office" });
    }
    setShowPanel(true);
    window.setTimeout(() => {
      void refreshOfficeState("open-office");
    }, 0);
  };

  const openSettings = (focus?: "database" | "server") => {
    setSettingsFocus(focus);
    setShowSettings(true);
  };

  const closeSettings = () => {
    setShowSettings(false);
    setSettingsFocus(undefined);
  };

  const handleDragStart = async (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-no-drag], button, input, select, textarea")) return;
    if (!isTauriRuntime()) return;
    await getCurrentWindow().startDragging();
  };

  return (
    <div
      className="group/app relative flex h-screen w-screen items-center justify-start overflow-hidden pl-3 cursor-grab active:cursor-grabbing"
      style={{ background: "transparent" }}
      onPointerDown={handleDragStart}
      data-tauri-drag-region
    >
      {/* Cat column */}
      <div className="relative flex flex-col items-center gap-1" data-no-drag>
        <XiaoHei
          petState={petState}
          lastEvent={lastEvent}
          isChatOpen={showPanel}
          onClick={openPanel}
        />

        {/* Hover micro-controls */}
        {!showPanel && !showSettings && (
          <div className="flex gap-1 opacity-30 transition-all duration-200 group-hover/app:opacity-100">
            <button
              type="button"
              onClick={() => openSettings()}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/8 text-white/55 hover:bg-white/16 hover:text-white transition-all"
              title="设置"
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void hideWindow()}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/8 text-white/55 hover:bg-white/16 hover:text-white transition-all"
              title="隐藏"
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <CatOffice
        isOpen={showPanel}
        event={lastEvent}
        eventHistory={eventHistory}
        workspaceState={workspaceState}
        sessionLinks={sessionLinks}
        activityItems={activityItems}
        attentionItems={attentionItems}
        officeSync={officeSync}
        sessionTodos={sessionTodos}
        onClose={() => setShowPanel(false)}
        onRefreshOfficeState={refreshOfficeState}
        onBindSession={bindSession}
        onOpenSettings={openSettings}
      />

      <SettingsPanel
        isOpen={showSettings}
        onClose={closeSettings}
        initialFocus={settingsFocus}
        currentDatabasePath={workspaceState?.database_path}
      />
    </div>
  );
}

export default App;
