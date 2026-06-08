import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppSettings,
  OpenCodeActivityItem,
  OpenCodeAttentionItem,
  PetState,
  PetConfig,
  OfficeSyncState,
  Session,
  Message,
  OpenCodeAlignmentResult,
  OpenCodeEvent,
  OpenCodeLaunchResult,
  OpenCodeOfficeSnapshot,
  OpenCodeSessionLink,
  OpenCodeSessionSummary,
  OpenCodeStreamState,
  OpenCodeWorkspaceState,
  TodoItem,
} from "./types";
import { isTauriRuntime } from "./tauriEnv";

let workspaceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const WORKSPACE_REFRESH_DEBOUNCE_MS = 1500;

function scheduleWorkspaceRefresh(refresh: () => Promise<unknown>) {
  if (workspaceRefreshTimer) return;
  workspaceRefreshTimer = setTimeout(() => {
    workspaceRefreshTimer = null;
    void refresh();
  }, WORKSPACE_REFRESH_DEBOUNCE_MS);
}

interface PetStore {
  petState: PetState;
  currentSession: Session | null;
  sessions: Session[];
  boundSessionId: string | null;
  messages: Message[];
  lastEvent: OpenCodeEvent | null;
  eventHistory: OpenCodeEvent[];
  workspaceState: OpenCodeWorkspaceState | null;
  sessionLinks: OpenCodeSessionLink[];
  activityItems: OpenCodeActivityItem[];
  attentionItems: OpenCodeAttentionItem[];
  officeSync: OfficeSyncState;
  petConfigs: PetConfig[];
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;
  sessionTodos: Record<string, TodoItem[]>;
  
  fetchPetState: () => Promise<void>;
  fetchCurrentSession: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchBoundSessionId: () => Promise<void>;
  bindSession: (sessionId: string | null) => Promise<OpenCodeAlignmentResult | null>;
  bindPetSession: (petId: string, sessionId: string | null) => Promise<OpenCodeAlignmentResult | null>;
  createPetSession: (petId: string, title?: string) => Promise<OpenCodeAlignmentResult | null>;
  bindSharedServerSession: () => Promise<OpenCodeWorkspaceState | null>;
  fetchMessages: (sessionId: string) => Promise<void>;
  refreshOpenCodeState: () => Promise<void>;
  refreshOfficeState: (source?: string) => Promise<OpenCodeOfficeSnapshot | null>;
  fetchWorkspaceState: () => Promise<void>;
  fetchSessionLinks: () => Promise<void>;
  fetchOpenCodeActivity: () => Promise<void>;
  fetchOpenCodeAttention: () => Promise<void>;
  ensureOpenCodeServer: () => Promise<OpenCodeWorkspaceState | null>;
  alignOpenCodeSession: () => Promise<OpenCodeAlignmentResult | null>;
  launchOpenCodeWeb: (sessionId?: string) => Promise<OpenCodeLaunchResult | null>;
  launchOpenCodeAttach: (sessionId?: string) => Promise<OpenCodeLaunchResult | null>;
  setDatabasePath: (path: string) => Promise<boolean>;
  findDatabases: () => Promise<string[]>;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<AppSettings | null>;
  startListening: () => void;
  fetchSessionTodos: (sessionId: string) => Promise<void>;
  fetchAllTodos: () => Promise<void>;
  
  fetchPetConfigs: () => Promise<void>;
  addPetConfig: (config: PetConfig) => Promise<void>;
  removePetConfig: (configId: string) => Promise<void>;
  updatePetConfig: (config: PetConfig) => Promise<void>;
  switchPet: (configId: string) => Promise<void>;
  
  setMeowing: (isMeowing: boolean) => Promise<void>;
  
  showWindow: () => Promise<void>;
  hideWindow: () => Promise<void>;
}

const defaultPetState: PetState = {
  progress: {
    total_tools: 0,
    completed_tools: 0,
    current_tool: "",
    status: "idle",
    session_title: "",
    last_message: "",
  },
  is_meowing: false,
  mood: "sleeping",
  current_pet_id: undefined,
  last_event: undefined,
};

const defaultSettings: AppSettings = {
  opencode_server_url: "http://127.0.0.1:4096",
};

const defaultOfficeSync: OfficeSyncState = {
  status: "idle",
  source: "startup",
  sequence: 0,
};

const PREVIEW_DEFAULT_SESSION_ID = "preview-frontend";
const PREVIEW_PROJECT_DIR = "/workspace/opencode-pet";
const PREVIEW_TAURI_DIR = `${PREVIEW_PROJECT_DIR}/src-tauri`;
const PREVIEW_DB_PATH = `${PREVIEW_PROJECT_DIR}/.opencode`;
let previewBoundSessionId: string | null = PREVIEW_DEFAULT_SESSION_ID;

function defaultPreviewPetConfigs(): PetConfig[] {
  return [
    { id: "xiaohei", name: "XiaoHei", project_path: PREVIEW_PROJECT_DIR, db_path: PREVIEW_DB_PATH, image_path: undefined, bound_session_id: previewBoundSessionId ?? undefined, coat: "tuxedo", sound_enabled: true },
    { id: "mikan", name: "Mikan", project_path: PREVIEW_PROJECT_DIR, db_path: PREVIEW_DB_PATH, image_path: undefined, bound_session_id: undefined, coat: "orange", sound_enabled: true },
    { id: "cali", name: "Cali", project_path: PREVIEW_PROJECT_DIR, db_path: PREVIEW_DB_PATH, image_path: undefined, bound_session_id: undefined, coat: "calico", sound_enabled: true },
    { id: "goma", name: "Goma", project_path: PREVIEW_PROJECT_DIR, db_path: PREVIEW_DB_PATH, image_path: undefined, bound_session_id: undefined, coat: "gray", sound_enabled: true },
  ];
}

function applyPreviewSnapshot(
  snapshot: OpenCodeOfficeSnapshot,
  setState: (state: Partial<PetStore>) => void,
) {
  setState({
    petState: snapshot.pet_state,
    sessions: snapshot.sessions,
    boundSessionId: snapshot.bound_session_id ?? null,
    currentSession: snapshot.current_session ?? null,
    messages: snapshot.messages,
    workspaceState: snapshot.workspace_state,
    sessionLinks: snapshot.session_links,
    activityItems: snapshot.activity_items,
    attentionItems: snapshot.attention_items,
    lastEvent: snapshot.pet_state.last_event ?? snapshot.event_history[0] ?? null,
    eventHistory: snapshot.event_history,
    error: null,
  });
}

