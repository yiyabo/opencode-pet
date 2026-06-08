export interface Session {
  id: string;
  title: string;
  directory?: string;
  message_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  updated_at: number;
  created_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  parts: string;
  model?: string;
  created_at: number;
  finished_at?: number;
}

export interface TaskProgress {
  total_tools: number;
  completed_tools: number;
  current_tool: string;
  status: "idle" | "working" | "completed" | "error";
  session_title: string;
  last_message: string;
}

export interface OpenCodeEvent {
  id: string;
  event_type: string;
  severity: "info" | "success" | "warning" | "error" | string;
  source: string;
  session_id: string;
  title: string;
  summary: string;
  tool_name: string;
  timestamp: number;
}

export interface PetConfig {
  id: string;
  name: string;
  project_path: string;
  db_path: string;
  image_path?: string;
  bound_session_id?: string;
  coat?: "tuxedo" | "orange" | "calico" | "gray" | string;
  sound_enabled: boolean;
}

export interface PetState {
  progress: TaskProgress;
  is_meowing: boolean;
  mood: "happy" | "working" | "sleeping" | "error" | "curious" | "chatting";
  current_pet_id?: string;
  last_event?: OpenCodeEvent;
}

export interface AppSettings {
  opencode_server_url: string;
}

export type OfficeSyncStatus = "idle" | "syncing" | "success" | "error";

export interface OfficeSyncState {
  status: OfficeSyncStatus;
  source: string;
  sequence: number;
  started_at_ms?: number;
  finished_at_ms?: number;
  duration_ms?: number;
  error?: string;
}

export type WatchMode = "unbound" | "bound" | "latest";

export interface OpenCodeHealthItem {
  level: "info" | "success" | "warning" | "error" | string;
  code: string;
  message: string;
}

export interface OpenCodeCapabilityItem {
  key: string;
  label: string;
  available: boolean;
  status: string;
  detail: string;
}

export interface OpenCodeNextAction {
  kind: "open" | "start" | "align" | "match" | "dispatch" | string;
  label: string;
  priority: "critical" | "warning" | "info" | string;
  summary: string;
  session_id?: string;
}

export interface OpenCodeServerSession {
  id: string;
  title: string;
  directory?: string;
  agent?: string;
  model_provider?: string;
  model_id?: string;
  message_count?: number;
  updated_at?: number;
  created_at?: number;
}

export interface OpenCodeStreamState {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "error" | string;
  detail: string;
  connected_at?: number;
  last_event_at?: number;
  event_count: number;
}

export interface OpenCodeWorkspaceCheckStage {
  key: string;
  label: string;
  status: string;
  detail: string;
  source: string;
  checked_at_ms: number;
  duration_ms: number;
}

export interface OpenCodeWorkspaceState {
  server_url: string;
  server_status: "online" | "offline" | string;
  server_online: boolean;
  server_detail: string;
  server_latency_ms?: number;
  checked_at_ms: number;
  check_duration_ms: number;
  check_stages: OpenCodeWorkspaceCheckStage[];
  database_path?: string;
  database_status: "missing" | "connected" | "invalid" | string;
  database_valid: boolean;
  watched_paths: string[];
  watch_mode: WatchMode | string;
  bound_session_id?: string;
  session?: Session;
  session_status: "missing" | "latest" | "bound" | "server-only" | "server-mismatch" | string;
  session_on_server?: boolean;
  server_session?: OpenCodeServerSession;
  session_directory_matches?: boolean;
  session_title_matches?: boolean;
  stream: OpenCodeStreamState;
  project_dir?: string;
  progress: TaskProgress;
  last_event?: OpenCodeEvent;
  dispatch_ready: boolean;
  dispatch_blocker?: string;
  next_action: OpenCodeNextAction;
  capabilities: OpenCodeCapabilityItem[];
  health: OpenCodeHealthItem[];
}

export interface OpenCodeSessionLink {
  id: string;
  local?: Session;
  server?: OpenCodeServerSession;
  status: "linked" | "directory-diff" | "title-diff" | "local-only" | "server-only" | "unknown" | string;
  directory_matches?: boolean;
  title_matches?: boolean;
  is_bound: boolean;
  is_current: boolean;
  updated_at?: number;
}

