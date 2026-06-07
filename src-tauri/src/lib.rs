use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, State,
};

mod chat;
mod db;
mod events;
mod monitor;
mod opencode_stream;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub directory: Option<String>,
    pub message_count: i32,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cost: f64,
    pub updated_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub parts: String,
    pub model: Option<String>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskProgress {
    pub total_tools: i32,
    pub completed_tools: i32,
    pub current_tool: String,
    pub status: String,
    pub session_title: String,
    pub last_message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PetConfig {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub db_path: String,
    pub image_path: Option<String>,
    pub sound_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PetState {
    pub progress: TaskProgress,
    pub is_meowing: bool,
    pub mood: String,
    pub current_pet_id: Option<String>,
    pub last_event: Option<events::OpenCodeEvent>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub opencode_server_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TodoItem {
    pub session_id: String,
    pub content: String,
    pub status: String,
    pub priority: String,
    pub position: i32,
    pub time_created: i64,
    pub time_updated: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeHealthItem {
    pub level: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeCapabilityItem {
    pub key: String,
    pub label: String,
    pub available: bool,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeNextAction {
    pub kind: String,
    pub label: String,
    pub priority: String,
    pub summary: String,
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeServerSession {
    pub id: String,
    pub title: String,
    pub directory: Option<String>,
    pub agent: Option<String>,
    pub model_provider: Option<String>,
    pub model_id: Option<String>,
    pub message_count: Option<i64>,
    pub updated_at: Option<i64>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeStreamState {
    pub status: String,
    pub detail: String,
    pub connected_at: Option<i64>,
    pub last_event_at: Option<i64>,
    pub event_count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeWorkspaceCheckStage {
    pub key: String,
    pub label: String,
    pub status: String,
    pub detail: String,
    pub source: String,
    pub checked_at_ms: i64,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeWorkspaceState {
    pub server_url: String,
    pub server_status: String,
    pub server_online: bool,
    pub server_detail: String,
    pub server_latency_ms: Option<u128>,
    pub checked_at_ms: i64,
    pub check_duration_ms: u128,
    pub check_stages: Vec<OpenCodeWorkspaceCheckStage>,
    pub database_path: Option<String>,
    pub database_status: String,
    pub database_valid: bool,
    pub watched_paths: Vec<String>,
    pub watch_mode: String,
    pub bound_session_id: Option<String>,
    pub session: Option<Session>,
    pub session_status: String,
    pub session_on_server: Option<bool>,
    pub server_session: Option<OpenCodeServerSession>,
    pub session_directory_matches: Option<bool>,
    pub session_title_matches: Option<bool>,
    pub stream: OpenCodeStreamState,
    pub project_dir: Option<String>,
    pub progress: TaskProgress,
    pub last_event: Option<events::OpenCodeEvent>,
    pub dispatch_ready: bool,
    pub dispatch_blocker: Option<String>,
    pub next_action: OpenCodeNextAction,
    pub capabilities: Vec<OpenCodeCapabilityItem>,
    pub health: Vec<OpenCodeHealthItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeSessionLink {
    pub id: String,
    pub local: Option<Session>,
    pub server: Option<OpenCodeServerSession>,
    pub status: String,
    pub directory_matches: Option<bool>,
    pub title_matches: Option<bool>,
    pub is_bound: bool,
    pub is_current: bool,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeAlignmentResult {
    pub action: String,
    pub message: String,
    pub previous_session_id: Option<String>,
    pub selected_session_id: Option<String>,
    pub tui_selected: bool,
    pub tui_detail: String,
    pub workspace_state: OpenCodeWorkspaceState,
    pub session_links: Vec<OpenCodeSessionLink>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeLaunchResult {
    pub action: String,
    pub status: String,
    pub message: String,
    pub command: String,
    pub server_url: String,
    pub session_id: Option<String>,
    pub project_dir: String,
    pub workspace_state: OpenCodeWorkspaceState,
    pub session_links: Vec<OpenCodeSessionLink>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DispatchObservationReport {
    pub receipt_id: String,
    pub session_id: Option<String>,
    pub title: Option<String>,
    pub dispatch_context: Option<String>,
    pub dispatch_label: Option<String>,
    pub observation: String,
    pub observed_events: u32,
    pub observed_messages: u32,
    pub summary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeOfficeSnapshot {
    pub pet_state: PetState,
    pub sessions: Vec<Session>,
    pub bound_session_id: Option<String>,
    pub current_session: Option<Session>,
    pub messages: Vec<Message>,
    pub event_history: Vec<events::OpenCodeEvent>,
    pub workspace_state: OpenCodeWorkspaceState,
    pub session_links: Vec<OpenCodeSessionLink>,
    pub activity_items: Vec<OpenCodeActivityItem>,
    pub attention_items: Vec<OpenCodeAttentionItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeActivityItem {
    pub id: String,
    pub title: String,
    pub directory: Option<String>,
    pub status: String,
    pub phase: String,
    pub status_reason: String,
    pub last_signal: String,
    pub next_action_kind: String,
    pub next_action_label: String,
    pub next_action_reason: String,
    pub link_status: String,
    pub source: String,
    pub is_bound: bool,
    pub is_current: bool,
    pub is_on_server: bool,
    pub message_count: i64,
    pub updated_at: Option<i64>,
    pub last_message: String,
    pub last_event: Option<events::OpenCodeEvent>,
    pub tool_name: Option<String>,
    pub model: Option<String>,
    pub last_role: Option<String>,
    pub last_user_message: Option<String>,
    pub last_assistant_message: Option<String>,
    pub awaiting_user: bool,
    pub idle_ms: Option<i64>,
    pub total_tools: i32,
    pub completed_tools: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeAttentionItem {
    pub id: String,
    pub priority: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub session_id: Option<String>,
    pub tool_name: Option<String>,
    pub action: String,
    pub action_kind: String,
    pub timestamp: i64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            opencode_server_url: "http://127.0.0.1:4096".to_string(),
        }
    }
}

impl Default for OpenCodeStreamState {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            detail: "OpenCode event stream has not connected yet".to_string(),
            connected_at: None,
            last_event_at: None,
            event_count: 0,
        }
    }
}

pub struct AppState {
    pub db_path: Mutex<Option<PathBuf>>,
    pub bound_session_id: Mutex<Option<String>>,
    pub pet_state: Mutex<PetState>,
    pub event_history: Mutex<Vec<events::OpenCodeEvent>>,
    pub pet_configs: Mutex<Vec<PetConfig>>,
    pub settings: Mutex<AppSettings>,
    pub config_dir: Mutex<PathBuf>,
    pub watched_paths: monitor::WatchedPaths,
    pub stream_state: Mutex<OpenCodeStreamState>,
}

const EVENT_HISTORY_LIMIT: usize = 40;

fn event_history_snapshot(state: &AppState) -> Vec<events::OpenCodeEvent> {
    state.event_history.lock().unwrap().clone()
}

fn push_event_history(state: &AppState, event: events::OpenCodeEvent) {
    let mut history = state.event_history.lock().unwrap();
    history.retain(|item| item.id != event.id);
    history.push(event);
    history.sort_by(|left, right| {
        right
            .timestamp
            .cmp(&left.timestamp)
            .then_with(|| right.id.cmp(&left.id))
    });
    history.truncate(EVENT_HISTORY_LIMIT);
}

pub(crate) fn record_opencode_event(app: &AppHandle, event: &events::OpenCodeEvent) {
    let state = app.state::<AppState>();
    push_event_history(&state, event.clone());
}

fn emit_and_record_opencode_event(app: &AppHandle, event: events::OpenCodeEvent) {
    let state = app.state::<AppState>();
    push_event_history(&state, event.clone());
    {
        let mut pet_state = state.pet_state.lock().unwrap();
        events::apply_live_event(&mut pet_state, &event);
    }
    if let Err(err) = app.emit("opencode-event", event) {
        eprintln!("Failed to emit OpenCode event: {err}");
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn get_watched_session(db_path: &PathBuf, bound_session_id: Option<String>) -> Option<Session> {
    if let Some(session_id) = bound_session_id {
        db::get_session(db_path, &session_id).ok()
    } else {
        db::get_latest_session(db_path).ok()
    }
}

#[tauri::command]
fn get_pet_state(state: State<AppState>) -> PetState {
    state.pet_state.lock().unwrap().clone()
}

#[tauri::command]
fn get_current_session(state: State<AppState>) -> Option<Session> {
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    if let Some(path) = db_path.as_ref() {
        get_watched_session(path, bound_session_id)
    } else {
        None
    }
}

#[tauri::command]
fn get_bound_session_id(state: State<AppState>) -> Option<String> {
    state.bound_session_id.lock().unwrap().clone()
}

#[tauri::command]
fn get_session_messages(session_id: String, state: State<AppState>) -> Vec<Message> {
    let db_path = state.db_path.lock().unwrap();
    if let Some(path) = db_path.as_ref() {
        db::get_messages(path, &session_id).unwrap_or_default()
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn get_all_sessions(state: State<AppState>) -> Vec<Session> {
    let db_path = state.db_path.lock().unwrap();
    if let Some(path) = db_path.as_ref() {
        db::get_all_sessions(path).unwrap_or_default()
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn get_session_todos(session_id: String, state: State<AppState>) -> Vec<TodoItem> {
    let db_path = state.db_path.lock().unwrap();
    if let Some(path) = db_path.as_ref() {
        db::get_session_todos(path, &session_id).unwrap_or_default()
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn get_all_todos(state: State<AppState>) -> std::collections::HashMap<String, Vec<TodoItem>> {
    let db_path = state.db_path.lock().unwrap();
    if let Some(path) = db_path.as_ref() {
        db::get_all_todos(path).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    }
}

#[tauri::command]
fn get_task_progress(state: State<AppState>) -> TaskProgress {
    state.pet_state.lock().unwrap().progress.clone()
}

#[tauri::command]
fn refresh_opencode_state(app: AppHandle) -> PetState {
    refresh_pet_state_from_app(&app);
    app.state::<AppState>().pet_state.lock().unwrap().clone()
}

#[tauri::command]
fn set_database_path(path: String, state: State<AppState>) -> Result<(), String> {
    let candidate_path = PathBuf::from(path);
    if !db::is_valid_database_dir(&candidate_path) {
        return Err("Selected path is not a valid OpenCode database directory".to_string());
    }

    {
        let mut db_path = state.db_path.lock().unwrap();
        *db_path = Some(candidate_path.clone());
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = None;
    }

    // Register the new path with the file watcher if not already watched
    {
        let mut paths = state.watched_paths.lock().unwrap();
        if !paths.contains(&candidate_path) {
            paths.push(candidate_path);
        }
    }

    Ok(())
}

#[tauri::command]
fn bind_session(
    session_id: Option<String>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let normalized_session_id = session_id.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    if let Some(session_id) = normalized_session_id.as_deref() {
        let db_path = state
            .db_path
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "No OpenCode database selected".to_string())?;
        db::get_session(&db_path, session_id).map_err(|_| "Session not found".to_string())?;
    }

    {
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = normalized_session_id;
    }

    refresh_pet_state_from_app(&app);
    Ok(())
}

pub fn refresh_pet_state_from_app(app: &AppHandle) {
    let state = app.state::<AppState>();
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();

    let Some(path) = db_path else {
        return;
    };

    let Some(session) = get_watched_session(&path, bound_session_id) else {
        return;
    };

    let messages = db::get_messages(&path, &session.id).unwrap_or_default();
    let (mut next_state, event) = events::analyze_session(&session, &messages);

    {
        let current_state = state.pet_state.lock().unwrap();
        next_state.current_pet_id = current_state.current_pet_id.clone();
        next_state.is_meowing = current_state.is_meowing;
    }

    {
        let mut current_state = state.pet_state.lock().unwrap();
        *current_state = next_state.clone();
    }

    if let Some(opencode_event) = event {
        push_event_history(&state, opencode_event.clone());
        if let Err(err) = app.emit("opencode-event", opencode_event) {
            eprintln!("Failed to emit OpenCode event: {}", err);
        }
    }
}

#[tauri::command]
fn find_opencode_databases() -> Vec<String> {
    db::find_opencode_database_dirs()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
fn get_app_settings(state: State<AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn update_app_settings(
    settings: AppSettings,
    app: AppHandle,
    state: State<AppState>,
) -> Result<AppSettings, String> {
    let mut next = settings;
    next.opencode_server_url = normalize_opencode_server_url(&next.opencode_server_url)?;

    {
        let mut current = state.settings.lock().unwrap();
        *current = next.clone();
    }

    save_app_settings(&next, &state.config_dir.lock().unwrap())?;
    if let Err(err) = app.emit("settings-changed", &next) {
        eprintln!("Failed to emit settings-changed: {err}");
    }

    Ok(next)
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
}

#[tauri::command]
async fn get_opencode_models() -> Vec<ModelInfo> {
    // Try to fetch live model list from mimo first
    let mimo_models = fetch_mimo_models().await;
    if !mimo_models.is_empty() {
        return mimo_models;
    }
    // Fallback: read static models from opencode.json
    models_from_config()
}

async fn fetch_mimo_models() -> Vec<ModelInfo> {
    let result: Option<Vec<ModelInfo>> = (|| async {
        let config_path = dirs::home_dir()?.join(".config/opencode/opencode.json");
        if !config_path.exists() {
            return None;
        }
        let content = std::fs::read_to_string(config_path).ok()?;
        let json: serde_json::Value = serde_json::from_str(&content).ok()?;
        let mimo = json.get("provider")?.get("mimo")?;
        let api_key = mimo.get("options")?.get("apiKey")?.as_str()?.to_string();
        let base_url = mimo.get("options")?.get("baseURL")?.as_str()?.to_string();
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let out = tokio::process::Command::new("curl")
            .args([
                "-s",
                &url,
                "-H",
                &format!("Authorization: Bearer {api_key}"),
                "--max-time",
                "8",
            ])
            .output()
            .await
            .ok()?;
        let body = String::from_utf8_lossy(&out.stdout).to_string();
        let resp: serde_json::Value = serde_json::from_str(&body).ok()?;
        let models = resp
            .get("data")?
            .as_array()?
            .iter()
            .filter_map(|m| {
                let id = m.get("id")?.as_str()?;
                Some(ModelInfo {
                    id: format!("mimo/{id}"),
                    name: id.to_string(),
                    provider: "Mimo".to_string(),
                })
            })
            .collect();
        Some(models)
    })()
    .await;
    result.unwrap_or_default()
}

fn models_from_config() -> Vec<ModelInfo> {
    let config_path = match dirs::home_dir().map(|h| h.join(".config/opencode/opencode.json")) {
        Some(p) if p.exists() => p,
        _ => return vec![],
    };
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return vec![];
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return vec![];
    };

    let mut models = Vec::new();
    if let Some(providers) = json.get("provider").and_then(|v| v.as_object()) {
        for (pid, pval) in providers {
            let pname = pval.get("name").and_then(|v| v.as_str()).unwrap_or(pid);
            if let Some(mmap) = pval.get("models").and_then(|v| v.as_object()) {
                for (mid, mval) in mmap {
                    let name = mval.get("name").and_then(|v| v.as_str()).unwrap_or(mid);
                    models.push(ModelInfo {
                        id: format!("{pid}/{mid}"),
                        name: name.to_string(),
                        provider: pname.to_string(),
                    });
                }
            }
        }
    }
    models
}

#[tauri::command]
fn get_pet_configs(state: State<AppState>) -> Vec<PetConfig> {
    state.pet_configs.lock().unwrap().clone()
}

#[tauri::command]
fn add_pet_config(config: PetConfig, state: State<AppState>) -> Result<(), String> {
    let mut configs = state.pet_configs.lock().unwrap();
    configs.push(config.clone());
    save_pet_configs(&configs, &state.config_dir.lock().unwrap())
}

#[tauri::command]
fn remove_pet_config(config_id: String, state: State<AppState>) -> Result<(), String> {
    let mut configs = state.pet_configs.lock().unwrap();
    configs.retain(|c| c.id != config_id);
    save_pet_configs(&configs, &state.config_dir.lock().unwrap())
}

#[tauri::command]
fn update_pet_config(config: PetConfig, state: State<AppState>) -> Result<(), String> {
    let mut configs = state.pet_configs.lock().unwrap();
    if let Some(existing) = configs.iter_mut().find(|c| c.id == config.id) {
        *existing = config;
    }
    save_pet_configs(&configs, &state.config_dir.lock().unwrap())
}

#[tauri::command]
fn switch_pet(config_id: String, state: State<AppState>) -> Result<(), String> {
    let configs = state.pet_configs.lock().unwrap();
    if let Some(config) = configs.iter().find(|c| c.id == config_id) {
        let mut db_path = state.db_path.lock().unwrap();
        *db_path = Some(PathBuf::from(&config.db_path));

        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = None;

        let mut pet_state = state.pet_state.lock().unwrap();
        pet_state.current_pet_id = Some(config_id);

        Ok(())
    } else {
        Err("Pet config not found".to_string())
    }
}

#[tauri::command]
fn set_meowing(is_meowing: bool, state: State<AppState>) {
    let mut pet_state = state.pet_state.lock().unwrap();
    pet_state.is_meowing = is_meowing;
}

#[tauri::command]
fn toggle_sound(state: State<AppState>) -> bool {
    let pet_id = state.pet_state.lock().unwrap().current_pet_id.clone();
    if let Some(pet_id) = pet_id {
        let mut configs = state.pet_configs.lock().unwrap();
        if let Some(config) = configs.iter_mut().find(|c| c.id == pet_id) {
            config.sound_enabled = !config.sound_enabled;
            let new_state = config.sound_enabled;
            let config_dir = state.config_dir.lock().unwrap().clone();
            drop(configs);
            let _ = save_pet_configs(&state.pet_configs.lock().unwrap(), &config_dir);
            return new_state;
        }
    }
    false
}

fn save_pet_configs(configs: &[PetConfig], config_dir: &PathBuf) -> Result<(), String> {
    let config_path = config_dir.join("pets.json");
    let json = serde_json::to_string_pretty(configs).map_err(|e| e.to_string())?;
    std::fs::write(config_path, json).map_err(|e| e.to_string())
}

fn load_pet_configs(config_dir: &PathBuf) -> Vec<PetConfig> {
    let config_path = config_dir.join("pets.json");
    if config_path.exists() {
        if let Ok(json) = std::fs::read_to_string(config_path) {
            if let Ok(configs) = serde_json::from_str(&json) {
                return configs;
            }
        }
    }
    Vec::new()
}

fn normalize_opencode_server_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Ok(AppSettings::default().opencode_server_url);
    }

    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    let Some(after_scheme) = with_scheme
        .strip_prefix("http://")
        .or_else(|| with_scheme.strip_prefix("https://"))
    else {
        return Err("OpenCode server URL must start with http:// or https://".to_string());
    };

    let host_port = after_scheme.split('/').next().unwrap_or_default();
    if host_port.is_empty() || !host_port.contains(':') {
        return Err(
            "OpenCode server URL must include a host and port, for example http://127.0.0.1:4096"
                .to_string(),
        );
    }

    let Some((_, port_text)) = host_port.rsplit_once(':') else {
        return Err("OpenCode server URL must include a port".to_string());
    };
    let port = port_text
        .parse::<u16>()
        .map_err(|_| "OpenCode server URL port must be a number from 1 to 65535".to_string())?;
    if port == 0 {
        return Err("OpenCode server URL port must be greater than 0".to_string());
    }

    Ok(with_scheme.trim_end_matches('/').to_string())
}

fn workspace_health(level: &str, code: &str, message: &str) -> OpenCodeHealthItem {
    OpenCodeHealthItem {
        level: level.to_string(),
        code: code.to_string(),
        message: message.to_string(),
    }
}

fn workspace_check_stage(
    key: &str,
    label: &str,
    status: &str,
    detail: &str,
    source: &str,
    checked_at_ms: i64,
    duration_ms: u128,
) -> OpenCodeWorkspaceCheckStage {
    OpenCodeWorkspaceCheckStage {
        key: key.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        detail: detail.to_string(),
        source: source.to_string(),
        checked_at_ms,
        duration_ms,
    }
}

fn workspace_capability(
    key: &str,
    label: &str,
    available: bool,
    status: &str,
    detail: &str,
) -> OpenCodeCapabilityItem {
    OpenCodeCapabilityItem {
        key: key.to_string(),
        label: label.to_string(),
        available,
        status: status.to_string(),
        detail: detail.to_string(),
    }
}

fn dispatch_blocker(
    server_online: bool,
    database_valid: bool,
    session: Option<&Session>,
    session_on_server: Option<bool>,
) -> Option<String> {
    if !server_online {
        return Some("OpenCode server is offline".to_string());
    }
    if !database_valid {
        return Some("OpenCode database is not ready".to_string());
    }
    if session.is_none() {
        return Some("No OpenCode session is selected".to_string());
    }
    if session_on_server != Some(true) {
        return Some("Selected session is not visible on the OpenCode server".to_string());
    }
    None
}

fn nonempty_or(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn workspace_next_action(
    server_online: bool,
    server_detail: &str,
    database_status: &str,
    database_valid: bool,
    session: Option<&Session>,
    session_status: &str,
    session_on_server: Option<bool>,
    session_directory_matches: Option<bool>,
    bound_session_id: Option<&str>,
    progress: &TaskProgress,
    last_event: Option<&events::OpenCodeEvent>,
    stream: &OpenCodeStreamState,
    dispatch_ready: bool,
    dispatch_blocker: Option<&str>,
) -> OpenCodeNextAction {
    let session_id = session.map(|item| item.id.clone());

    if !server_online {
        return OpenCodeNextAction {
            kind: "start".to_string(),
            label: "START".to_string(),
            priority: "critical".to_string(),
            summary: server_detail.to_string(),
            session_id,
        };
    }

    if database_status == "missing" || !database_valid {
        return OpenCodeNextAction {
            kind: "open".to_string(),
            label: "DB".to_string(),
            priority: "warning".to_string(),
            summary: "Select a valid OpenCode database before dispatching".to_string(),
            session_id,
        };
    }

    if session.is_none() {
        return OpenCodeNextAction {
            kind: "match".to_string(),
            label: "MATCH".to_string(),
            priority: "warning".to_string(),
            summary: "Find a shared OpenCode session to watch".to_string(),
            session_id,
        };
    }

    if session_status == "server-mismatch" || session_on_server == Some(false) {
        return OpenCodeNextAction {
            kind: "align".to_string(),
            label: "ALIGN".to_string(),
            priority: "warning".to_string(),
            summary: "Bind a session that exists in both SQLite and the OpenCode server"
                .to_string(),
            session_id,
        };
    }

    if session_directory_matches == Some(false) {
        return OpenCodeNextAction {
            kind: "align".to_string(),
            label: "ALIGN".to_string(),
            priority: "warning".to_string(),
            summary: "Session directory differs between SQLite and the OpenCode server".to_string(),
            session_id,
        };
    }

    if last_event.is_some_and(|event| event.severity.as_str() == "error")
        || progress.status == "error"
    {
        return OpenCodeNextAction {
            kind: "dispatch".to_string(),
            label: "FIX".to_string(),
            priority: "critical".to_string(),
            summary: nonempty_or(
                &progress.last_message,
                "Dispatch a fix prompt to the focused OpenCode session",
            ),
            session_id,
        };
    }

    if last_event.is_some_and(|event| event.event_type.as_str() == "dispatch.quiet") {
        return OpenCodeNextAction {
            kind: "dispatch".to_string(),
            label: "RETRY".to_string(),
            priority: "warning".to_string(),
            summary: "No OpenCode activity was observed after the last dispatch; retry or attach to inspect the session".to_string(),
            session_id,
        };
    }

    if bound_session_id.is_none() {
        return OpenCodeNextAction {
            kind: "match".to_string(),
            label: "MATCH".to_string(),
            priority: "info".to_string(),
            summary: "Pin the office to the shared OpenCode session instead of following latest"
                .to_string(),
            session_id,
        };
    }

    if stream.status != "connected" {
        return OpenCodeNextAction {
            kind: "open".to_string(),
            label: "LIVE".to_string(),
            priority: "info".to_string(),
            summary: stream.detail.clone(),
            session_id,
        };
    }

    if dispatch_ready {
        return OpenCodeNextAction {
            kind: "dispatch".to_string(),
            label: "SEND".to_string(),
            priority: "info".to_string(),
            summary: "Ready to dispatch a prompt into the focused OpenCode session".to_string(),
            session_id,
        };
    }

    OpenCodeNextAction {
        kind: "open".to_string(),
        label: "DESK".to_string(),
        priority: "info".to_string(),
        summary: dispatch_blocker
            .unwrap_or("Open the XiaoHei desk for details")
            .to_string(),
        session_id,
    }
}

fn workspace_capabilities(
    server_online: bool,
    server_url: &str,
    server_detail: &str,
    database_status: &str,
    database_valid: bool,
    session: Option<&Session>,
    session_status: &str,
    session_on_server: Option<bool>,
    dispatch_ready: bool,
    dispatch_blocker: Option<&str>,
) -> Vec<OpenCodeCapabilityItem> {
    let has_session = session.is_some();
    let visible_on_server = session_on_server == Some(true);
    let session_label = session
        .map(|item| item.title.as_str())
        .unwrap_or("No session selected");

    vec![
        workspace_capability(
            "server",
            "Start server",
            !server_online,
            if server_online { "online" } else { "offline" },
            server_detail,
        ),
        workspace_capability(
            "database",
            "Read SQLite",
            database_valid,
            database_status,
            if database_valid {
                "OpenCode SQLite is readable"
            } else {
                "Choose a valid .opencode database"
            },
        ),
        workspace_capability(
            "match",
            "Match session",
            server_online && database_valid,
            session_status,
            "Find the newest session shared by SQLite and the OpenCode server",
        ),
        workspace_capability(
            "align",
            "Align TUI",
            server_online && database_valid && has_session,
            if visible_on_server {
                "visible"
            } else {
                "needs align"
            },
            session_label,
        ),
        workspace_capability(
            "dispatch",
            "Dispatch prompt",
            dispatch_ready,
            if dispatch_ready { "ready" } else { "blocked" },
            dispatch_blocker.unwrap_or("Prompt can be routed into the selected OpenCode session"),
        ),
        workspace_capability(
            "web",
            "Open web",
            server_online,
            if server_online { "ready" } else { "offline" },
            server_url,
        ),
        workspace_capability(
            "attach",
            "Attach TUI",
            server_online && (visible_on_server || has_session),
            if visible_on_server {
                "selected"
            } else {
                "needs align"
            },
            session_label,
        ),
    ]
}

fn server_host_port_for_workspace(server_url: &str) -> Result<String, String> {
    let after_scheme = server_url
        .strip_prefix("http://")
        .or_else(|| server_url.strip_prefix("https://"))
        .ok_or_else(|| "OpenCode server URL must start with http:// or https://".to_string())?;

    let host_port = after_scheme.split('/').next().unwrap_or_default();
    if host_port.is_empty() || !host_port.contains(':') {
        return Err("OpenCode server URL must include host and port".to_string());
    }

    Ok(host_port.to_string())
}

fn server_port_for_workspace(server_url: &str) -> Result<u16, String> {
    let host_port = server_host_port_for_workspace(server_url)?;
    let Some((_, port_text)) = host_port.rsplit_once(':') else {
        return Err("OpenCode server URL must include a port".to_string());
    };

    let port = port_text
        .parse::<u16>()
        .map_err(|_| "OpenCode server URL port must be numeric".to_string())?;
    if port == 0 {
        return Err("OpenCode server URL port must be greater than 0".to_string());
    }
    Ok(port)
}

fn find_opencode_binary() -> String {
    for path in [
        "/opt/homebrew/bin/opencode",
        "/usr/local/bin/opencode",
        "opencode",
    ] {
        if std::path::Path::new(path).exists() || path == "opencode" {
            return path.to_string();
        }
    }
    "opencode".to_string()
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    format!("'{}'", value.replace('\'', "'\\''"))
}

fn applescript_quote(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn shell_command(args: &[String]) -> String {
    args.iter()
        .map(|arg| shell_quote(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn open_external_url(url: &str) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = tokio::process::Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = tokio::process::Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = tokio::process::Command::new("xdg-open");
        command.arg(url);
        command
    };

    let output = command
        .output()
        .await
        .map_err(|err| format!("Could not open `{url}`: {err}"))?;

    if output.status.success() {
        return Ok(format!("open {url}"));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Could not open `{url}`"))
    } else {
        Err(format!("Could not open `{url}`: {stderr}"))
    }
}

async fn open_terminal_command(args: &[String], project_dir: &PathBuf) -> Result<String, String> {
    let command_text = shell_command(args);
    let project_dir_text = project_dir.to_string_lossy().to_string();
    let terminal_command = format!("cd {}; {}", shell_quote(&project_dir_text), command_text);

    #[cfg(target_os = "macos")]
    {
        let escaped = applescript_quote(&terminal_command);
        let output = tokio::process::Command::new("osascript")
            .args([
                "-e",
                &format!("tell application \"Terminal\" to do script \"{escaped}\""),
                "-e",
                "tell application \"Terminal\" to activate",
            ])
            .output()
            .await
            .map_err(|err| format!("Could not open Terminal: {err}"))?;

        if output.status.success() {
            return Ok(command_text);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err("Could not open Terminal for OpenCode attach".to_string())
        } else {
            Err(format!(
                "Could not open Terminal for OpenCode attach: {stderr}"
            ))
        }
    }

    #[cfg(target_os = "windows")]
    {
        let output = tokio::process::Command::new("cmd")
            .current_dir(project_dir)
            .args(["/C", "start", "OpenCode", "cmd", "/K", &terminal_command])
            .output()
            .await
            .map_err(|err| format!("Could not open terminal: {err}"))?;

        if output.status.success() {
            return Ok(command_text);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err("Could not open terminal for OpenCode attach".to_string())
        } else {
            Err(format!(
                "Could not open terminal for OpenCode attach: {stderr}"
            ))
        }
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let terminal_candidates = [
            ("x-terminal-emulator", vec!["-e"]),
            ("gnome-terminal", vec!["--"]),
            ("konsole", vec!["-e"]),
            ("alacritty", vec!["-e"]),
        ];

        for (binary, prefix_args) in terminal_candidates {
            let mut command = tokio::process::Command::new(binary);
            command.current_dir(project_dir);
            for arg in prefix_args {
                command.arg(arg);
            }
            command.args(["sh", "-lc", &terminal_command]);

            if command.spawn().is_ok() {
                return Ok(command_text);
            }
        }

        Err("Could not find a terminal to open OpenCode attach".to_string())
    }
}

fn current_project_dir(state: &AppState) -> PathBuf {
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    let watched_session = db_path
        .as_ref()
        .and_then(|path| get_watched_session(path, bound_session_id));

    watched_session
        .and_then(|session| session.directory.map(PathBuf::from))
        .or_else(|| {
            db_path
                .as_ref()
                .and_then(|path| path.parent().map(PathBuf::from))
        })
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

async fn probe_opencode_server(server_url: &str) -> (bool, String, Option<u128>) {
    let host_port = match server_host_port_for_workspace(server_url) {
        Ok(host_port) => host_port,
        Err(err) => return (false, err, None),
    };

    let start = Instant::now();
    match tokio::time::timeout(
        tokio::time::Duration::from_millis(900),
        tokio::net::TcpStream::connect(&host_port),
    )
    .await
    {
        Ok(Ok(_)) => (
            true,
            format!("OpenCode server is reachable at {server_url}"),
            Some(start.elapsed().as_millis()),
        ),
        Ok(Err(err)) => (
            false,
            format!("OpenCode server is not reachable at {server_url}: {err}"),
            Some(start.elapsed().as_millis()),
        ),
        Err(_) => (
            false,
            format!("OpenCode server timed out at {server_url}"),
            Some(start.elapsed().as_millis()),
        ),
    }
}

async fn ensure_opencode_server_running(state: &AppState, server_url: &str) -> Result<(), String> {
    let host_port = server_host_port_for_workspace(server_url)?;
    let port = server_port_for_workspace(server_url)?;

    if tokio::net::TcpStream::connect(&host_port).await.is_ok() {
        return Ok(());
    }

    let project_dir = current_project_dir(state);
    let opencode = find_opencode_binary();
    tokio::process::Command::new(&opencode)
        .current_dir(project_dir)
        .args(["serve", "--port", &port.to_string()])
        .spawn()
        .map_err(|err| format!("Failed to start `{opencode} serve --port {port}`: {err}"))?;

    for _ in 0..12 {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        if tokio::net::TcpStream::connect(&host_port).await.is_ok() {
            return Ok(());
        }
    }

    Err(format!(
        "OpenCode server did not become reachable at {server_url}"
    ))
}

async fn best_shared_session(
    db_path: &PathBuf,
    server_url: &str,
    preferred_session: Option<Session>,
) -> Result<Option<Session>, String> {
    if let Some(session) = preferred_session {
        if fetch_server_session(server_url, &session.id)
            .await
            .is_some_and(|result| result.is_ok())
        {
            return Ok(Some(session));
        }
    }

    let local_sessions = db::get_all_sessions(db_path)
        .map_err(|err| format!("Could not read local OpenCode sessions: {err}"))?;
    if local_sessions.is_empty() {
        return Ok(None);
    }

    let server_sessions = fetch_server_sessions(server_url).await?;
    let server_ids: HashSet<String> = server_sessions
        .into_iter()
        .map(|session| session.id)
        .collect();

    Ok(local_sessions
        .into_iter()
        .filter(|session| server_ids.contains(&session.id))
        .max_by_key(|session| session.updated_at))
}

fn text_from_message_parts(parts: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(parts) else {
        return parts.trim().to_string();
    };

    let values = match value {
        serde_json::Value::Array(items) => items,
        other => vec![other],
    };

    values
        .into_iter()
        .filter_map(|part| {
            let data = part.get("data").unwrap_or(&part);
            data.get("text")
                .and_then(serde_json::Value::as_str)
                .or_else(|| part.get("text").and_then(serde_json::Value::as_str))
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(ToString::to_string)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn latest_message_summary(messages: &[Message]) -> String {
    messages
        .iter()
        .rev()
        .filter_map(|message| {
            let text = text_from_message_parts(&message.parts);
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        })
        .next()
        .map(|text| {
            let single_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if single_line.chars().count() > 120 {
                single_line.chars().take(117).collect::<String>() + "..."
            } else {
                single_line
            }
        })
        .unwrap_or_else(|| "No readable message yet".to_string())
}

fn latest_role_message_summary(messages: &[Message], role: &str) -> Option<String> {
    messages
        .iter()
        .rev()
        .filter(|message| message.role == role)
        .filter_map(|message| {
            let text = text_from_message_parts(&message.parts);
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        })
        .next()
        .map(|text| {
            let single_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if single_line.chars().count() > 120 {
                single_line.chars().take(117).collect::<String>() + "..."
            } else {
                single_line
            }
        })
}

fn activity_status(
    progress_status: &str,
    link_status: &str,
    event_type: Option<&str>,
    local: Option<&Session>,
    server: Option<&OpenCodeServerSession>,
) -> String {
    if link_status == "local-only" {
        return "local-only".to_string();
    }
    if link_status == "server-only" {
        return "server-only".to_string();
    }
    if link_status == "directory-diff" {
        return "drift".to_string();
    }
    if progress_status == "error" {
        return "error".to_string();
    }
    if progress_status == "working" {
        return "working".to_string();
    }
    if event_type == Some("dispatch.observed") {
        return "followed".to_string();
    }
    if event_type == Some("dispatch.quiet") {
        return "quiet".to_string();
    }
    if progress_status == "completed" {
        return "completed".to_string();
    }

    match (local, server) {
        (Some(_), Some(_)) => "ready".to_string(),
        (Some(_), None) => "local-only".to_string(),
        (None, Some(_)) => "server-only".to_string(),
        (None, None) => "unknown".to_string(),
    }
}

fn compact_signal_text(value: &str, fallback: &str, max_chars: usize) -> String {
    let single_line = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = if single_line.trim().is_empty() {
        fallback.to_string()
    } else {
        single_line
    };

    let mut chars = text.chars();
    let clipped: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{clipped}...")
    } else {
        clipped
    }
}

fn activity_phase(
    status: &str,
    link_status: &str,
    event: Option<&events::OpenCodeEvent>,
    last_role: Option<&str>,
    awaiting_user: bool,
    tool_name: Option<&str>,
    server_present: bool,
    local_present: bool,
) -> String {
    if let Some(event) = event {
        match event.event_type.as_str() {
            "dispatch.observed" => return "dispatch-followed".to_string(),
            "dispatch.quiet" => return "dispatch-quiet".to_string(),
            "dispatch.accepted" => return "dispatch-watching".to_string(),
            "dispatch.failed" => return "dispatch-failed".to_string(),
            "permission.asked" | "user.prompted" => return "awaiting-user".to_string(),
            "tool.started" => {
                return if tool_name.is_some() {
                    "tool-running".to_string()
                } else {
                    "working".to_string()
                }
            }
            "tool.completed" => return "tool-finished".to_string(),
            "runtime.error" | "tool.failed" => return "failed".to_string(),
            "assistant.completed" | "build.success" => return "turn-complete".to_string(),
            _ => {}
        }
    }

    if awaiting_user {
        return "awaiting-user".to_string();
    }
    if link_status == "directory-diff" || status == "drift" {
        return "sync-drift".to_string();
    }
    if local_present && !server_present {
        return "local-only".to_string();
    }
    if server_present && !local_present {
        return "server-only".to_string();
    }
    if tool_name.is_some() || status == "working" {
        return "tool-running".to_string();
    }
    if status == "completed" {
        return "turn-complete".to_string();
    }
    if matches!(last_role, Some("assistant")) {
        return "assistant-last".to_string();
    }
    if matches!(last_role, Some("user")) {
        return "user-last".to_string();
    }
    "ready".to_string()
}

fn activity_status_reason(
    status: &str,
    link_status: &str,
    progress_status: &str,
    event: Option<&events::OpenCodeEvent>,
    last_role: Option<&str>,
    awaiting_user: bool,
    tool_name: Option<&str>,
    idle_ms: Option<i64>,
) -> String {
    if let Some(event) = event {
        match event.event_type.as_str() {
            "dispatch.observed" => {
                return "Dispatch was accepted and later OpenCode activity was observed".to_string()
            }
            "dispatch.quiet" => {
                return "Dispatch was accepted but no later OpenCode activity was observed"
                    .to_string()
            }
            "dispatch.accepted" => {
                return "Prompt reached OpenCode; observation is still pending".to_string()
            }
            "dispatch.failed" => return "Prompt dispatch to OpenCode failed".to_string(),
            "runtime.error" | "tool.failed" => {
                return format!(
                    "OpenCode reported a failure{}",
                    tool_name
                        .map(|tool| format!(" while running {tool}"))
                        .unwrap_or_default(),
                )
            }
            "tool.started" => {
                return format!(
                    "OpenCode is running {}",
                    tool_name.unwrap_or_else(|| {
                        if event.tool_name.trim().is_empty() {
                            "a tool"
                        } else {
                            event.tool_name.as_str()
                        }
                    }),
                )
            }
            "tool.completed" => return "Latest tool completed successfully".to_string(),
            "assistant.completed" | "build.success" => {
                return "Assistant completed the latest turn".to_string()
            }
            "permission.asked" | "user.prompted" => {
                return "OpenCode is waiting for user input or approval".to_string()
            }
            _ => {}
        }
    }

    if awaiting_user {
        return "Latest assistant response appears to be waiting for user input".to_string();
    }

    match status {
        "local-only" => {
            "Session exists locally but is not visible on the configured OpenCode server"
                .to_string()
        }
        "server-only" => {
            "Session exists on the OpenCode server but has not appeared in local SQLite yet"
                .to_string()
        }
        "drift" => "Local SQLite session and OpenCode server metadata differ".to_string(),
        "working" => tool_name
            .map(|tool| format!("OpenCode is actively running {tool}"))
            .unwrap_or_else(|| "OpenCode is actively working in this session".to_string()),
        "error" => "OpenCode reported an error in this session".to_string(),
        "completed" => "The latest assistant turn appears complete".to_string(),
        "ready" | "followed" | "quiet" => format!(
            "Session is {status} after {link_status} link check{}",
            idle_ms
                .map(|idle| format!("; idle for {}s", idle / 1000))
                .unwrap_or_default(),
        ),
        _ if progress_status == "working" => "OpenCode progress status is working".to_string(),
        _ => format!(
            "Latest role is {}; link status is {link_status}",
            last_role.unwrap_or("unknown"),
        ),
    }
}

fn activity_last_signal(
    status: &str,
    event: Option<&events::OpenCodeEvent>,
    last_role: Option<&str>,
    awaiting_user: bool,
    tool_name: Option<&str>,
    last_message: &str,
) -> String {
    if let Some(event) = event {
        match event.event_type.as_str() {
            "dispatch.observed" => return "TX FOLLOW".to_string(),
            "dispatch.quiet" => return "TX QUIET".to_string(),
            "dispatch.accepted" => return "TX SENT".to_string(),
            "dispatch.failed" => return "TX FAIL".to_string(),
            "tool.started" => {
                return format!(
                    "TOOL {}",
                    compact_signal_text(
                        tool_name.unwrap_or_else(|| {
                            if event.tool_name.trim().is_empty() {
                                "running"
                            } else {
                                event.tool_name.as_str()
                            }
                        }),
                        "running",
                        18,
                    )
                )
            }
            "tool.completed" => return "TOOL DONE".to_string(),
            "runtime.error" | "tool.failed" => return "ERROR".to_string(),
            "permission.asked" | "user.prompted" => return "WAIT USER".to_string(),
            "assistant.completed" => return "AI DONE".to_string(),
            "build.success" => return "BUILD OK".to_string(),
            _ => {}
        }
    }

    if awaiting_user {
        return "WAIT USER".to_string();
    }
    if let Some(tool) = tool_name.filter(|tool| !tool.trim().is_empty()) {
        return format!("TOOL {}", compact_signal_text(tool, "running", 18));
    }
    if status == "working" {
        return "WORKING".to_string();
    }
    if status == "server-only" {
        return "SERVER".to_string();
    }
    if status == "local-only" {
        return "LOCAL".to_string();
    }
    if status == "drift" {
        return "SYNC DIFF".to_string();
    }
    if status == "completed" {
        return "DONE".to_string();
    }
    if let Some(role) = last_role.filter(|role| !role.trim().is_empty()) {
        return format!("{} LAST", role.to_uppercase());
    }
    compact_signal_text(last_message, "IDLE", 24).to_uppercase()
}

fn activity_next_action(
    status: &str,
    phase: &str,
    awaiting_user: bool,
    is_on_server: bool,
    source: &str,
    status_reason: &str,
) -> (String, String, String) {
    if status == "error" || phase == "failed" {
        return (
            "fix".to_string(),
            "Fix".to_string(),
            "Ask OpenCode to inspect the latest failure and apply the smallest safe fix".to_string(),
        );
    }
    if phase == "dispatch-quiet" || status == "quiet" {
        return (
            "retry-dispatch".to_string(),
            "Retry dispatch".to_string(),
            "The previous dispatch did not produce observable OpenCode activity".to_string(),
        );
    }
    if phase == "dispatch-watching" {
        return (
            "focus".to_string(),
            "Watch".to_string(),
            "Dispatch was accepted; watch the session for follow-up activity".to_string(),
        );
    }
    if status == "drift" || phase == "sync-drift" {
        return (
            "focus".to_string(),
            "Align session".to_string(),
            "Local SQLite and OpenCode server metadata should be aligned before dispatch".to_string(),
        );
    }
    if status == "local-only" || phase == "local-only" {
        return (
            "attach".to_string(),
            "Attach TUI".to_string(),
            "The session is local-only; attach or align OpenCode before sending more work".to_string(),
        );
    }
    if status == "server-only" || phase == "server-only" {
        return (
            "web".to_string(),
            "Open web".to_string(),
            "The session is visible on the server but not yet in local SQLite".to_string(),
        );
    }
    if awaiting_user || phase == "awaiting-user" {
        return (
            "continue".to_string(),
            "Reply".to_string(),
            "The latest assistant message appears to be waiting for user input".to_string(),
        );
    }
    if status == "working" || phase == "tool-running" {
        return (
            "continue".to_string(),
            "Continue".to_string(),
            "OpenCode is actively working; ask it to continue and report the next concrete step".to_string(),
        );
    }
    if phase == "dispatch-followed" || status == "followed" {
        return (
            "review".to_string(),
            "Review".to_string(),
            "The dispatch has follow-up activity; review the session before sending more work".to_string(),
        );
    }
    if is_on_server && source.contains("local") {
        return (
            "continue".to_string(),
            "Dispatch".to_string(),
            compact_signal_text(status_reason, "Session is ready for the next OpenCode prompt", 120),
        );
    }
    (
        "focus".to_string(),
        "Focus".to_string(),
        compact_signal_text(status_reason, "Focus this session before choosing the next action", 120),
    )
}

fn activity_model(server: Option<&OpenCodeServerSession>, messages: &[Message]) -> Option<String> {
    if let Some(session) = server {
        match (
            session.model_provider.as_deref(),
            session.model_id.as_deref(),
        ) {
            (Some(provider), Some(model)) => return Some(format!("{provider}/{model}")),
            (None, Some(model)) => return Some(model.to_string()),
            (Some(provider), None) => return Some(provider.to_string()),
            _ => {}
        }
    }

    messages
        .iter()
        .rev()
        .find_map(|message| message.model.clone())
}

fn attention_priority_rank(priority: &str) -> i32 {
    match priority {
        "critical" => 0,
        "warning" => 1,
        "active" => 2,
        "info" => 3,
        _ => 4,
    }
}

fn attention_from_event(event: &events::OpenCodeEvent) -> Option<OpenCodeAttentionItem> {
    let (priority, kind, action, action_kind) = match event.event_type.as_str() {
        "runtime.error" | "tool.failed" | "dispatch.failed" => {
            ("critical", "error", "Fix failure", "fix")
        }
        "permission.asked" | "control.attach.opened" => {
            ("warning", "permission", "Open TUI", "attach")
        }
        "dispatch.quiet" => ("warning", "dispatch", "Retry dispatch", "retry-dispatch"),
        "session.retry" => ("warning", "retry", "Watch retry", "focus"),
        "tool.started" => ("active", "tool", "Tool running", "focus"),
        "assistant.started" | "assistant.streaming" | "session.working" | "user.prompted" => {
            ("active", "assistant", "Continue", "continue")
        }
        "tool.completed"
        | "assistant.completed"
        | "session.idle"
        | "build.success"
        | "dispatch.accepted"
        | "dispatch.observed"
        | "control.server.ready"
        | "control.session.aligned"
        | "control.session.bound"
        | "control.session.matched"
        | "control.web.opened" => ("info", "done", "Ready", "review"),
        _ => return None,
    };

    Some(OpenCodeAttentionItem {
        id: format!("event:{}:{}", event.id, event.timestamp),
        priority: priority.to_string(),
        kind: kind.to_string(),
        title: event.title.clone(),
        summary: event.summary.clone(),
        session_id: Some(event.session_id.clone()),
        tool_name: if event.tool_name.trim().is_empty() {
            None
        } else {
            Some(event.tool_name.clone())
        },
        action: action.to_string(),
        action_kind: action_kind.to_string(),
        timestamp: event.timestamp,
    })
}

fn attention_from_activity(item: &OpenCodeActivityItem) -> Option<OpenCodeAttentionItem> {
    let updated_at = item.updated_at.unwrap_or_default();
    let (priority, kind, action, action_kind, summary) = match item.status.as_str() {
        "error" => (
            "critical",
            "error",
            "Fix failure",
            "fix",
            item.last_message.clone(),
        ),
        "drift" => (
            "warning",
            "session-drift",
            "Align session",
            "focus",
            "Local and server session metadata differ".to_string(),
        ),
        "local-only" => (
            "warning",
            "local-only",
            "Attach TUI",
            "attach",
            "Session exists locally but is not visible on the configured OpenCode server"
                .to_string(),
        ),
        "working" => (
            "active",
            "working",
            "Continue",
            "continue",
            item.last_message.clone(),
        ),
        "quiet" => (
            "warning",
            "dispatch",
            "Retry dispatch",
            "retry-dispatch",
            "No OpenCode activity was observed after dispatch follow-up".to_string(),
        ),
        "server-only" => (
            "info",
            "server-only",
            "Open web",
            "web",
            "Server session has not appeared in local SQLite yet".to_string(),
        ),
        "completed" => (
            "info",
            "completed",
            "Ready",
            "review",
            item.last_message.clone(),
        ),
        _ => return None,
    };

    Some(OpenCodeAttentionItem {
        id: format!("activity:{}:{}", item.id, item.status),
        priority: priority.to_string(),
        kind: kind.to_string(),
        title: item.title.clone(),
        summary,
        session_id: Some(item.id.clone()),
        tool_name: item.tool_name.clone(),
        action: action.to_string(),
        action_kind: action_kind.to_string(),
        timestamp: updated_at,
    })
}

fn string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(ToString::to_string)
}

fn integer_field(value: &serde_json::Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|item| {
        item.as_i64()
            .or_else(|| item.as_u64().and_then(|number| i64::try_from(number).ok()))
    })
}

fn parse_server_session(value: &serde_json::Value, fallback_id: &str) -> OpenCodeServerSession {
    let model = value.get("model").unwrap_or(&serde_json::Value::Null);
    OpenCodeServerSession {
        id: string_field(value, "id").unwrap_or_else(|| fallback_id.to_string()),
        title: string_field(value, "title").unwrap_or_else(|| fallback_id.to_string()),
        directory: string_field(value, "directory")
            .or_else(|| string_field(value, "projectDir"))
            .or_else(|| string_field(value, "cwd")),
        agent: string_field(value, "agent"),
        model_provider: string_field(model, "providerID")
            .or_else(|| string_field(model, "provider"))
            .or_else(|| string_field(value, "providerID")),
        model_id: string_field(model, "modelID")
            .or_else(|| string_field(model, "id"))
            .or_else(|| string_field(value, "modelID")),
        message_count: integer_field(value, "message_count")
            .or_else(|| integer_field(value, "messageCount"))
            .or_else(|| integer_field(value, "messages")),
        updated_at: integer_field(value, "updated_at")
            .or_else(|| integer_field(value, "timeUpdated"))
            .or_else(|| {
                value
                    .get("time")
                    .and_then(|time| integer_field(time, "updated"))
            }),
        created_at: integer_field(value, "created_at")
            .or_else(|| integer_field(value, "timeCreated"))
            .or_else(|| {
                value
                    .get("time")
                    .and_then(|time| integer_field(time, "created"))
            }),
    }
}

fn parse_server_session_list(value: &serde_json::Value) -> Vec<OpenCodeServerSession> {
    let items = value
        .as_array()
        .or_else(|| value.get("data").and_then(serde_json::Value::as_array))
        .or_else(|| value.get("sessions").and_then(serde_json::Value::as_array))
        .cloned()
        .unwrap_or_default();

    items
        .iter()
        .filter_map(|item| {
            let id = string_field(item, "id")
                .or_else(|| string_field(item, "sessionID"))
                .or_else(|| string_field(item, "session_id"))?;
            Some(parse_server_session(item, &id))
        })
        .collect()
}

async fn fetch_server_session(
    server_url: &str,
    session_id: &str,
) -> Option<Result<OpenCodeServerSession, String>> {
    let url = format!("{server_url}/session/{session_id}");
    let output = tokio::process::Command::new("curl")
        .args(["-sS", "-w", "\n%{http_code}", "--max-time", "2", &url])
        .output()
        .await
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let Some((body, status)) = stdout.rsplit_once('\n') else {
        return Some(Err(
            "OpenCode session lookup returned an invalid response".to_string()
        ));
    };

    match status.trim() {
        "200" => match serde_json::from_str::<serde_json::Value>(body) {
            Ok(value) => Some(Ok(parse_server_session(&value, session_id))),
            Err(err) => Some(Err(format!(
                "OpenCode session lookup returned invalid JSON: {err}"
            ))),
        },
        "000" => None,
        code => {
            let detail = if stderr.trim().is_empty() {
                body.trim().to_string()
            } else {
                stderr.trim().to_string()
            };
            Some(Err(format!(
                "OpenCode server returned HTTP {code} for session lookup: {detail}"
            )))
        }
    }
}

async fn fetch_server_sessions(server_url: &str) -> Result<Vec<OpenCodeServerSession>, String> {
    let url = format!("{server_url}/session");
    let output = tokio::process::Command::new("curl")
        .args(["-sS", "-w", "\n%{http_code}", "--max-time", "3", &url])
        .output()
        .await
        .map_err(|err| format!("Could not query OpenCode sessions: {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let Some((body, status)) = stdout.rsplit_once('\n') else {
        return Err("OpenCode session list returned an invalid response".to_string());
    };

    if status.trim() != "200" {
        let detail = if stderr.trim().is_empty() {
            body.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Err(format!(
            "OpenCode server returned HTTP {} for session list: {detail}",
            status.trim()
        ));
    }

    let value = serde_json::from_str::<serde_json::Value>(body)
        .map_err(|err| format!("OpenCode session list returned invalid JSON: {err}"))?;
    Ok(parse_server_session_list(&value))
}

async fn select_tui_session(server_url: &str, session_id: &str) -> Result<String, String> {
    let url = format!("{server_url}/tui/select-session");
    let body = serde_json::json!({ "sessionID": session_id }).to_string();
    let output = tokio::process::Command::new("curl")
        .args([
            "-sS",
            "-w",
            "\n%{http_code}",
            "-X",
            "POST",
            &url,
            "-H",
            "Content-Type: application/json",
            "-d",
            &body,
            "--max-time",
            "5",
        ])
        .output()
        .await
        .map_err(|err| format!("Could not select OpenCode TUI session: {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let Some((response_body, status)) = stdout.rsplit_once('\n') else {
        return Err("OpenCode TUI session select returned an invalid response".to_string());
    };

    if status.trim() != "200" {
        let detail = if stderr.trim().is_empty() {
            response_body.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Err(format!(
            "OpenCode TUI session select returned HTTP {}: {detail}",
            status.trim()
        ));
    }

    match serde_json::from_str::<serde_json::Value>(response_body) {
        Ok(serde_json::Value::Bool(true)) => {
            Ok("OpenCode TUI selected the same session".to_string())
        }
        Ok(value) => Err(format!(
            "OpenCode TUI session select returned unexpected response: {value}"
        )),
        Err(err) => Err(format!(
            "OpenCode TUI session select returned invalid JSON: {err}"
        )),
    }
}

fn session_link_status(
    local: Option<&Session>,
    server: Option<&OpenCodeServerSession>,
    directory_matches: Option<bool>,
    title_matches: Option<bool>,
) -> String {
    match (local, server, directory_matches, title_matches) {
        (Some(_), Some(_), Some(false), _) => "directory-diff",
        (Some(_), Some(_), _, Some(false)) => "title-diff",
        (Some(_), Some(_), _, _) => "linked",
        (Some(_), None, _, _) => "local-only",
        (None, Some(_), _, _) => "server-only",
        (None, None, _, _) => "unknown",
    }
    .to_string()
}

fn make_session_link(
    id: String,
    local: Option<Session>,
    server: Option<OpenCodeServerSession>,
    bound_session_id: Option<&str>,
    current_session_id: Option<&str>,
) -> OpenCodeSessionLink {
    let directory_matches = match (
        local.as_ref().and_then(|item| item.directory.as_deref()),
        server.as_ref().and_then(|item| item.directory.as_deref()),
    ) {
        (Some(local_dir), Some(server_dir)) => Some(local_dir == server_dir),
        _ => None,
    };
    let title_matches = match (
        local.as_ref().map(|item| item.title.as_str()),
        server.as_ref().map(|item| item.title.as_str()),
    ) {
        (Some(local_title), Some(server_title)) => Some(local_title == server_title),
        _ => None,
    };
    let status = session_link_status(
        local.as_ref(),
        server.as_ref(),
        directory_matches,
        title_matches,
    );
    let updated_at = local
        .as_ref()
        .map(|item| item.updated_at)
        .or_else(|| server.as_ref().and_then(|item| item.updated_at));

    OpenCodeSessionLink {
        id: id.clone(),
        local,
        server,
        status,
        directory_matches,
        title_matches,
        is_bound: bound_session_id.is_some_and(|session_id| session_id == id),
        is_current: current_session_id.is_some_and(|session_id| session_id == id),
        updated_at,
    }
}

fn sorted_session_ids(
    local_by_id: &std::collections::HashMap<String, Session>,
    server_by_id: &std::collections::HashMap<String, OpenCodeServerSession>,
) -> Vec<String> {
    let mut ids: Vec<String> = local_by_id
        .keys()
        .chain(server_by_id.keys())
        .cloned()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    ids.sort_by(|left, right| {
        let left_time = local_by_id
            .get(left)
            .map(|session| session.updated_at)
            .or_else(|| {
                server_by_id
                    .get(left)
                    .and_then(|session| session.updated_at)
            })
            .unwrap_or(0);
        let right_time = local_by_id
            .get(right)
            .map(|session| session.updated_at)
            .or_else(|| {
                server_by_id
                    .get(right)
                    .and_then(|session| session.updated_at)
            })
            .unwrap_or(0);
        right_time.cmp(&left_time).then_with(|| left.cmp(right))
    });

    ids
}

fn build_session_links(
    local_sessions: Vec<Session>,
    server_sessions: Vec<OpenCodeServerSession>,
    bound_session_id: Option<&str>,
    current_session_id: Option<&str>,
    limit: usize,
) -> Vec<OpenCodeSessionLink> {
    let mut local_by_id: std::collections::HashMap<String, Session> = local_sessions
        .into_iter()
        .map(|session| (session.id.clone(), session))
        .collect();
    let mut server_by_id: std::collections::HashMap<String, OpenCodeServerSession> =
        server_sessions
            .into_iter()
            .map(|session| (session.id.clone(), session))
            .collect();
    let ids = sorted_session_ids(&local_by_id, &server_by_id);

    ids.into_iter()
        .take(limit)
        .map(|id| {
            let local = local_by_id.remove(&id);
            let server = server_by_id.remove(&id);
            make_session_link(id, local, server, bound_session_id, current_session_id)
        })
        .collect()
}

#[tauri::command]
async fn get_opencode_session_links(
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeSessionLink>, String> {
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    let current_session_id = db_path
        .as_ref()
        .and_then(|path| get_watched_session(path, bound_session_id.clone()))
        .map(|session| session.id);
    drop(state);

    let local_sessions = if let Some(path) = db_path.as_ref() {
        db::get_all_sessions(path)
            .map_err(|err| format!("Could not read local OpenCode sessions: {err}"))?
    } else {
        Vec::new()
    };

    let (server_online, server_detail, _) = probe_opencode_server(&server_url).await;
    let server_sessions = if server_online {
        fetch_server_sessions(&server_url).await?
    } else {
        if local_sessions.is_empty() {
            return Err(server_detail);
        }
        Vec::new()
    };

    Ok(build_session_links(
        local_sessions,
        server_sessions,
        bound_session_id.as_deref(),
        current_session_id.as_deref(),
        24,
    ))
}

async fn compute_opencode_activity(
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeActivityItem>, String> {
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    let current_session_id = db_path
        .as_ref()
        .and_then(|path| get_watched_session(path, bound_session_id.clone()))
        .map(|session| session.id);
    let event_history = event_history_snapshot(&state);
    drop(state);

    let local_sessions = if let Some(path) = db_path.as_ref() {
        db::get_all_sessions(path)
            .map_err(|err| format!("Could not read local OpenCode sessions: {err}"))?
    } else {
        Vec::new()
    };

    let (server_online, server_detail, _) = probe_opencode_server(&server_url).await;
    let server_sessions = if server_online {
        fetch_server_sessions(&server_url).await?
    } else if local_sessions.is_empty() {
        return Err(server_detail);
    } else {
        Vec::new()
    };

    Ok(build_activity_items(
        local_sessions,
        server_sessions,
        db_path.as_ref(),
        bound_session_id.as_deref(),
        current_session_id.as_deref(),
        &event_history,
        12,
    ))
}

fn build_activity_items(
    local_sessions: Vec<Session>,
    server_sessions: Vec<OpenCodeServerSession>,
    db_path: Option<&PathBuf>,
    bound_session_id: Option<&str>,
    current_session_id: Option<&str>,
    event_history: &[events::OpenCodeEvent],
    limit: usize,
) -> Vec<OpenCodeActivityItem> {
    let mut local_by_id: std::collections::HashMap<String, Session> = local_sessions
        .into_iter()
        .map(|session| (session.id.clone(), session))
        .collect();
    let mut server_by_id: std::collections::HashMap<String, OpenCodeServerSession> =
        server_sessions
            .into_iter()
            .map(|session| (session.id.clone(), session))
            .collect();
    let ids = sorted_session_ids(&local_by_id, &server_by_id);
    let mut activity = Vec::new();
    let now_ms = chrono::Utc::now().timestamp_millis();
    for id in ids.into_iter().take(limit) {
        let local = local_by_id.remove(&id);
        let server = server_by_id.remove(&id);
        let link = make_session_link(
            id.clone(),
            local.clone(),
            server.clone(),
            bound_session_id,
            current_session_id,
        );
        let messages = match (db_path, local.as_ref()) {
            (Some(path), Some(session)) => db::get_messages(path, &session.id).unwrap_or_default(),
            _ => Vec::new(),
        };
        let (pet_state, session_event) = match local.as_ref() {
            Some(session) => events::analyze_session(session, &messages),
            None => (
                PetState {
                    progress: TaskProgress {
                        total_tools: 0,
                        completed_tools: 0,
                        current_tool: String::new(),
                        status: "idle".to_string(),
                        session_title: server
                            .as_ref()
                            .map(|session| session.title.clone())
                            .unwrap_or_else(|| id.clone()),
                        last_message: "Server session is not in local SQLite yet".to_string(),
                    },
                    is_meowing: false,
                    mood: "sleeping".to_string(),
                    current_pet_id: None,
                    last_event: None,
                },
                None,
            ),
        };
        let matching_live_event = event_history
            .iter()
            .find(|event| event.session_id == id)
            .cloned();
        let event = matching_live_event.or(session_event);
        let message_count = local
            .as_ref()
            .map(|session| i64::from(session.message_count))
            .or_else(|| server.as_ref().and_then(|session| session.message_count))
            .unwrap_or(0);
        let last_message = messages.last();
        let last_role = last_message
            .map(|message| message.role.clone())
            .or_else(|| {
                if server.is_some() {
                    Some("server".to_string())
                } else {
                    None
                }
            });
        let last_user_message = latest_role_message_summary(&messages, "user");
        let last_assistant_message = latest_role_message_summary(&messages, "assistant");
        let updated_at = local
            .as_ref()
            .map(|session| session.updated_at)
            .or_else(|| server.as_ref().and_then(|session| session.updated_at));
        let idle_ms = updated_at.map(|updated_at| now_ms.saturating_sub(updated_at).max(0));
        let title = local
            .as_ref()
            .map(|session| session.title.clone())
            .or_else(|| server.as_ref().map(|session| session.title.clone()))
            .unwrap_or_else(|| id.clone());
        let directory = local
            .as_ref()
            .and_then(|session| session.directory.clone())
            .or_else(|| {
                server
                    .as_ref()
                    .and_then(|session| session.directory.clone())
            });
        let source = match (local.as_ref(), server.as_ref()) {
            (Some(_), Some(_)) => "local+server",
            (Some(_), None) => "local",
            (None, Some(_)) => "server",
            (None, None) => "unknown",
        }
        .to_string();
        let progress_status = event
            .as_ref()
            .map(|event| match event.severity.as_str() {
                "error" => "error",
                "success" => "completed",
                _ => pet_state.progress.status.as_str(),
            })
            .unwrap_or_else(|| pet_state.progress.status.as_str());
        let awaiting_user = matches!(
            event.as_ref().map(|event| event.event_type.as_str()),
            Some("permission.asked" | "user.prompted")
        ) || (matches!(last_role.as_deref(), Some("assistant"))
            && progress_status != "working"
            && progress_status != "error");
        let status = activity_status(
            progress_status,
            &link.status,
            event.as_ref().map(|event| event.event_type.as_str()),
            local.as_ref(),
            server.as_ref(),
        );
        let last_message_text = event
            .as_ref()
            .map(|event| event.summary.clone())
            .filter(|summary| !summary.trim().is_empty())
            .unwrap_or_else(|| latest_message_summary(&messages));
        let tool_name = if pet_state.progress.current_tool.trim().is_empty() {
            None
        } else {
            Some(pet_state.progress.current_tool.clone())
        };
        let status_reason = activity_status_reason(
            &status,
            &link.status,
            progress_status,
            event.as_ref(),
            last_role.as_deref(),
            awaiting_user,
            tool_name.as_deref(),
            idle_ms,
        );
        let last_signal = activity_last_signal(
            &status,
            event.as_ref(),
            last_role.as_deref(),
            awaiting_user,
            tool_name.as_deref(),
            &last_message_text,
        );
        let phase = activity_phase(
            &status,
            &link.status,
            event.as_ref(),
            last_role.as_deref(),
            awaiting_user,
            tool_name.as_deref(),
            server.is_some(),
            local.is_some(),
        );
        let (next_action_kind, next_action_label, next_action_reason) = activity_next_action(
            &status,
            &phase,
            awaiting_user,
            server.is_some(),
            &source,
            &status_reason,
        );

        activity.push(OpenCodeActivityItem {
            id,
            title,
            directory,
            status,
            phase,
            status_reason,
            last_signal,
            next_action_kind,
            next_action_label,
            next_action_reason,
            link_status: link.status,
            source,
            is_bound: link.is_bound,
            is_current: link.is_current,
            is_on_server: server.is_some(),
            message_count,
            updated_at,
            last_message: last_message_text,
            last_event: event,
            tool_name,
            model: activity_model(server.as_ref(), &messages),
            last_role,
            last_user_message,
            last_assistant_message,
            awaiting_user,
            idle_ms,
            total_tools: pet_state.progress.total_tools,
            completed_tools: pet_state.progress.completed_tools,
        });
    }

    activity
}

#[tauri::command]
async fn get_opencode_activity(
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeActivityItem>, String> {
    compute_opencode_activity(state).await
}

#[tauri::command]
async fn get_opencode_attention(
    state: State<'_, AppState>,
) -> Result<Vec<OpenCodeAttentionItem>, String> {
    let event_history = event_history_snapshot(&state);
    let activity = compute_opencode_activity(state).await?;
    Ok(attention_items_from_activity(&event_history, &activity))
}

fn attention_items_from_activity(
    event_history: &[events::OpenCodeEvent],
    activity: &[OpenCodeActivityItem],
) -> Vec<OpenCodeAttentionItem> {
    let mut items: Vec<OpenCodeAttentionItem> = Vec::new();

    items.extend(
        event_history
            .iter()
            .filter(|event| !dispatch_quiet_resolved(event, event_history))
            .filter_map(attention_from_event),
    );

    items.extend(activity.iter().filter_map(attention_from_activity));
    items.sort_by(|left, right| {
        attention_priority_rank(&left.priority)
            .cmp(&attention_priority_rank(&right.priority))
            .then_with(|| right.timestamp.cmp(&left.timestamp))
            .then_with(|| left.title.cmp(&right.title))
    });
    items.dedup_by(|left, right| {
        left.kind == right.kind
            && left.session_id == right.session_id
            && left.tool_name == right.tool_name
    });
    items.truncate(8);

    items
}

fn dispatch_quiet_resolved(
    event: &events::OpenCodeEvent,
    event_history: &[events::OpenCodeEvent],
) -> bool {
    event.event_type == "dispatch.quiet"
        && event_history.iter().any(|candidate| {
            candidate.session_id == event.session_id
                && candidate.event_type == "dispatch.observed"
                && candidate.timestamp > event.timestamp
        })
}

#[tauri::command]
async fn get_opencode_office_snapshot(app: AppHandle) -> Result<OpenCodeOfficeSnapshot, String> {
    refresh_pet_state_from_app(&app);
    let state = app.state::<AppState>();
    let workspace_state = get_opencode_workspace_state(state.clone()).await?;
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    let event_history = event_history_snapshot(&state);
    let sessions = if let Some(path) = db_path.as_ref() {
        db::get_all_sessions(path).unwrap_or_default()
    } else {
        Vec::new()
    };
    let current_session = workspace_state.session.clone();
    let messages = match (db_path.as_ref(), current_session.as_ref()) {
        (Some(path), Some(session)) => db::get_messages(path, &session.id).unwrap_or_default(),
        _ => Vec::new(),
    };
    let server_sessions = if workspace_state.server_online {
        fetch_server_sessions(&workspace_state.server_url).await?
    } else if sessions.is_empty() {
        return Err(workspace_state.server_detail.clone());
    } else {
        Vec::new()
    };
    let current_session_id = current_session.as_ref().map(|session| session.id.as_str());
    let session_links = build_session_links(
        sessions.clone(),
        server_sessions.clone(),
        bound_session_id.as_deref(),
        current_session_id,
        24,
    );
    let activity_items = build_activity_items(
        sessions.clone(),
        server_sessions,
        db_path.as_ref(),
        bound_session_id.as_deref(),
        current_session_id,
        &event_history,
        12,
    );
    let attention_items = attention_items_from_activity(&event_history, &activity_items);
    let pet_state = state.pet_state.lock().unwrap().clone();

    Ok(OpenCodeOfficeSnapshot {
        pet_state,
        sessions,
        bound_session_id,
        current_session,
        messages,
        event_history,
        workspace_state,
        session_links,
        activity_items,
        attention_items,
    })
}

#[tauri::command]
async fn get_opencode_workspace_state(
    state: State<'_, AppState>,
) -> Result<OpenCodeWorkspaceState, String> {
    let check_started = Instant::now();
    let checked_at_ms = chrono::Utc::now().timestamp_millis();
    let snapshot_started = Instant::now();
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    let pet_state = state.pet_state.lock().unwrap().clone();
    let watched_paths = state.watched_paths.lock().unwrap().clone();
    let stream = state.stream_state.lock().unwrap().clone();
    let snapshot_duration_ms = snapshot_started.elapsed().as_millis();
    drop(state);

    let database_started = Instant::now();
    let database_valid = db_path
        .as_ref()
        .map(|path| db::is_valid_database_dir(path))
        .unwrap_or(false);
    let session = db_path
        .as_ref()
        .and_then(|path| get_watched_session(path, bound_session_id.clone()));
    let project_dir = session
        .as_ref()
        .and_then(|session| session.directory.clone())
        .or_else(|| {
            db_path.as_ref().and_then(|path| {
                path.parent()
                    .map(|parent| parent.to_string_lossy().to_string())
            })
        });
    let database_duration_ms = database_started.elapsed().as_millis();

    let server_started = Instant::now();
    let (server_online, server_detail, server_latency_ms) =
        probe_opencode_server(&server_url).await;
    let server_duration_ms = server_started.elapsed().as_millis();
    let server_session_started = Instant::now();
    let server_session_result = if server_online {
        if let Some(session) = session.as_ref() {
            fetch_server_session(&server_url, &session.id).await
        } else {
            None
        }
    } else {
        None
    };
    let server_session_duration_ms = server_session_started.elapsed().as_millis();
    let session_on_server = server_session_result.as_ref().map(|result| result.is_ok());
    let server_session_error = server_session_result
        .as_ref()
        .and_then(|result| result.as_ref().err().cloned());
    let server_session = server_session_result.and_then(Result::ok);
    let session_directory_matches = match (
        session.as_ref().and_then(|item| item.directory.as_deref()),
        server_session
            .as_ref()
            .and_then(|item| item.directory.as_deref()),
    ) {
        (Some(local), Some(remote)) => Some(local == remote),
        _ => None,
    };
    let session_title_matches = match (
        session.as_ref().map(|item| item.title.as_str()),
        server_session.as_ref().map(|item| item.title.as_str()),
    ) {
        (Some(local), Some(remote)) => Some(local == remote),
        _ => None,
    };

    let database_status = if db_path.is_none() {
        "missing"
    } else if database_valid {
        "connected"
    } else {
        "invalid"
    }
    .to_string();

    let watch_mode = if bound_session_id.is_some() {
        "bound"
    } else {
        "latest"
    }
    .to_string();

    let session_status = match (
        session.as_ref(),
        bound_session_id.as_ref(),
        session_on_server,
    ) {
        (None, _, _) => "missing",
        (Some(_), Some(_), Some(false)) => "server-mismatch",
        (Some(_), None, Some(false)) => "server-mismatch",
        (Some(_), Some(_), _) => "bound",
        (Some(_), None, _) => "latest",
    }
    .to_string();

    let server_status = if server_online { "online" } else { "offline" }.to_string();
    let stream_duration_ms = 0;

    let mut health = Vec::new();
    if server_online {
        health.push(workspace_health(
            "success",
            "server.online",
            "OpenCode server is reachable",
        ));
    } else {
        health.push(workspace_health("error", "server.offline", &server_detail));
    }

    match database_status.as_str() {
        "connected" => health.push(workspace_health(
            "success",
            "database.connected",
            "OpenCode database is connected",
        )),
        "invalid" => health.push(workspace_health(
            "error",
            "database.invalid",
            "Selected OpenCode database is invalid",
        )),
        _ => health.push(workspace_health(
            "warning",
            "database.missing",
            "No OpenCode database is selected",
        )),
    }

    match session_status.as_str() {
        "server-mismatch" => health.push(workspace_health(
            "warning",
            "session.server_mismatch",
            server_session_error
                .as_deref()
                .unwrap_or("Watched session exists in SQLite but is not visible on the configured OpenCode server"),
        )),
        "missing" => health.push(workspace_health("warning", "session.missing", "No OpenCode session is available")),
        "bound" => health.push(workspace_health("success", "session.bound", "Watching a bound OpenCode session")),
        _ => health.push(workspace_health("info", "session.latest", "Watching the latest OpenCode session")),
    }

    if session_directory_matches == Some(false) {
        health.push(workspace_health(
            "warning",
            "session.directory_mismatch",
            "SQLite session directory differs from the OpenCode server session directory",
        ));
    }

    if session_title_matches == Some(false) {
        health.push(workspace_health(
            "info",
            "session.title_mismatch",
            "SQLite session title differs from the OpenCode server session title",
        ));
    }

    match stream.status.as_str() {
        "connected" => health.push(workspace_health(
            "success",
            "stream.connected",
            "OpenCode event stream is connected",
        )),
        "connecting" => health.push(workspace_health(
            "info",
            "stream.connecting",
            "OpenCode event stream is connecting",
        )),
        "reconnecting" => health.push(workspace_health(
            "warning",
            "stream.reconnecting",
            &stream.detail,
        )),
        "error" => health.push(workspace_health("warning", "stream.error", &stream.detail)),
        _ => health.push(workspace_health("info", "stream.idle", &stream.detail)),
    }

    let dispatch_blocker = dispatch_blocker(
        server_online,
        database_valid,
        session.as_ref(),
        session_on_server,
    );
    let dispatch_ready = dispatch_blocker.is_none();
    let next_action = workspace_next_action(
        server_online,
        &server_detail,
        &database_status,
        database_valid,
        session.as_ref(),
        &session_status,
        session_on_server,
        session_directory_matches,
        bound_session_id.as_deref(),
        &pet_state.progress,
        pet_state.last_event.as_ref(),
        &stream,
        dispatch_ready,
        dispatch_blocker.as_deref(),
    );
    let capabilities = workspace_capabilities(
        server_online,
        &server_url,
        &server_detail,
        &database_status,
        database_valid,
        session.as_ref(),
        &session_status,
        session_on_server,
        dispatch_ready,
        dispatch_blocker.as_deref(),
    );
    let mut check_stages = vec![
        workspace_check_stage(
            "snapshot",
            "Settings",
            "cached",
            "Read settings, selected database, watched paths, pet progress, and stream cache",
            "app-state",
            checked_at_ms,
            snapshot_duration_ms,
        ),
        workspace_check_stage(
            "database",
            "SQLite",
            &database_status,
            db_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .as_deref()
                .unwrap_or("No OpenCode database selected"),
            if db_path.is_some() {
                "sqlite"
            } else {
                "settings"
            },
            checked_at_ms,
            database_duration_ms,
        ),
        workspace_check_stage(
            "server",
            "Server",
            &server_status,
            &server_detail,
            &server_url,
            checked_at_ms,
            server_duration_ms,
        ),
    ];
    check_stages.push(workspace_check_stage(
        "server-session",
        "Session API",
        match session_on_server {
            Some(true) => "visible",
            Some(false) => "missing",
            None if session.is_some() && !server_online => "skipped",
            None if session.is_some() => "unknown",
            _ => "no-session",
        },
        server_session_error
            .as_deref()
            .or_else(|| server_session.as_ref().map(|item| item.title.as_str()))
            .unwrap_or_else(|| {
                if session.is_some() {
                    "Server session check skipped"
                } else {
                    "No watched session"
                }
            }),
        "opencode-server",
        checked_at_ms,
        server_session_duration_ms,
    ));
    check_stages.push(workspace_check_stage(
        "stream",
        "Stream",
        &stream.status,
        &stream.detail,
        "stream-cache",
        checked_at_ms,
        stream_duration_ms,
    ));
    let check_duration_ms = check_started.elapsed().as_millis();

    Ok(OpenCodeWorkspaceState {
        server_url,
        server_status,
        server_online,
        server_detail,
        server_latency_ms,
        checked_at_ms,
        check_duration_ms,
        check_stages,
        database_path: db_path.map(|path| path.to_string_lossy().to_string()),
        database_status,
        database_valid,
        watched_paths: watched_paths
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        watch_mode,
        bound_session_id,
        session,
        session_status,
        session_on_server,
        server_session,
        session_directory_matches,
        session_title_matches,
        stream,
        project_dir,
        progress: pet_state.progress,
        last_event: pet_state.last_event,
        dispatch_ready,
        dispatch_blocker,
        next_action,
        capabilities,
        health,
    })
}

#[tauri::command]
async fn ensure_opencode_server(app: AppHandle) -> Result<OpenCodeWorkspaceState, String> {
    let state = app.state::<AppState>();
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    ensure_opencode_server_running(&state, &server_url).await?;

    let workspace_state = get_opencode_workspace_state(state).await?;
    emit_control_event(
        &app,
        "control.server.ready",
        "success",
        workspace_state
            .session
            .as_ref()
            .map(|session| session.id.as_str()),
        workspace_state
            .session
            .as_ref()
            .map(|session| session.title.as_str())
            .unwrap_or("OpenCode server"),
        &workspace_state.server_detail,
        "server",
    );
    Ok(workspace_state)
}

async fn shared_session_for_launch(
    db_path: Option<PathBuf>,
    server_url: &str,
    target_session_id: Option<String>,
    watched_session: Option<Session>,
) -> Result<Option<Session>, String> {
    let Some(db_path) = db_path.as_ref() else {
        return Ok(None);
    };

    if let Some(session_id) = target_session_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
    {
        let session = db::get_session(db_path, session_id).map_err(|_| {
            format!("Target OpenCode session `{session_id}` was not found in SQLite")
        })?;
        require_server_session(server_url, &session.id).await?;
        return Ok(Some(session));
    }

    best_shared_session(db_path, server_url, watched_session).await
}

async fn require_server_session(
    server_url: &str,
    session_id: &str,
) -> Result<OpenCodeServerSession, String> {
    match fetch_server_session(server_url, session_id).await {
        Some(Ok(session)) => Ok(session),
        Some(Err(err)) => Err(err),
        None => Err(format!(
            "OpenCode server did not respond while looking up session `{session_id}`"
        )),
    }
}

#[tauri::command]
async fn align_opencode_session(app: AppHandle) -> Result<OpenCodeAlignmentResult, String> {
    let state = app.state::<AppState>();
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let previous_session_id = state.bound_session_id.lock().unwrap().clone();
    let db_path = state
        .db_path
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No OpenCode database selected".to_string())?;

    ensure_opencode_server_running(&state, &server_url).await?;

    let current_local = get_watched_session(&db_path, previous_session_id.clone());
    let Some(selected_session) = best_shared_session(&db_path, &server_url, current_local).await?
    else {
        return Err(
            "No session exists in both SQLite and the configured OpenCode server".to_string(),
        );
    };

    let selected_session_id = Some(selected_session.id.clone());
    {
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = selected_session_id.clone();
    }

    let action = if previous_session_id.as_deref() == selected_session_id.as_deref() {
        "kept"
    } else if previous_session_id.is_some() {
        "rebound"
    } else {
        "bound"
    }
    .to_string();

    let (tui_selected, tui_detail) =
        match select_tui_session(&server_url, &selected_session.id).await {
            Ok(detail) => (true, detail),
            Err(err) => (false, err),
        };

    refresh_pet_state_from_app(&app);
    let workspace_state = get_opencode_workspace_state(state.clone()).await?;
    let session_links = get_opencode_session_links(state).await?;
    let base_message = match action.as_str() {
        "kept" => format!(
            "Session `{}` is already visible on the OpenCode server",
            selected_session.title
        ),
        "rebound" => format!(
            "Rebound to `{}` because it is visible on both SQLite and OpenCode server",
            selected_session.title
        ),
        _ => format!(
            "Bound `{}` as the active OpenCode session",
            selected_session.title
        ),
    };
    let message = if tui_selected {
        format!("{base_message}; TUI selected")
    } else {
        format!("{base_message}; TUI select needs attention")
    };
    emit_control_event(
        &app,
        "control.session.aligned",
        if tui_selected { "success" } else { "warning" },
        Some(&selected_session.id),
        &selected_session.title,
        &message,
        "align",
    );

    Ok(OpenCodeAlignmentResult {
        action,
        message,
        previous_session_id,
        selected_session_id,
        tui_selected,
        tui_detail,
        workspace_state,
        session_links,
    })
}

#[tauri::command]
async fn bind_opencode_session(
    session_id: Option<String>,
    app: AppHandle,
) -> Result<OpenCodeAlignmentResult, String> {
    let state = app.state::<AppState>();
    let previous_session_id = state.bound_session_id.lock().unwrap().clone();
    let normalized_session_id = session_id.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let db_path = state
        .db_path
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No OpenCode database selected".to_string())?;

    let selected_session = if let Some(session_id) = normalized_session_id.as_deref() {
        Some(db::get_session(&db_path, session_id).map_err(|_| "Session not found".to_string())?)
    } else {
        get_watched_session(&db_path, None)
    };

    {
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = normalized_session_id.clone();
    }

    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let server_ready = ensure_opencode_server_running(&state, &server_url).await;
    let (tui_selected, tui_detail) = if let Some(session) = selected_session.as_ref() {
        match server_ready {
            Ok(()) => match require_server_session(&server_url, &session.id).await {
                Ok(_) => match select_tui_session(&server_url, &session.id).await {
                    Ok(detail) => (true, detail),
                    Err(err) => (false, err),
                },
                Err(err) => (false, err),
            },
            Err(err) => (false, err),
        }
    } else {
        (
            false,
            "No local OpenCode session is available for TUI selection".to_string(),
        )
    };

    refresh_pet_state_from_app(&app);
    let workspace_state = get_opencode_workspace_state(state.clone()).await?;
    let session_links = get_opencode_session_links(state).await?;
    let action = if normalized_session_id.is_some() {
        "bound"
    } else {
        "follow"
    }
    .to_string();
    let message = match (
        normalized_session_id.as_ref(),
        selected_session.as_ref(),
        tui_selected,
    ) {
        (Some(_), Some(session), true) => format!("Bound `{}`; TUI selected", session.title),
        (Some(_), Some(session), false) => {
            format!("Bound `{}`; TUI select needs attention", session.title)
        }
        (None, Some(session), true) => {
            format!("Following latest `{}`; TUI selected", session.title)
        }
        (None, Some(session), false) => format!(
            "Following latest `{}`; TUI select needs attention",
            session.title
        ),
        _ => "Session binding updated".to_string(),
    };
    emit_control_event(
        &app,
        "control.session.bound",
        if tui_selected { "success" } else { "warning" },
        selected_session.as_ref().map(|session| session.id.as_str()),
        selected_session
            .as_ref()
            .map(|session| session.title.as_str())
            .unwrap_or("OpenCode session"),
        &message,
        "bind",
    );

    Ok(OpenCodeAlignmentResult {
        action,
        message,
        previous_session_id,
        selected_session_id: selected_session.map(|session| session.id),
        tui_selected,
        tui_detail,
        workspace_state,
        session_links,
    })
}

#[tauri::command]
async fn bind_shared_server_session(app: AppHandle) -> Result<OpenCodeWorkspaceState, String> {
    let state = app.state::<AppState>();
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let db_path = state
        .db_path
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No OpenCode database selected".to_string())?;

    let (server_online, server_detail, _) = probe_opencode_server(&server_url).await;
    if !server_online {
        return Err(server_detail);
    }

    let Some(best_match) = best_shared_session(&db_path, &server_url, None).await? else {
        return Err(
            "No session exists in both SQLite and the configured OpenCode server".to_string(),
        );
    };

    {
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = Some(best_match.id.clone());
    }

    if let Err(err) = select_tui_session(&server_url, &best_match.id).await {
        eprintln!("Failed to select OpenCode TUI session after match: {err}");
    }

    refresh_pet_state_from_app(&app);
    let workspace_state = get_opencode_workspace_state(state).await?;
    emit_control_event(
        &app,
        "control.session.matched",
        "success",
        Some(&best_match.id),
        &best_match.title,
        &format!("Matched shared OpenCode session `{}`", best_match.title),
        "match",
    );
    Ok(workspace_state)
}

#[tauri::command]
async fn launch_opencode_web(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<OpenCodeLaunchResult, String> {
    let state = app.state::<AppState>();
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let mut project_dir = current_project_dir(&state);

    ensure_opencode_server_running(&state, &server_url).await?;
    if let Some(session_id) = session_id.as_deref().filter(|id| !id.trim().is_empty()) {
        let server_session = require_server_session(&server_url, session_id).await?;
        if let Some(directory) = server_session
            .directory
            .as_ref()
            .filter(|directory| !directory.trim().is_empty())
        {
            project_dir = PathBuf::from(directory);
        }
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = Some(session_id.to_string());
    }
    let command = open_external_url(&server_url).await?;
    let workspace_state = get_opencode_workspace_state(state.clone()).await?;
    let session_links = get_opencode_session_links(state).await?;
    let result_session_id = workspace_state
        .session
        .as_ref()
        .map(|session| session.id.as_str());
    let result_title = workspace_state
        .session
        .as_ref()
        .map(|session| session.title.as_str())
        .unwrap_or("OpenCode web");
    let message = format!("Opened OpenCode web console at {server_url}");
    emit_control_event(
        &app,
        "control.web.opened",
        "success",
        result_session_id,
        result_title,
        &message,
        "web",
    );

    Ok(OpenCodeLaunchResult {
        action: "web".to_string(),
        status: "success".to_string(),
        message,
        command,
        server_url,
        session_id: workspace_state
            .session
            .as_ref()
            .map(|session| session.id.clone()),
        project_dir: project_dir.to_string_lossy().to_string(),
        workspace_state,
        session_links,
    })
}

// Width (logical px) of the embedded OpenCode webview shown on the right side of
// the office window. Keep in sync with EMBEDDED_WEBVIEW_WIDTH in src/constants.ts.
// The office window is 1480px wide (see set_window_mode), so the webview fills the
// right half and its left edge sits at EMBEDDED_WEBVIEW_WIDTH.
const EMBEDDED_WEBVIEW_WIDTH: f64 = 740.0;

#[tauri::command]
fn open_embedded_webview(app: AppHandle, url: String, _title: String) -> Result<(), String> {
    let label = "opencode-webview";
    let parsed_url = url
        .parse()
        .map_err(|err| format!("Invalid embedded OpenCode URL: {err}"))?;
    let app_clone = app.clone();
    
    app.run_on_main_thread(move || {
        let init_script = r#"
            try {
                localStorage.setItem('opencode-color-scheme', 'dark');
            } catch(e) {}
        "#;

        if let Some(existing) = app_clone.get_webview(label) {
            let _ = existing.close();
        }
        
        if let Some(window) = app_clone.get_window("main") {
            let webview_builder = tauri::WebviewBuilder::new(label, tauri::WebviewUrl::External(parsed_url))
                .initialization_script(init_script);
            
            let webview = window.add_child(webview_builder, tauri::LogicalPosition::new(EMBEDDED_WEBVIEW_WIDTH, 0.0), tauri::LogicalSize::new(EMBEDDED_WEBVIEW_WIDTH, 820.0));
            
            if let Err(e) = webview {
                eprintln!("Failed to add webview: {}", e);
            }
        }
    })
    .map_err(|e| format!("Failed to create webview: {e}"))?;
    
    Ok(())
}

#[tauri::command]
fn close_embedded_webview(app: AppHandle) -> Result<(), String> {
    let label = "opencode-webview";
    let app_clone = app.clone();
    app.run_on_main_thread(move || {
        if let Some(webview) = app_clone.get_webview(label) {
            let _ = webview.close();
        }
    })
    .map_err(|e| format!("Failed to close embedded webview: {e}"))
}

#[tauri::command]
async fn launch_opencode_attach(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<OpenCodeLaunchResult, String> {
    let state = app.state::<AppState>();
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let mut project_dir = current_project_dir(&state);

    ensure_opencode_server_running(&state, &server_url).await?;

    let db_path = state.db_path.lock().unwrap().clone();
    let bound_session_id = state.bound_session_id.lock().unwrap().clone();
    let watched_session = db_path
        .as_ref()
        .and_then(|path| get_watched_session(path, bound_session_id));
    let shared_session =
        shared_session_for_launch(db_path, &server_url, session_id, watched_session).await?;
    if let Some(session) = shared_session.as_ref() {
        let mut bound_session_id = state.bound_session_id.lock().unwrap();
        *bound_session_id = Some(session.id.clone());
        if let Some(directory) = session
            .directory
            .as_ref()
            .filter(|directory| !directory.trim().is_empty())
        {
            project_dir = PathBuf::from(directory);
        }
    }
    let session_id = shared_session.as_ref().map(|session| session.id.clone());
    let select_detail = if let Some(session_id) = session_id.as_deref() {
        match select_tui_session(&server_url, session_id).await {
            Ok(detail) => Some(Ok(detail)),
            Err(err) => Some(Err(err)),
        }
    } else {
        None
    };

    let mut args = vec![
        find_opencode_binary(),
        "attach".to_string(),
        server_url.clone(),
    ];
    args.push("--dir".to_string());
    args.push(project_dir.to_string_lossy().to_string());
    if let Some(session_id) = session_id.as_ref() {
        args.push("--session".to_string());
        args.push(session_id.clone());
    }

    let command = open_terminal_command(&args, &project_dir).await?;
    refresh_pet_state_from_app(&app);
    let workspace_state = get_opencode_workspace_state(state.clone()).await?;
    let session_links = get_opencode_session_links(state).await?;
    let (status, message) = match (session_id.as_ref(), select_detail) {
        (Some(session_id), Some(Ok(detail))) => (
            "success".to_string(),
            format!("Attached Terminal to OpenCode session {session_id}; {detail}"),
        ),
        (Some(session_id), Some(Err(err))) => (
            "warning".to_string(),
            format!(
                "Attached Terminal to OpenCode session {session_id}; TUI select warning: {err}"
            ),
        ),
        _ => (
            "warning".to_string(),
            "Attached Terminal to OpenCode server without a selected session".to_string(),
        ),
    };
    let result_title = workspace_state
        .session
        .as_ref()
        .map(|session| session.title.as_str())
        .unwrap_or("OpenCode attach");
    emit_control_event(
        &app,
        "control.attach.opened",
        if status == "success" {
            "success"
        } else {
            "warning"
        },
        session_id.as_deref(),
        result_title,
        &message,
        "attach",
    );

    Ok(OpenCodeLaunchResult {
        action: "attach".to_string(),
        status,
        message,
        command,
        server_url,
        session_id,
        project_dir: project_dir.to_string_lossy().to_string(),
        workspace_state,
        session_links,
    })
}

fn save_app_settings(settings: &AppSettings, config_dir: &PathBuf) -> Result<(), String> {
    let config_path = config_dir.join("settings.json");
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(config_path, json).map_err(|e| e.to_string())
}

fn load_app_settings(config_dir: &PathBuf) -> AppSettings {
    let config_path = config_dir.join("settings.json");
    if let Ok(json) = std::fs::read_to_string(config_path) {
        if let Ok(mut settings) = serde_json::from_str::<AppSettings>(&json) {
            settings.opencode_server_url =
                normalize_opencode_server_url(&settings.opencode_server_url)
                    .unwrap_or_else(|_| AppSettings::default().opencode_server_url);
            return settings;
        }
    }

    AppSettings::default()
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "Show Pet", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "Hide Pet", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &hide_i, &settings_i, &quit_i])?;
    let tray_icon = Image::new(include_bytes!("../icons/tray-template.rgba"), 32, 32);

    let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_global_shortcut(app: &AppHandle) {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

    let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyO);

    let app_handle = app.clone();
    let _ = app
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                if let Some(window) = app_handle.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}

#[tauri::command]
fn show_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn recenter_office_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.center();
        let _ = window.set_focus();
    }

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(80));
        let app_for_main = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = app_for_main.get_webview_window("main") {
                let _ = window.center();
                let _ = window.set_focus();
            }
        });
    });
}

#[tauri::command]
fn set_window_mode(mode: String, app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let size = match mode.as_str() {
            "chat" => LogicalSize::new(620.0, 480.0),
            "office" => LogicalSize::new(1480.0, 820.0),
            "picker" => LogicalSize::new(560.0, 640.0),
            "settings" => LogicalSize::new(480.0, 520.0),
            "pets" => LogicalSize::new(480.0, 600.0),
            _ => LogicalSize::new(160.0, 220.0),
        };
        let _ = window.set_size(size);
        let resizable = mode == "chat" || mode == "office";
        let _ = window.set_resizable(resizable);
        if mode == "office" || mode == "picker" {
            recenter_office_window(app);
        }
    }
}

#[tauri::command]
fn set_chat_panel_open(is_open: bool, app: AppHandle) {
    let mode = if is_open { "chat" } else { "compact" };
    set_window_mode(mode.to_string(), app);
}

fn session_title_for_dispatch(request: &chat::ChatRequest, state: &State<'_, AppState>) -> String {
    if let Some(title) = request
        .session_title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
    {
        return title.to_string();
    }

    let Some(session_id) = request
        .session_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
    else {
        return "OpenCode".to_string();
    };
    let db_path = state.db_path.lock().unwrap().clone();
    db_path
        .as_ref()
        .and_then(|path| db::get_session(path, session_id).ok())
        .map(|session| session.title)
        .unwrap_or_else(|| session_id.to_string())
}

fn dispatch_event_from_response(
    request: &chat::ChatRequest,
    response: &chat::ChatResponse,
    title: String,
) -> Option<events::OpenCodeEvent> {
    if !request.delegate_to_opencode {
        return None;
    }

    let session_id = request
        .session_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())?
        .to_string();
    let success = response.provider == "opencode-server"
        && !response.timed_out
        && response.status_code.is_none_or(|code| code < 400)
        && response.stderr.trim().is_empty();
    let timestamp = now_ms();
    let prompt_line = request
        .prompt
        .trim()
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("OpenCode prompt");
    let summary_seed = if prompt_line.chars().count() > 120 {
        format!("{}...", prompt_line.chars().take(117).collect::<String>())
    } else {
        prompt_line.to_string()
    };
    let dispatch_context = request
        .dispatch_context
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("dispatch")
        .trim();
    let dispatch_label = request
        .dispatch_label
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            let trimmed = value.trim();
            if trimmed.chars().count() > 64 {
                format!("{}...", trimmed.chars().take(61).collect::<String>())
            } else {
                trimmed.to_string()
            }
        });
    let dispatch_marker = dispatch_label
        .as_ref()
        .map(|label| format!("{dispatch_context} · {label}"))
        .unwrap_or_else(|| dispatch_context.to_string());

    Some(events::OpenCodeEvent {
        id: format!("dispatch:{}:{}", session_id, timestamp,),
        event_type: if success {
            "dispatch.accepted"
        } else {
            "dispatch.failed"
        }
        .to_string(),
        severity: if success { "success" } else { "error" }.to_string(),
        source: "opencode-pet".to_string(),
        session_id,
        title,
        summary: if success {
            format!("Prompt dispatched to OpenCode ({dispatch_marker}): {summary_seed}")
        } else {
            format!(
                "OpenCode dispatch failed: {}",
                response
                    .stderr
                    .lines()
                    .find(|line| !line.trim().is_empty())
                    .unwrap_or(&response.output)
            )
        },
        tool_name: "dispatch".to_string(),
        timestamp,
    })
}

fn emit_control_event(
    app: &AppHandle,
    event_type: &str,
    severity: &str,
    session_id: Option<&str>,
    title: &str,
    summary: &str,
    tool_name: &str,
) {
    let timestamp = now_ms();
    let session_key = session_id.unwrap_or("workspace");
    emit_and_record_opencode_event(
        app,
        events::OpenCodeEvent {
            id: format!("control:{event_type}:{session_key}:{timestamp}"),
            event_type: event_type.to_string(),
            severity: severity.to_string(),
            source: "opencode-pet".to_string(),
            session_id: session_key.to_string(),
            title: title.to_string(),
            summary: summary.to_string(),
            tool_name: tool_name.to_string(),
            timestamp,
        },
    );
}

fn dispatch_observation_event(report: DispatchObservationReport) -> events::OpenCodeEvent {
    let timestamp = now_ms();
    let session_id = report
        .session_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
        .unwrap_or("workspace")
        .to_string();
    let dispatch_context = report
        .dispatch_context
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("dispatch")
        .trim();
    let dispatch_label = report
        .dispatch_label
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            let trimmed = value.trim();
            if trimmed.chars().count() > 64 {
                format!("{}...", trimmed.chars().take(61).collect::<String>())
            } else {
                trimmed.to_string()
            }
        });
    let dispatch_marker = dispatch_label
        .as_ref()
        .map(|label| format!("{dispatch_context} · {label}"))
        .unwrap_or_else(|| dispatch_context.to_string());
    let observed = report.observation == "observed"
        || report.observed_events > 0
        || report.observed_messages > 0;
    let summary = report
        .summary
        .filter(|summary| !summary.trim().is_empty())
        .unwrap_or_else(|| {
            if observed {
                format!(
                    "OpenCode activity observed after dispatch: {} events, {} messages",
                    report.observed_events, report.observed_messages,
                )
            } else {
                "No OpenCode activity was observed after dispatch follow-up".to_string()
            }
        });
    let summary = format!("({dispatch_marker}) {summary}");

    events::OpenCodeEvent {
        id: format!(
            "dispatch-observation:{}:{session_id}:{timestamp}",
            report.receipt_id
        ),
        event_type: if observed {
            "dispatch.observed"
        } else {
            "dispatch.quiet"
        }
        .to_string(),
        severity: if observed { "success" } else { "warning" }.to_string(),
        source: "opencode-pet".to_string(),
        session_id,
        title: report
            .title
            .unwrap_or_else(|| "OpenCode dispatch".to_string()),
        summary,
        tool_name: "dispatch-follow".to_string(),
        timestamp,
    }
}

#[tauri::command]
async fn record_dispatch_observation(
    report: DispatchObservationReport,
    app: AppHandle,
) -> Result<(), String> {
    emit_and_record_opencode_event(&app, dispatch_observation_event(report));
    Ok(())
}

#[tauri::command]
async fn run_chat_prompt(
    request: chat::ChatRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<chat::ChatResponse, String> {
    let project_dir = current_project_dir(&state);
    let server_url = state.settings.lock().unwrap().opencode_server_url.clone();
    let dispatch_title = session_title_for_dispatch(&request, &state);
    let response = chat::run_prompt(request.clone(), project_dir, server_url).await;
    if let Some(event) = dispatch_event_from_response(&request, &response, dispatch_title) {
        emit_and_record_opencode_event(&app, event);
    }
    Ok(response)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let config_dir = app.path().app_config_dir().unwrap();
            std::fs::create_dir_all(&config_dir).ok();

            let pet_configs = load_pet_configs(&config_dir);
            let settings = load_app_settings(&config_dir);

            let watched_paths: monitor::WatchedPaths = Arc::new(Mutex::new(Vec::new()));

            app.manage(AppState {
                db_path: Mutex::new(None),
                bound_session_id: Mutex::new(None),
                pet_state: Mutex::new(PetState {
                    progress: TaskProgress {
                        total_tools: 0,
                        completed_tools: 0,
                        current_tool: String::new(),
                        status: "idle".to_string(),
                        session_title: String::new(),
                        last_message: String::new(),
                    },
                    is_meowing: false,
                    mood: "sleeping".to_string(),
                    current_pet_id: None,
                    last_event: None,
                }),
                event_history: Mutex::new(Vec::new()),
                pet_configs: Mutex::new(pet_configs),
                settings: Mutex::new(settings),
                config_dir: Mutex::new(config_dir),
                watched_paths: watched_paths.clone(),
                stream_state: Mutex::new(OpenCodeStreamState::default()),
            });

            setup_tray(app.handle())?;
            setup_global_shortcut(app.handle());

            let window = app.get_webview_window("main").unwrap();
            window.set_background_color(None).unwrap();

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    monitor::start_monitor(app_handle, watched_paths);
                }))
                .is_err()
                {
                    eprintln!("OpenCode database monitor stopped after a watcher panic");
                }
            });

            opencode_stream::start(app.handle().clone());

            let todo_poll_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut last_hash: u64 = 0;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    let state = todo_poll_handle.state::<AppState>();
                    let db_path = state.db_path.lock().unwrap().clone();
                    let Some(path) = db_path else { continue; };
                    let todos = db::get_all_todos(&path).unwrap_or_default();
                    let mut hasher = std::collections::hash_map::DefaultHasher::new();
                    use std::hash::{Hash, Hasher};
                    for (session_id, items) in &todos {
                        session_id.hash(&mut hasher);
                        for item in items {
                            item.content.hash(&mut hasher);
                            item.status.hash(&mut hasher);
                            item.position.hash(&mut hasher);
                        }
                    }
                    let current_hash = hasher.finish();
                    if current_hash != last_hash {
                        last_hash = current_hash;
                        if let Err(err) = todo_poll_handle.emit("todos-changed", &todos) {
                            eprintln!("Failed to emit todos-changed: {err}");
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_pet_state,
            get_current_session,
            get_bound_session_id,
            get_session_messages,
            get_all_sessions,
            get_session_todos,
            get_all_todos,
            get_task_progress,
            refresh_opencode_state,
            set_database_path,
            bind_session,
            find_opencode_databases,
            get_app_settings,
            update_app_settings,
            get_opencode_models,
            get_opencode_office_snapshot,
            get_opencode_workspace_state,
            get_opencode_session_links,
            get_opencode_activity,
            get_opencode_attention,
            ensure_opencode_server,
            align_opencode_session,
            bind_opencode_session,
            bind_shared_server_session,
            launch_opencode_web,
            launch_opencode_attach,
            open_embedded_webview,
            close_embedded_webview,
            get_pet_configs,
            add_pet_config,
            remove_pet_config,
            update_pet_config,
            switch_pet,
            set_meowing,
            toggle_sound,
            show_window,
            hide_window,
            set_window_mode,
            set_chat_panel_open,
            run_chat_prompt,
            record_dispatch_observation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