function previewAlignmentResult(
  snapshot: OpenCodeOfficeSnapshot,
  action: string,
  previousSessionId?: string,
): OpenCodeAlignmentResult {
  const title = snapshot.current_session?.title ?? "session";
  return {
    action,
    message: action === "follow"
      ? `Preview following latest ${title}; TUI selected`
      : action === "kept"
        ? `Preview kept ${title}; TUI selected`
        : action === "rebound"
          ? `Preview rebound to ${title}; TUI selected`
          : `Preview bound ${title}; TUI selected`,
    previous_session_id: previousSessionId,
    selected_session_id: snapshot.current_session?.id,
    tui_selected: true,
    tui_detail: "Preview TUI selected the session",
    workspace_state: snapshot.workspace_state,
    session_links: snapshot.session_links,
  };
}

function previewLaunchResult(
  snapshot: OpenCodeOfficeSnapshot,
  action: "web" | "attach",
): OpenCodeLaunchResult {
  const sessionId = snapshot.current_session?.id;
  const title = snapshot.current_session?.title ?? sessionId ?? "session";
  const serverUrl = snapshot.workspace_state.server_url;
  const projectDir = snapshot.workspace_state.project_dir ?? PREVIEW_PROJECT_DIR;
  return {
    action,
    status: "success",
    message: action === "web"
      ? `Preview opened OpenCode web console at ${serverUrl}`
      : `Preview attached Terminal to OpenCode session ${title}; TUI selected`,
    command: action === "web"
      ? `preview://open ${serverUrl}`
      : `preview://terminal opencode attach ${serverUrl}${sessionId ? ` --session ${sessionId}` : ""}`,
    server_url: serverUrl,
    session_id: sessionId,
    project_dir: projectDir,
    workspace_state: snapshot.workspace_state,
    session_links: snapshot.session_links,
  };
}

function previewDispatchQuietResolved(event: OpenCodeEvent, eventHistory: OpenCodeEvent[]): boolean {
  return event.event_type === "dispatch.quiet"
    && eventHistory.some((candidate) =>
      candidate.session_id === event.session_id
      && candidate.event_type === "dispatch.observed"
      && candidate.timestamp > event.timestamp
    );
}