export interface OpenCodeAlignmentResult {
  action: "kept" | "rebound" | "bound" | "created" | string;
  message: string;
  previous_session_id?: string;
  selected_session_id?: string;
  tui_selected: boolean;
  tui_detail: string;
  workspace_state: OpenCodeWorkspaceState;
  session_links: OpenCodeSessionLink[];
}

export interface OpenCodeLaunchResult {
  action: "web" | "attach" | string;
  status: "success" | "warning" | "error" | string;
  message: string;
  command: string;
  server_url: string;
  session_id?: string;
  project_dir: string;
  workspace_state: OpenCodeWorkspaceState;
  session_links: OpenCodeSessionLink[];
}

export interface OpenCodeOfficeSnapshot {
  pet_state: PetState;
  sessions: Session[];
  bound_session_id?: string;
  current_session?: Session;
  messages: Message[];
  event_history: OpenCodeEvent[];
  workspace_state: OpenCodeWorkspaceState;
  session_links: OpenCodeSessionLink[];
  activity_items: OpenCodeActivityItem[];
  attention_items: OpenCodeAttentionItem[];
}

export interface OpenCodeActivityItem {
  id: string;
  title: string;
  directory?: string;
  status: "working" | "completed" | "error" | "ready" | "drift" | "local-only" | "server-only" | "unknown" | string;
  phase: string;
  status_reason: string;
  last_signal: string;
  next_action_kind: "fix" | "continue" | "retry-dispatch" | "attach" | "web" | "focus" | "review" | string;
  next_action_label: string;
  next_action_reason: string;
  link_status: string;
  source: string;
  is_bound: boolean;
  is_current: boolean;
  is_on_server: boolean;
  message_count: number;
  updated_at?: number;
  last_message: string;
  last_event?: OpenCodeEvent;
  tool_name?: string;
  model?: string;
  last_role?: string;
  last_user_message?: string;
  last_assistant_message?: string;
  awaiting_user: boolean;
  idle_ms?: number;
  total_tools: number;
  completed_tools: number;
  ai_summary?: OpenCodeSessionSummary;
}

export interface OpenCodeSessionSummary {
  session_id: string;
  fingerprint: string;
  summary: string;
  source: "local-ai" | "rule" | string;
  status: "ready" | "pending" | "fallback" | string;
  provider?: string;
  generated_at_ms: number;
  error?: string;
}

export interface OpenCodeAttentionItem {
  id: string;
  priority: "critical" | "warning" | "active" | "info" | string;
  kind: string;
  title: string;
  summary: string;
  session_id?: string;
  tool_name?: string;
  action: string;
  action_kind: "fix" | "continue" | "retry-dispatch" | "attach" | "web" | "focus" | "review" | string;
  timestamp: number;
}

export type CatSessionDigestPhase =
  | "unbound"
  | "offline"
  | "working"
  | "waiting"
  | "blocked"
  | "completed"
  | "ready";

export interface CatSessionDigest {
  session_id?: string;
  title: string;
  phase: CatSessionDigestPhase;
  headline: string;
  detail: string;
  todo_completed: number;
  todo_total: number;
  active_todo?: string;
  current_tool?: string;
  last_signal?: string;
  next_action_label: string;
  next_action_summary: string;
  updated_at?: number;
}

export interface SessionChoice {
  id: string;
  title: string;
  directory?: string;
  status: string;
  phase: string;
  summary: string;
  last_signal: string;
  is_bound: boolean;
  is_current: boolean;
  is_bindable: boolean;
  is_connected: boolean;
  todo_completed: number;
  todo_total: number;
  active_todo?: string;
  updated_at?: number;
}

export interface ChatRequest {
  prompt: string;
  session_id?: string;
  session_title?: string;
  continue_in_session?: boolean;
  delegate_to_opencode?: boolean;
  event_summary?: string;
  recent_context?: string;
  dispatch_context?: string;
  dispatch_label?: string;
  model?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface ChatAttempt {
  provider: string;
  command: string;
  status_code?: number;
  elapsed_ms: number;
  timed_out: boolean;
  error: string;
}

export interface ChatResponse {
  provider: string;
  command: string;
  output: string;
  stderr: string;
  status_code?: number;
  elapsed_ms: number;
  timed_out: boolean;
  project_dir: string;
  attempts: ChatAttempt[];
}

export interface TodoItem {
  session_id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
  position: number;
  time_created: number;
  time_updated: number;
}
