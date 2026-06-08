use crate::{db, events, AppState, Session};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Listener, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut backoff_secs = 1;

        loop {
            let server_url = current_server_url(&app);
            update_stream_state(
                &app,
                "connecting",
                &format!("Connecting to {server_url}/event"),
                false,
            );
            match stream_once(app.clone(), server_url).await {
                Ok(()) => backoff_secs = 1,
                Err(err) => {
                    eprintln!("OpenCode event stream disconnected: {err}");
                    update_stream_state(&app, "reconnecting", &err, false);
                    tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                    backoff_secs = (backoff_secs * 2).min(10);
                }
            }
        }
    });
}

async fn stream_once(app: AppHandle, server_url: String) -> Result<(), String> {
    let event_url = format!("{server_url}/event");
    let mut child = Command::new("curl")
        .args(["-N", "-sS", &event_url])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("failed to start curl: {err}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "curl stdout was not piped".to_string())?;
    update_stream_state(
        &app,
        "connected",
        &format!("Connected to {event_url}"),
        true,
    );
    let mut lines = BufReader::new(stdout).lines();
    let mut data_lines: Vec<String> = Vec::new();
    let (settings_tx, mut settings_rx) = tokio::sync::mpsc::unbounded_channel::<()>();
    let settings_listener = app.listen("settings-changed", move |_| {
        let _ = settings_tx.send(());
    });

    loop {
        tokio::select! {
            _ = settings_rx.recv() => {
                let _ = child.kill().await;
                app.unlisten(settings_listener);
                update_stream_state(&app, "reconnecting", "Settings changed; reconnecting OpenCode event stream", false);
                return Err("settings changed; reconnecting OpenCode event stream".to_string());
            }
            line = lines.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        let line = line.trim_end_matches('\r');
                        if line.is_empty() {
                            flush_sse_event(&app, &mut data_lines);
                            continue;
                        }

                        if let Some(data) = line.strip_prefix("data:") {
                            data_lines.push(data.trim_start().to_string());
                        }
                    }
                    Ok(None) => {
                        flush_sse_event(&app, &mut data_lines);
                        let status = child
                            .wait()
                            .await
                            .map_err(|err| format!("failed to wait for curl: {err}"))?;
                        app.unlisten(settings_listener);
                        return Err(format!("curl exited with {status}"));
                    }
                    Err(err) => {
                        let _ = child.kill().await;
                        app.unlisten(settings_listener);
                        return Err(format!("failed to read SSE line: {err}"));
                    }
                }
            }
        }
    }
}

fn flush_sse_event(app: &AppHandle, data_lines: &mut Vec<String>) {
    if data_lines.is_empty() {
        return;
    }

    let data = data_lines.join("\n");
    data_lines.clear();

    let Ok(raw) = serde_json::from_str::<Value>(&data) else {
        return;
    };

    handle_server_event(app, &raw);
}

fn handle_server_event(app: &AppHandle, raw: &Value) {
    mark_stream_event(app);
    let Some(session) = watched_session_for_event(app, raw) else {
        return;
    };
    let Some(event) = events::live_event_from_server(raw, &session) else {
        return;
    };

    {
        let state = app.state::<AppState>();
        let active_bound_session_id = state.bound_session_id.lock().unwrap().clone();
        if active_bound_session_id.as_deref() == Some(event.session_id.as_str()) {
            let mut pet_state = state.pet_state.lock().unwrap();
            events::apply_live_event(&mut pet_state, &event);
        }
    }
    crate::record_opencode_event(app, &event);

    if let Err(err) = app.emit("opencode-event", event.clone()) {
        eprintln!("Failed to emit OpenCode live event: {err}");
    }

    if should_refresh_database_views(&event.event_type) {
        if let Err(err) = app.emit(
            "database-changed",
            json!({"changed": true, "source": "opencode-sse"}),
        ) {
            eprintln!("Failed to emit database refresh event: {err}");
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn update_stream_state(app: &AppHandle, status: &str, detail: &str, connected: bool) {
    let state = app.state::<AppState>();
    let stream_state = {
        let mut stream_state = state.stream_state.lock().unwrap();
        stream_state.status = status.to_string();
        stream_state.detail = detail.to_string();
        if connected {
            stream_state.connected_at = Some(now_ms());
        }
        stream_state.clone()
    };
    emit_stream_state(app, &stream_state);
}

fn mark_stream_event(app: &AppHandle) {
    let state = app.state::<AppState>();
    let stream_state = {
        let mut stream_state = state.stream_state.lock().unwrap();
        stream_state.last_event_at = Some(now_ms());
        stream_state.event_count = stream_state.event_count.saturating_add(1);
        if stream_state.status != "connected" {
            stream_state.status = "connected".to_string();
            stream_state.detail = "Receiving OpenCode events".to_string();
            stream_state.connected_at = stream_state.connected_at.or_else(|| Some(now_ms()));
        }
        stream_state.clone()
    };
    emit_stream_state(app, &stream_state);
}

fn emit_stream_state(app: &AppHandle, stream_state: &crate::OpenCodeStreamState) {
    if let Err(err) = app.emit("opencode-stream-state", stream_state.clone()) {
        eprintln!("Failed to emit OpenCode stream state: {err}");
    }
}

fn watched_session_for_event(app: &AppHandle, raw: &Value) -> Option<Session> {
    let event_session_id = events::extract_session_id(raw)?;
    let state = app.state::<AppState>();
    let db_path = state.db_path.lock().unwrap().clone()?;
    let is_bound_to_pet = state
        .pet_configs
        .lock()
        .unwrap()
        .iter()
        .any(|config| config.bound_session_id.as_deref() == Some(event_session_id.as_str()));
    if !is_bound_to_pet {
        return None;
    }

    db::get_session(&db_path, &event_session_id).ok()
}

fn current_server_url(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let server_url = state
        .settings
        .lock()
        .unwrap()
        .opencode_server_url
        .trim_end_matches('/')
        .to_string();
    server_url
}

fn should_refresh_database_views(event_type: &str) -> bool {
    matches!(
        event_type,
        "message.updated"
            | "assistant.completed"
            | "session.updated"
            | "session.idle"
            | "tool.completed"
            | "tool.failed"
            | "runtime.error"
    )
}