function makePreviewOfficeSnapshot(now = Date.now()): OpenCodeOfficeSnapshot {
  const sessions: Session[] = [
    {
      id: "preview-frontend",
      title: "Pixel office polish",
      directory: PREVIEW_PROJECT_DIR,
      message_count: 42,
      prompt_tokens: 18420,
      completion_tokens: 9320,
      cost: 0.84,
      updated_at: now - 24_000,
      created_at: now - 3_600_000,
    },
    {
      id: "preview-dispatch",
      title: "OpenCode handoff route",
      directory: PREVIEW_PROJECT_DIR,
      message_count: 18,
      prompt_tokens: 9200,
      completion_tokens: 4100,
      cost: 0.37,
      updated_at: now - 7 * 60_000,
      created_at: now - 2_400_000,
    },
    {
      id: "preview-tests",
      title: "Tauri validation sweep",
      directory: PREVIEW_TAURI_DIR,
      message_count: 11,
      prompt_tokens: 6400,
      completion_tokens: 2700,
      cost: 0.21,
      updated_at: now - 18 * 60_000,
      created_at: now - 1_900_000,
    },
    {
      id: "preview-quiet",
      title: "Quiet dispatch follow-up",
      directory: PREVIEW_PROJECT_DIR,
      message_count: 9,
      prompt_tokens: 5200,
      completion_tokens: 1600,
      cost: 0.16,
      updated_at: now - 11 * 60_000,
      created_at: now - 1_200_000,
    },
  ];
  const boundPreviewSessionId = previewBoundSessionId;
  const selectedSession = boundPreviewSessionId
    ? sessions.find((item) => item.id === boundPreviewSessionId) ?? sessions[0]
    : sessions[0];
  const selectedSessionId = selectedSession.id;
  const latestEvent: OpenCodeEvent = {
    id: "preview-event-tool-started",
    event_type: "tool.started",
    severity: "info",
    source: "preview",
    session_id: selectedSessionId,
    title: selectedSession.title,
    summary: selectedSessionId === "preview-dispatch"
      ? "Dispatch handoff is staged and ready"
      : selectedSessionId === "preview-tests"
        ? "Tauri validation drift needs alignment"
        : "Rendering session-aware desk screens",
    tool_name: selectedSessionId === "preview-tests" ? "cargo check" : "pnpm build",
    timestamp: now - 24_000,
  };
  const eventHistory: OpenCodeEvent[] = [
    latestEvent,
    {
      id: "preview-event-dispatch-ready",
      event_type: "assistant.completed",
      severity: "success",
      source: "preview",
      session_id: "preview-dispatch",
      title: "OpenCode handoff route",
      summary: "Context handoff is ready for dispatch",
      tool_name: "",
      timestamp: now - 7 * 60_000,
    },
    {
      id: "preview-event-dispatch-old-quiet",
      event_type: "dispatch.quiet",
      severity: "warning",
      source: "opencode-pet",
      session_id: "preview-dispatch",
      title: "OpenCode handoff route",
      summary: "No OpenCode activity was observed before the later follow-up succeeded",
      tool_name: "dispatch-follow",
      timestamp: now - 6 * 60_000 - 30_000,
    },
    {
      id: "preview-event-dispatch-observed",
      event_type: "dispatch.observed",
      severity: "success",
      source: "opencode-pet",
      session_id: "preview-dispatch",
      title: "OpenCode handoff route",
      summary: "Observed assistant response after dispatch follow-up",
      tool_name: "dispatch-follow",
      timestamp: now - 6 * 60_000,
    },
    {
      id: "preview-event-tests-drift",
      event_type: "session.updated",
      severity: "warning",
      source: "preview",
      session_id: "preview-tests",
      title: "Tauri validation sweep",
      summary: "Server path differs from local SQLite path",
      tool_name: "cargo check",
      timestamp: now - 18 * 60_000,
    },
    {
      id: "preview-event-dispatch-quiet",
      event_type: "dispatch.quiet",
      severity: "warning",
      source: "opencode-pet",
      session_id: "preview-quiet",
      title: "Quiet dispatch follow-up",
      summary: "No OpenCode activity was observed after dispatch follow-up",
      tool_name: "dispatch-follow",
      timestamp: now - 11 * 60_000,
    },
  ];
  const messages: Message[] = [
    {
      id: "preview-user-1",
      session_id: selectedSessionId,
      role: "user",
      parts: JSON.stringify([
        {
          type: "text",
          data: {
            text: selectedSessionId === "preview-dispatch"
              ? "Can you make the runbook dispatch more context aware?"
              : selectedSessionId === "preview-tests"
                ? "Run validation and tell me if the Tauri side still lines up."
                : "Make the pixel office feel like a real OpenCode control room.",
          },
        },
      ]),
      model: "preview",
      created_at: now - 96_000,
      finished_at: now - 95_000,
    },
    {
      id: "preview-assistant-1",
      session_id: selectedSessionId,
      role: "assistant",
      parts: JSON.stringify([
        {
          type: "text",
          data: {
            text: selectedSessionId === "preview-dispatch"
              ? "I prepared a context handoff and need confirmation to route it."
              : selectedSessionId === "preview-tests"
                ? "The checks pass, but the server path needs alignment."
                : "Mapping sessions to desks and preparing a handoff card.",
          },
        },
      ]),
      model: "opencode-preview",
      created_at: now - 45_000,
    },
  ];
  const selectedServerSession = {
    id: selectedSession.id,
    title: selectedSession.title,
    directory: selectedSession.directory,
    agent: "opencode",
    model_provider: selectedSessionId === "preview-frontend" ? "anthropic" : "opencode",
    model_id: selectedSessionId === "preview-frontend" ? "claude-sonnet-preview" : "preview",
    message_count: selectedSession.message_count,
    updated_at: selectedSession.updated_at,
    created_at: selectedSession.created_at,
  };
  const workspaceState: OpenCodeWorkspaceState = {
    server_url: "http://127.0.0.1:4096",
    server_status: "online",
    server_online: true,
    server_detail: "Preview OpenCode server is simulated",
    server_latency_ms: 12,
    checked_at_ms: now,
    check_duration_ms: 38,
    check_stages: [
      { key: "snapshot", label: "Snapshot", status: "success", detail: "Preview snapshot loaded", source: "preview", checked_at_ms: now - 38, duration_ms: 4 },
      { key: "database", label: "Database", status: "success", detail: "Preview SQLite session map", source: "preview", checked_at_ms: now - 31, duration_ms: 9 },
      { key: "server", label: "Server", status: "success", detail: "Preview server online", source: "preview", checked_at_ms: now - 20, duration_ms: 12 },
      { key: "stream", label: "Stream", status: "success", detail: "Preview SSE connected", source: "preview", checked_at_ms: now - 8, duration_ms: 6 },
    ],
    database_path: PREVIEW_DB_PATH,
    database_status: "connected",
    database_valid: true,
    watched_paths: [PREVIEW_DB_PATH],
    watch_mode: boundPreviewSessionId ? "bound" : "unbound",
    bound_session_id: boundPreviewSessionId ?? undefined,
    session: selectedSession,
    session_status: boundPreviewSessionId ? "bound" : "latest",
    session_on_server: true,
    server_session: selectedServerSession,
    session_directory_matches: true,
    session_title_matches: true,
    stream: {
      status: "connected",
      detail: "Preview stream is feeding office desks",
      connected_at: now - 140_000,
      last_event_at: now - 24_000,
      event_count: 17,
    },
    project_dir: PREVIEW_PROJECT_DIR,
    progress: {
      total_tools: 6,
      completed_tools: selectedSessionId === "preview-frontend" ? 4 : 6,
      current_tool: selectedSessionId === "preview-tests" ? "cargo check" : "pnpm build",
      status: selectedSessionId === "preview-dispatch" ? "completed" : "working",
      session_title: selectedSession.title,
      last_message: latestEvent.summary,
    },
    last_event: latestEvent,
    dispatch_ready: true,
    next_action: {
      kind: "dispatch",
      label: "Dispatch",
      priority: "info",
      summary: "Route the staged handoff into the focused OpenCode session",
      session_id: selectedSessionId,
    },
    capabilities: [
      { key: "server", label: "Start server", available: true, status: "online", detail: "Preview server reachable" },
      { key: "database", label: "Read SQLite", available: true, status: "connected", detail: "Preview database mapped" },
      { key: "match", label: "Match session", available: true, status: "bound", detail: "Focused session is aligned" },
      { key: "align", label: "Align session", available: true, status: "ready", detail: "TUI target is selected" },
      { key: "dispatch", label: "Dispatch prompt", available: true, status: "ready", detail: "Prompt can be routed into OpenCode" },
      { key: "web", label: "Open web", available: true, status: "connected", detail: "Web console available" },
    ],
    health: [
      { level: "success", code: "preview-ready", message: "Preview office shows live OpenCode fusion states" },
      { level: "info", code: "handoff", message: "Runbook handoff includes user and assistant context" },
    ],
  };
  const sessionLinks: OpenCodeSessionLink[] = [
    {
      id: "preview-frontend",
      local: sessions[0],
      server: selectedSessionId === "preview-frontend" ? workspaceState.server_session : undefined,
      status: boundPreviewSessionId === "preview-frontend" ? "linked" : "local-only",
      directory_matches: boundPreviewSessionId === "preview-frontend",
      title_matches: true,
      is_bound: boundPreviewSessionId === "preview-frontend",
      is_current: selectedSessionId === "preview-frontend",
      updated_at: now - 24_000,
    },
    {
      id: "preview-dispatch",
      local: sessions[1],
      server: selectedSessionId === "preview-dispatch" ? workspaceState.server_session : undefined,
      status: boundPreviewSessionId === "preview-dispatch" ? "linked" : "local-only",
      directory_matches: boundPreviewSessionId === "preview-dispatch",
      title_matches: true,
      is_bound: boundPreviewSessionId === "preview-dispatch",
      is_current: selectedSessionId === "preview-dispatch",
      updated_at: now - 7 * 60_000,
    },
    {
      id: "preview-tests",
      local: sessions[2],
      server: selectedSessionId === "preview-tests" ? workspaceState.server_session : undefined,
      status: boundPreviewSessionId === "preview-tests" ? "linked" : "directory-diff",
      directory_matches: boundPreviewSessionId === "preview-tests",
      title_matches: true,
      is_bound: boundPreviewSessionId === "preview-tests",
      is_current: selectedSessionId === "preview-tests",
      updated_at: now - 18 * 60_000,
    },
    {
      id: "preview-quiet",
      local: sessions[3],
      server: selectedSessionId === "preview-quiet" ? workspaceState.server_session : undefined,
      status: boundPreviewSessionId === "preview-quiet" ? "linked" : "local-only",
      directory_matches: boundPreviewSessionId === "preview-quiet",
      title_matches: true,
      is_bound: boundPreviewSessionId === "preview-quiet",
      is_current: selectedSessionId === "preview-quiet",
      updated_at: now - 11 * 60_000,
    },
  ];
  const activityItems: OpenCodeActivityItem[] = [
    {
      id: "preview-frontend",
      title: "Pixel office polish",
      directory: PREVIEW_PROJECT_DIR,
      status: "working",
      phase: "tool-running",
      status_reason: "OpenCode is running pnpm build while rendering session-aware desk screens",
      last_signal: "TOOL pnpm build",
      next_action_kind: "continue",
      next_action_label: "Continue",
      next_action_reason: "OpenCode is actively working; ask it to continue and report the next concrete step",
      link_status: "linked",
      source: "local+server",
      is_bound: boundPreviewSessionId === "preview-frontend",
      is_current: selectedSessionId === "preview-frontend",
      is_on_server: selectedSessionId === "preview-frontend",
      message_count: 42,
      updated_at: now - 24_000,
      last_message: "Rendering session-aware desk screens",
      last_event: latestEvent,
      tool_name: "pnpm build",
      model: "anthropic/claude-sonnet-preview",
      last_role: "assistant",
      last_user_message: "Make the pixel office feel like a real OpenCode control room.",
      last_assistant_message: "Mapping sessions to desks and preparing a handoff card.",
      awaiting_user: false,
      idle_ms: 24_000,
      total_tools: 6,
      completed_tools: 4,
    },
    {
      id: "preview-dispatch",
      title: "OpenCode handoff route",
      directory: PREVIEW_PROJECT_DIR,
      status: "followed",
      phase: "dispatch-followed",
      status_reason: "Dispatch was accepted and later OpenCode activity was observed",
      last_signal: "TX FOLLOW",
      next_action_kind: "review",
      next_action_label: "Review",
      next_action_reason: "The dispatch has follow-up activity; review the session before sending more work",
      link_status: boundPreviewSessionId === "preview-dispatch" ? "linked" : "local-only",
      source: boundPreviewSessionId === "preview-dispatch" ? "local+server" : "local",
      is_bound: boundPreviewSessionId === "preview-dispatch",
      is_current: selectedSessionId === "preview-dispatch",
      is_on_server: selectedSessionId === "preview-dispatch",
      message_count: 18,
      updated_at: now - 7 * 60_000,
      last_message: "Observed assistant response after dispatch follow-up",
      last_event: eventHistory.find((item) => item.id === "preview-event-dispatch-observed"),
      tool_name: "dispatch-follow",
      model: "opencode/preview",
      last_role: "assistant",
      last_user_message: "Can you make the runbook dispatch more context aware?",
      last_assistant_message: "I prepared a context handoff and need confirmation to route it.",
      awaiting_user: true,
      idle_ms: 7 * 60_000,
      total_tools: 3,
      completed_tools: 3,
    },
    {
      id: "preview-tests",
      title: "Tauri validation sweep",
      directory: PREVIEW_TAURI_DIR,
      status: "drift",
      phase: "sync-drift",
      status_reason: "Local SQLite session and OpenCode server metadata differ",
      last_signal: "SYNC DIFF",
      next_action_kind: "focus",
      next_action_label: "Align session",
      next_action_reason: "Local SQLite and OpenCode server metadata should be aligned before dispatch",
      link_status: boundPreviewSessionId === "preview-tests" ? "linked" : "directory-diff",
      source: "local+server",
      is_bound: boundPreviewSessionId === "preview-tests",
      is_current: selectedSessionId === "preview-tests",
      is_on_server: true,
      message_count: 11,
      updated_at: now - 18 * 60_000,
      last_message: "Server path differs from local SQLite path",
      model: "opencode/preview",
      last_role: "user",
      last_user_message: "Run validation and tell me if the Tauri side still lines up.",
      last_assistant_message: "The checks pass, but the server path needs alignment.",
      awaiting_user: false,
      idle_ms: 18 * 60_000,
      total_tools: 2,
      completed_tools: 2,
    },
    {
      id: "preview-quiet",
      title: "Quiet dispatch follow-up",
      directory: PREVIEW_PROJECT_DIR,
      status: "quiet",
      phase: "dispatch-quiet",
      status_reason: "Dispatch was accepted but no later OpenCode activity was observed",
      last_signal: "TX QUIET",
      next_action_kind: "retry-dispatch",
      next_action_label: "Retry dispatch",
      next_action_reason: "The previous dispatch did not produce observable OpenCode activity",
      link_status: boundPreviewSessionId === "preview-quiet" ? "linked" : "local-only",
      source: boundPreviewSessionId === "preview-quiet" ? "local+server" : "local",
      is_bound: boundPreviewSessionId === "preview-quiet",
      is_current: selectedSessionId === "preview-quiet",
      is_on_server: selectedSessionId === "preview-quiet",
      message_count: 9,
      updated_at: now - 11 * 60_000,
      last_message: "No OpenCode activity was observed after dispatch follow-up",
      last_event: eventHistory.find((item) => item.id === "preview-event-dispatch-quiet"),
      tool_name: "dispatch-follow",
      model: "opencode/preview",
      last_role: "assistant",
      last_user_message: "Please continue this task in OpenCode.",
      last_assistant_message: "Dispatch was accepted, but no follow-up activity was observed yet.",
      awaiting_user: false,
      idle_ms: 11 * 60_000,
      total_tools: 1,
      completed_tools: 0,
    },
  ];
  const attentionItems: OpenCodeAttentionItem[] = [
    {
      id: "preview-attention-wait",
      priority: "warning",
      kind: "handoff",
      title: "OpenCode handoff route",
      summary: "Assistant is waiting for approval before dispatching the staged handoff",
      session_id: "preview-dispatch",
      tool_name: "cargo check",
      action: "Reply",
      action_kind: "continue",
      timestamp: now - 7 * 60_000,
    },
    {
      id: "preview-attention-drift",
      priority: "warning",
      kind: "session-drift",
      title: "Tauri validation sweep",
      summary: "Local and server session metadata differ",
      session_id: "preview-tests",
      action: "Align session",
      action_kind: "focus",
      timestamp: now - 18 * 60_000,
    },
    {
      id: "preview-attention-quiet",
      priority: "warning",
      kind: "dispatch",
      title: "Quiet dispatch follow-up",
      summary: "No OpenCode activity was observed after dispatch follow-up",
      session_id: "preview-quiet",
      tool_name: "dispatch-follow",
      action: "Retry dispatch",
      action_kind: "retry-dispatch",
      timestamp: now - 11 * 60_000,
    },
  ];
  eventHistory
    .filter((item) => item.event_type === "dispatch.quiet")
    .filter((item) => !previewDispatchQuietResolved(item, eventHistory))
    .forEach((item) => {
      if (attentionItems.some((attention) => attention.session_id === item.session_id && attention.kind === "dispatch")) {
        return;
      }
      attentionItems.push({
        id: `preview-attention-${item.id}`,
        priority: "warning",
        kind: "dispatch",
        title: item.title,
        summary: item.summary,
        session_id: item.session_id,
        tool_name: item.tool_name,
        action: "Retry dispatch",
        action_kind: "retry-dispatch",
        timestamp: item.timestamp,
      });
    });

  return {
    pet_state: {
      progress: workspaceState.progress,
      is_meowing: false,
      mood: "working",
      current_pet_id: "xiaohei",
      last_event: latestEvent,
    },
    sessions,
    bound_session_id: boundPreviewSessionId ?? undefined,
    current_session: selectedSession,
    messages,
    event_history: eventHistory,
    workspace_state: workspaceState,
    session_links: sessionLinks,
    activity_items: activityItems,
    attention_items: attentionItems,
  };
}

