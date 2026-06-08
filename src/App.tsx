import { useState, useEffect, useMemo, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "./store";
import { CatPet } from "./components/XiaoHei";
import { CatOffice } from "./components/CatOffice";
import { SessionPicker } from "./components/SessionPicker";
import { SettingsPanel } from "./components/SettingsPanel";
import { isTauriRuntime } from "./tauriEnv";
import { buildCatSessionDigest, buildPetSessionDigest } from "./opencodeDigest";

function App() {
  const [showPanel, setShowPanel] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<"database" | "server" | undefined>(undefined);
  const [pickerPetId, setPickerPetId] = useState<string | null>(null);
  const [officePetId, setOfficePetId] = useState<string | null>(null);

  const {
    lastEvent,
    eventHistory,
    workspaceState,
    sessionLinks,
    activityItems,
    attentionItems,
    officeSync,
    sessionTodos,
    petConfigs,
    startListening,
    fetchPetConfigs,
    refreshOfficeState,
    bindSession,
    bindPetSession,
    createPetSession,
    fetchSettings,
    findDatabases,
    setDatabasePath,
    fetchAllTodos,
    switchPet,
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
    const mode = showPanel ? "office" : showSettings ? "settings" : showSessionPicker ? "picker" : "compact";
    void invoke("set_window_mode", { mode });
  }, [showPanel, showSettings, showSessionPicker]);

  const digest = useMemo(
    () => buildCatSessionDigest({ workspaceState, activityItems, sessionTodos, lastEvent }),
    [workspaceState, activityItems, sessionTodos, lastEvent],
  );
  const pets = petConfigs;
  const compactPets = pets.slice(0, 1);
  const petDigests = useMemo(
    () => new Map(pets.map((pet) => [
      pet.id,
      buildPetSessionDigest({ petConfig: pet, workspaceState, activityItems, sessionTodos, lastEvent }),
    ])),
    [pets, workspaceState, activityItems, sessionTodos, lastEvent],
  );
  const pickerPet = pets.find((pet) => pet.id === pickerPetId) ?? pets[0];
  const officePet = pets.find((pet) => pet.id === officePetId) ?? pets.find((pet) => pet.bound_session_id) ?? pets[0];
  const pickerDigest = pickerPet ? petDigests.get(pickerPet.id) ?? digest : digest;
  const officeDigest = officePet ? petDigests.get(officePet.id) ?? digest : digest;

  const openSessionPicker = (petId?: string) => {
    const targetPetId = petId ?? pickerPetId ?? pets[0]?.id ?? null;
    setPickerPetId(targetPetId);
    if (isTauriRuntime()) {
      void invoke("set_window_mode", { mode: "picker" });
    }
    setShowPanel(false);
    setShowSettings(false);
    setShowSessionPicker(true);
    window.setTimeout(() => {
      void refreshOfficeState("session-picker");
      void fetchAllTodos();
    }, 0);
  };

  const openOffice = (petId?: string, force = false) => {
    const targetPet = pets.find((pet) => pet.id === petId) ?? officePet;
    if (!force && !targetPet?.bound_session_id) {
      openSessionPicker(targetPet?.id);
      return;
    }
    setOfficePetId(targetPet.id);
    void switchPet(targetPet.id).then(() => refreshOfficeState("open-office"));
    if (isTauriRuntime()) {
      void invoke("set_window_mode", { mode: "office" });
    }
    setShowSessionPicker(false);
    setShowPanel(true);
  };

  const openSettings = (focus?: "database" | "server") => {
    setSettingsFocus(focus);
    setShowSessionPicker(false);
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
      {/* Compact cat */}
      <div className="relative flex items-end gap-2" data-no-drag>
        {compactPets.map((pet) => (
          <CatPet
            key={pet.id}
            petConfig={pet}
            lastEvent={lastEvent}
            isChatOpen={(showPanel && officePet?.id === pet.id) || (showSessionPicker && pickerPet?.id === pet.id)}
            canDragWindow={!showPanel && !showSettings && !showSessionPicker}
            digest={petDigests.get(pet.id) ?? digest}
            onClick={() => pet.bound_session_id ? openOffice(pet.id) : openSessionPicker(pet.id)}
          />
        ))}

        {/* Hover micro-controls */}
        {!showPanel && !showSettings && !showSessionPicker && (
          <div className="mb-3 flex flex-col gap-1 opacity-30 transition-all duration-200 group-hover/app:opacity-100">
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

      <SessionPicker
        isOpen={showSessionPicker}
        digest={pickerDigest}
        targetPet={pickerPet}
        workspaceState={workspaceState}
        sessionLinks={sessionLinks}
        activityItems={activityItems}
        sessionTodos={sessionTodos}
        officeSync={officeSync}
        onClose={() => setShowSessionPicker(false)}
        onOpenOffice={openOffice}
        onOpenSettings={openSettings}
        onRefreshOfficeState={refreshOfficeState}
        onBindSession={bindSession}
        onBindPetSession={bindPetSession}
        onCreatePetSession={createPetSession}
      />

      <CatOffice
        isOpen={showPanel}
        pets={pets}
        activePet={officePet}
        event={lastEvent}
        eventHistory={eventHistory}
        workspaceState={workspaceState}
        sessionLinks={sessionLinks}
        activityItems={activityItems}
        attentionItems={attentionItems}
        officeSync={officeSync}
        digest={officeDigest}
        sessionTodos={sessionTodos}
        onClose={() => setShowPanel(false)}
        onRefreshOfficeState={refreshOfficeState}
        onBindSession={officePet ? (sessionId) => bindPetSession(officePet.id, sessionId) : bindSession}
        onCreatePetSession={createPetSession}
        onOpenSessionPicker={openSessionPicker}
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