export const usePetStore = create<PetStore>((set, get) => ({
  petState: defaultPetState,
  currentSession: null,
  sessions: [],
  boundSessionId: null,
  messages: [],
  lastEvent: null,
  eventHistory: [],
  workspaceState: null,
  sessionLinks: [],
  activityItems: [],
  attentionItems: [],
  officeSync: defaultOfficeSync,
  petConfigs: defaultPreviewPetConfigs(),
  settings: defaultSettings,
  isLoading: false,
  error: null,
  sessionTodos: {},

  fetchPetState: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({
        petState: snapshot.pet_state,
        lastEvent: snapshot.pet_state.last_event ?? snapshot.event_history[0] ?? null,
        eventHistory: snapshot.event_history,
        error: null,
      });
      return;
    }
    try {
      const state = await invoke<PetState>("get_pet_state");
      set({ petState: state, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchCurrentSession: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({
        currentSession: snapshot.current_session ?? null,
        messages: snapshot.messages,
        error: null,
      });
      return;
    }
    try {
      const session = await invoke<Session | null>("get_current_session");
      set({ currentSession: session, error: null });
      if (session) {
        await get().fetchMessages(session.id);
      } else {
        set({ messages: [] });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchSessions: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({ sessions: snapshot.sessions, error: null });
      return;
    }
    try {
      const sessions = await invoke<Session[]>("get_all_sessions");
      set({ sessions, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchBoundSessionId: async () => {
    if (!isTauriRuntime()) {
      set({ boundSessionId: previewBoundSessionId, error: null });
      return;
    }
    try {
      const boundSessionId = await invoke<string | null>("get_bound_session_id");
      set({ boundSessionId, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  bindSession: async (sessionId: string | null) => {
    if (!isTauriRuntime()) {
      previewBoundSessionId = sessionId?.trim() || null;
      const previousSessionId = get().boundSessionId ?? undefined;
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      return previewAlignmentResult(snapshot, sessionId ? "bound" : "follow", previousSessionId);
    }
    try {
      const result = await invoke<OpenCodeAlignmentResult>("bind_opencode_session", { sessionId });
      set({
        workspaceState: result.workspace_state,
        sessionLinks: result.session_links,
        boundSessionId: result.workspace_state.bound_session_id ?? null,
        currentSession: result.workspace_state.session ?? null,
        error: null,
      });
      if (result.workspace_state.session?.id) {
        await get().fetchMessages(result.workspace_state.session.id);
      } else {
        set({ messages: [] });
      }
      await get().fetchSessions();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      await get().fetchAllTodos();
      await get().fetchPetConfigs();
      return result;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  bindPetSession: async (petId: string, sessionId: string | null) => {
    if (!isTauriRuntime()) {
      previewBoundSessionId = sessionId?.trim() || null;
      const previousSessionId = get().petConfigs.find((pet) => pet.id === petId)?.bound_session_id;
      set((state) => ({
        petConfigs: state.petConfigs.map((pet) =>
          pet.id === petId ? { ...pet, bound_session_id: previewBoundSessionId ?? undefined } : pet
        ),
        boundSessionId: previewBoundSessionId,
      }));
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      set((state) => ({
        petConfigs: state.petConfigs.map((pet) =>
          pet.id === petId ? { ...pet, bound_session_id: previewBoundSessionId ?? undefined } : pet
        ),
      }));
      return previewAlignmentResult(snapshot, sessionId ? "bound" : "unbound", previousSessionId);
    }
    try {
      const result = await invoke<OpenCodeAlignmentResult>("bind_pet_session", { petId, sessionId });
      set({
        workspaceState: result.workspace_state,
        sessionLinks: result.session_links,
        boundSessionId: result.workspace_state.bound_session_id ?? null,
        currentSession: result.workspace_state.session ?? null,
        error: null,
      });
      if (result.workspace_state.session?.id) {
        await get().fetchMessages(result.workspace_state.session.id);
      } else {
        set({ messages: [] });
      }
      await get().fetchPetConfigs();
      await get().fetchSessions();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      await get().fetchAllTodos();
      return result;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  createPetSession: async (petId: string, title?: string) => {
    if (!isTauriRuntime()) {
      const previousSessionId = get().petConfigs.find((pet) => pet.id === petId)?.bound_session_id;
      previewBoundSessionId = "preview-frontend";
      set((state) => ({
        petConfigs: state.petConfigs.map((pet) =>
          pet.id === petId ? { ...pet, bound_session_id: previewBoundSessionId ?? undefined } : pet
        ),
        boundSessionId: previewBoundSessionId,
      }));
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      set((state) => ({
        petConfigs: state.petConfigs.map((pet) =>
          pet.id === petId ? { ...pet, bound_session_id: previewBoundSessionId ?? undefined } : pet
        ),
      }));
      return {
        ...previewAlignmentResult(snapshot, "created", previousSessionId),
        action: "created",
        message: `Preview created ${title?.trim() || snapshot.current_session?.title || "new session"} and bound it to this cat`,
      };
    }
    try {
      const result = await invoke<OpenCodeAlignmentResult>("create_pet_session", { petId, title });
      set({
        workspaceState: result.workspace_state,
        sessionLinks: result.session_links,
        boundSessionId: result.workspace_state.bound_session_id ?? null,
        currentSession: result.workspace_state.session ?? null,
        error: null,
      });
      if (result.workspace_state.session?.id) {
        await get().fetchMessages(result.workspace_state.session.id);
      } else {
        set({ messages: [] });
      }
      await get().fetchPetConfigs();
      await get().fetchSessions();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      await get().fetchAllTodos();
      return result;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  bindSharedServerSession: async () => {
    if (!isTauriRuntime()) {
      previewBoundSessionId = get().workspaceState?.server_session?.id
        ?? get().boundSessionId
        ?? previewBoundSessionId;
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      return snapshot.workspace_state;
    }
    try {
      const workspaceState = await invoke<OpenCodeWorkspaceState>("bind_shared_server_session");
      set({
        workspaceState,
        boundSessionId: workspaceState.bound_session_id ?? null,
        currentSession: workspaceState.session ?? null,
        error: null,
      });
      if (workspaceState.session?.id) {
        await get().fetchMessages(workspaceState.session.id);
      } else {
        set({ messages: [] });
      }
      await get().fetchSessions();
      await get().fetchSessionLinks();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      return workspaceState;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  fetchMessages: async (sessionId: string) => {
    if (!isTauriRuntime()) {
      const previousBoundSessionId = previewBoundSessionId;
      previewBoundSessionId = sessionId;
      const snapshot = makePreviewOfficeSnapshot();
      previewBoundSessionId = previousBoundSessionId;
      set({ messages: snapshot.messages, error: null });
      return;
    }
    try {
      const messages = await invoke<Message[]>("get_session_messages", {
        sessionId,
      });
      set({ messages, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshOpenCodeState: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      return;
    }
    try {
      const state = await invoke<PetState>("refresh_opencode_state");
      set({
        petState: state,
        lastEvent: state.last_event ?? null,
        eventHistory: state.last_event
          ? [state.last_event, ...get().eventHistory.filter((item) => item.id !== state.last_event?.id)].slice(0, 10)
          : get().eventHistory,
        error: null,
      });
      await get().fetchWorkspaceState();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshOfficeState: async (source = "manual") => {
    const startedAt = Date.now();
    const sequence = get().officeSync.sequence + 1;
    if (!isTauriRuntime()) {
      const currentBoundSessionId = get().boundSessionId;
      if (currentBoundSessionId) {
        previewBoundSessionId = currentBoundSessionId;
      } else if (get().workspaceState) {
        previewBoundSessionId = null;
      }
      const snapshot = makePreviewOfficeSnapshot(startedAt);
      set((state) => ({
        petState: snapshot.pet_state,
        sessions: snapshot.sessions,
        boundSessionId: snapshot.bound_session_id ?? null,
        currentSession: snapshot.current_session ?? null,
        messages: snapshot.messages,
        lastEvent: snapshot.pet_state.last_event ?? snapshot.event_history[0] ?? state.lastEvent,
        eventHistory: snapshot.event_history.length > 0 ? snapshot.event_history : state.eventHistory,
        workspaceState: snapshot.workspace_state,
        sessionLinks: snapshot.session_links,
        activityItems: snapshot.activity_items,
        attentionItems: snapshot.attention_items,
        isLoading: false,
        officeSync: {
          ...state.officeSync,
          status: "success",
          source: "preview",
          sequence,
          started_at_ms: startedAt,
          finished_at_ms: startedAt,
          duration_ms: 0,
          error: undefined,
        },
        error: null,
      }));
      return snapshot;
    }
    set((state) => ({
      isLoading: true,
      officeSync: {
        ...state.officeSync,
        status: "syncing",
        source,
        sequence,
        started_at_ms: startedAt,
        finished_at_ms: undefined,
        duration_ms: undefined,
        error: undefined,
      },
    }));
    const safetyTimer = setTimeout(() => {
      set((state) => {
        if (state.officeSync.sequence === sequence && state.officeSync.status === "syncing") {
          return {
            isLoading: false,
            officeSync: {
              ...state.officeSync,
              status: "error" as const,
              source,
              sequence,
              started_at_ms: startedAt,
              finished_at_ms: Date.now(),
              duration_ms: Date.now() - startedAt,
              error: "Sync timed out",
            },
          };
        }
        return {};
      });
    }, 12000);
    try {
      const snapshot = await Promise.race([
        invoke<OpenCodeOfficeSnapshot>("get_opencode_office_snapshot"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Sync timed out after 10s")), 10000)),
      ]);
      clearTimeout(safetyTimer);
      const finishedAt = Date.now();
      set((state) => ({
        ...(state.officeSync.sequence === sequence
          ? {
              petState: snapshot.pet_state,
              sessions: snapshot.sessions,
              boundSessionId: snapshot.bound_session_id ?? null,
              currentSession: snapshot.current_session ?? null,
              messages: snapshot.messages,
              lastEvent: snapshot.pet_state.last_event ?? snapshot.event_history[0] ?? state.lastEvent,
              eventHistory: snapshot.event_history.length > 0 ? snapshot.event_history : state.eventHistory,
              workspaceState: snapshot.workspace_state,
              sessionLinks: snapshot.session_links,
              activityItems: snapshot.activity_items,
              attentionItems: snapshot.attention_items,
              isLoading: false,
              error: null,
              officeSync: {
                status: "success" as const,
                source,
                sequence,
                started_at_ms: startedAt,
                finished_at_ms: finishedAt,
                duration_ms: finishedAt - startedAt,
              },
            }
          : {}),
      }));
      return snapshot;
    } catch (err) {
      clearTimeout(safetyTimer);
      const finishedAt = Date.now();
      const error = String(err);
      set((state) => (
        state.officeSync.sequence === sequence
          ? {
              isLoading: false,
              error,
              officeSync: {
                status: "error",
                source,
                sequence,
                started_at_ms: startedAt,
                finished_at_ms: finishedAt,
                duration_ms: finishedAt - startedAt,
                error,
              },
            }
          : {}
      ));
      return null;
    }
  },

  fetchWorkspaceState: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({
        workspaceState: snapshot.workspace_state,
        sessionLinks: snapshot.session_links,
        activityItems: snapshot.activity_items,
        attentionItems: snapshot.attention_items,
        error: null,
      });
      return;
    }
    try {
      const workspaceState = await invoke<OpenCodeWorkspaceState>("get_opencode_workspace_state");
      const sessionLinks = await invoke<OpenCodeSessionLink[]>("get_opencode_session_links");
      const activityItems = await invoke<OpenCodeActivityItem[]>("get_opencode_activity");
      const attentionItems = await invoke<OpenCodeAttentionItem[]>("get_opencode_attention");
      set({
        workspaceState,
        sessionLinks,
        activityItems,
        attentionItems,
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchSessionLinks: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({ sessionLinks: snapshot.session_links, error: null });
      return;
    }
    try {
      const sessionLinks = await invoke<OpenCodeSessionLink[]>("get_opencode_session_links");
      set({ sessionLinks, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchOpenCodeActivity: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({ activityItems: snapshot.activity_items, error: null });
      return;
    }
    try {
      const activityItems = await invoke<OpenCodeActivityItem[]>("get_opencode_activity");
      set({ activityItems, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchOpenCodeAttention: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      set({ attentionItems: snapshot.attention_items, error: null });
      return;
    }
    try {
      const attentionItems = await invoke<OpenCodeAttentionItem[]>("get_opencode_attention");
      set({ attentionItems, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  ensureOpenCodeServer: async () => {
    if (!isTauriRuntime()) {
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      return snapshot.workspace_state;
    }
    try {
      const workspaceState = await invoke<OpenCodeWorkspaceState>("ensure_opencode_server");
      set({ workspaceState, error: null });
      await get().fetchSessions();
      await get().fetchCurrentSession();
      await get().fetchSessionLinks();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      return workspaceState;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  alignOpenCodeSession: async () => {
    if (!isTauriRuntime()) {
      const previousSessionId = get().boundSessionId ?? undefined;
      previewBoundSessionId = get().workspaceState?.server_session?.id
        ?? get().boundSessionId
        ?? previewBoundSessionId;
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      const action = previousSessionId === snapshot.bound_session_id ? "kept" : previousSessionId ? "rebound" : "bound";
      return previewAlignmentResult(snapshot, action, previousSessionId);
    }
    try {
      const result = await invoke<OpenCodeAlignmentResult>("align_opencode_session");
      set({
        workspaceState: result.workspace_state,
        sessionLinks: result.session_links,
        boundSessionId: result.workspace_state.bound_session_id ?? null,
        currentSession: result.workspace_state.session ?? null,
        error: null,
      });
      if (result.workspace_state.session?.id) {
        await get().fetchMessages(result.workspace_state.session.id);
      } else {
        set({ messages: [] });
      }
      await get().fetchSessions();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      return result;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  launchOpenCodeWeb: async (sessionId?: string) => {
    if (!isTauriRuntime()) {
      if (sessionId?.trim()) {
        previewBoundSessionId = sessionId.trim();
      }
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      return previewLaunchResult(snapshot, "web");
    }
    try {
      const result = await invoke<OpenCodeLaunchResult>("launch_opencode_web", { sessionId });
      set({
        workspaceState: result.workspace_state,
        sessionLinks: result.session_links,
        boundSessionId: result.workspace_state.bound_session_id ?? null,
        currentSession: result.workspace_state.session ?? null,
        error: null,
      });
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      return result;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  launchOpenCodeAttach: async (sessionId?: string) => {
    if (!isTauriRuntime()) {
      if (sessionId?.trim()) {
        previewBoundSessionId = sessionId.trim();
      }
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      return previewLaunchResult(snapshot, "attach");
    }
    try {
      const result = await invoke<OpenCodeLaunchResult>("launch_opencode_attach", { sessionId });
      set({
        workspaceState: result.workspace_state,
        sessionLinks: result.session_links,
        boundSessionId: result.workspace_state.bound_session_id ?? null,
        currentSession: result.workspace_state.session ?? null,
        error: null,
      });
      if (result.workspace_state.session?.id) {
        await get().fetchMessages(result.workspace_state.session.id);
      }
      await get().fetchSessions();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      return result;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  setDatabasePath: async (path: string) => {
    if (!isTauriRuntime()) {
      previewBoundSessionId = PREVIEW_DEFAULT_SESSION_ID;
      const snapshot = makePreviewOfficeSnapshot();
      applyPreviewSnapshot(snapshot, set);
      set({
        workspaceState: {
          ...snapshot.workspace_state,
          database_path: path,
        },
        error: null,
      });
      return true;
    }
    try {
      await invoke("set_database_path", { path });
      set({ boundSessionId: null, error: null });
      await get().refreshOpenCodeState();
      await get().fetchBoundSessionId();
      await get().fetchSessions();
      await get().fetchCurrentSession();
      await get().fetchWorkspaceState();
      await get().fetchSessionLinks();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      await get().fetchPetConfigs();
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  findDatabases: async () => {
    if (!isTauriRuntime()) {
      return [PREVIEW_DB_PATH];
    }
    try {
      const databases = await invoke<string[]>("find_opencode_databases");
      return databases;
    } catch (err) {
      set({ error: String(err) });
      return [];
    }
  },

  fetchSettings: async () => {
    if (!isTauriRuntime()) {
      set({ settings: defaultSettings, error: null });
      return;
    }
    try {
      const settings = await invoke<AppSettings>("get_app_settings");
      set({ settings, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateSettings: async (settings: AppSettings) => {
    if (!isTauriRuntime()) {
      set({ settings, error: null });
      await get().fetchWorkspaceState();
      return settings;
    }
    try {
      const saved = await invoke<AppSettings>("update_app_settings", { settings });
      set({ settings: saved, error: null });
      await get().fetchWorkspaceState();
      await get().fetchSessionLinks();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      return saved;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  startListening: () => {
    if (!isTauriRuntime()) return;

    listen<OpenCodeEvent>("opencode-event", (event) => {
      set((state) => ({
        lastEvent: event.payload,
        eventHistory: [
          event.payload,
          ...state.eventHistory.filter((item) => item.id !== event.payload.id),
        ].slice(0, 10),
        petState: {
          ...state.petState,
          last_event: event.payload,
        },
        workspaceState: state.workspaceState
          ? {
              ...state.workspaceState,
              last_event: event.payload,
              progress: {
                ...state.workspaceState.progress,
                session_title: event.payload.title,
                last_message: event.payload.summary,
                current_tool: event.payload.tool_name || state.workspaceState.progress.current_tool,
              },
            }
          : null,
      }));
      scheduleWorkspaceRefresh(() => get().refreshOfficeState("event"));
    });

    listen("database-changed", () => {
      scheduleWorkspaceRefresh(() => get().refreshOfficeState("database"));
    });

    listen<AppSettings>("settings-changed", (event) => {
      set({ settings: event.payload });
      scheduleWorkspaceRefresh(() => get().refreshOfficeState("settings"));
    });

    listen<OpenCodeStreamState>("opencode-stream-state", (event) => {
      set((state) => ({
        workspaceState: state.workspaceState
          ? {
              ...state.workspaceState,
              stream: event.payload,
            }
          : state.workspaceState,
      }));
    });

    listen<Record<string, TodoItem[]>>("todos-changed", (event) => {
      set({ sessionTodos: event.payload });
    });

    listen<OpenCodeSessionSummary>("session-summary-updated", (event) => {
      const summary = event.payload;
      set((state) => ({
        activityItems: state.activityItems.map((item) =>
          item.id === summary.session_id ? { ...item, ai_summary: summary } : item
        ),
      }));
    });
  },

  fetchSessionTodos: async (sessionId: string) => {
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const todos = await invoke<TodoItem[]>("get_session_todos", { sessionId });
      set((state) => ({
        sessionTodos: { ...state.sessionTodos, [sessionId]: todos },
        error: null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchAllTodos: async () => {
    if (!isTauriRuntime()) {
      const now = Date.now();
      const mockTodos: Record<string, TodoItem[]> = {
        "preview-frontend": [
          { session_id: "preview-frontend", content: "Add todo bubble rendering", status: "in_progress", priority: "high", position: 0, time_created: now - 3600000, time_updated: now - 60000 },
          { session_id: "preview-frontend", content: "Wire up session data flow", status: "completed", priority: "high", position: 1, time_created: now - 7200000, time_updated: now - 1800000 },
          { session_id: "preview-frontend", content: "Implement click to open web", status: "pending", priority: "medium", position: 2, time_created: now - 3600000, time_updated: now - 3600000 },
          { session_id: "preview-frontend", content: "Add sleeping cat animation", status: "pending", priority: "low", position: 3, time_created: now - 3600000, time_updated: now - 3600000 },
        ],
        "preview-dispatch": [
          { session_id: "preview-dispatch", content: "Design dispatch handoff UI", status: "completed", priority: "high", position: 0, time_created: now - 7200000, time_updated: now - 3600000 },
          { session_id: "preview-dispatch", content: "Implement context routing", status: "completed", priority: "high", position: 1, time_created: now - 7200000, time_updated: now - 1800000 },
          { session_id: "preview-dispatch", content: "Add observation feedback", status: "pending", priority: "medium", position: 2, time_created: now - 3600000, time_updated: now - 3600000 },
        ],
        "preview-tests": [
          { session_id: "preview-tests", content: "Run Tauri validation tests", status: "in_progress", priority: "high", position: 0, time_created: now - 1800000, time_updated: now - 300000 },
          { session_id: "preview-tests", content: "Fix server path alignment", status: "pending", priority: "high", position: 1, time_created: now - 1800000, time_updated: now - 1800000 },
        ],
      };
      set({ sessionTodos: mockTodos });
      return;
    }
    try {
      const todos = await invoke<Record<string, TodoItem[]>>("get_all_todos");
      set({ sessionTodos: todos, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  fetchPetConfigs: async () => {
    if (!isTauriRuntime()) {
      set({ petConfigs: defaultPreviewPetConfigs(), error: null });
      return;
    }
    try {
      const configs = await invoke<PetConfig[]>("get_pet_configs");
      set({ petConfigs: configs, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  addPetConfig: async (config: PetConfig) => {
    try {
      await invoke("add_pet_config", { config });
      await get().fetchPetConfigs();
      set({ error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removePetConfig: async (configId: string) => {
    try {
      await invoke("remove_pet_config", { configId });
      await get().fetchPetConfigs();
      set({ error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updatePetConfig: async (config: PetConfig) => {
    try {
      await invoke("update_pet_config", { config });
      await get().fetchPetConfigs();
      set({ error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  switchPet: async (configId: string) => {
    if (!isTauriRuntime()) {
      const boundSessionId = get().petConfigs.find((pet) => pet.id === configId)?.bound_session_id ?? null;
      previewBoundSessionId = boundSessionId;
      const snapshot = makePreviewOfficeSnapshot();
      set({
        petState: { ...snapshot.pet_state, current_pet_id: configId },
        boundSessionId,
        currentSession: snapshot.current_session ?? null,
        workspaceState: snapshot.workspace_state,
        sessionLinks: snapshot.session_links,
        activityItems: snapshot.activity_items,
        attentionItems: snapshot.attention_items,
        error: null,
      });
      return;
    }
    try {
      await invoke("switch_pet", { configId });
      await get().fetchPetState();
      await get().fetchSessions();
      await get().fetchCurrentSession();
      await get().fetchBoundSessionId();
      await get().fetchPetConfigs();
      await get().fetchWorkspaceState();
      await get().fetchSessionLinks();
      await get().fetchOpenCodeActivity();
      await get().fetchOpenCodeAttention();
      set({ error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setMeowing: async (isMeowing: boolean) => {
    try {
      await invoke("set_meowing", { isMeowing });
      set((state) => ({
        petState: { ...state.petState, is_meowing: isMeowing },
        error: null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  showWindow: async () => {
    try {
      await invoke("show_window");
    } catch (err) {
      set({ error: String(err) });
    }
  },

  hideWindow: async () => {
    try {
      await invoke("hide_window");
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
