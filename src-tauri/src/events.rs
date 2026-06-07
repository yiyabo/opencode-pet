use crate::{Message, PetState, Session, TaskProgress};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeEvent {
    pub id: String,
    pub event_type: String,
    pub severity: String,
    pub source: String,
    pub session_id: String,
    pub title: String,
    pub summary: String,
    pub tool_name: String,
    pub timestamp: i64,
}

#[derive(Debug, Default)]
struct EventCounters {
    total_tools: i32,
    completed_tools: i32,
    current_tool: String,
    has_error: bool,
    has_cancel: bool,
    has_active_tool: bool,
    last_text: String,
    last_event: Option<OpenCodeEvent>,
}

pub fn analyze_session(
    session: &Session,
    messages: &[Message],
) -> (PetState, Option<OpenCodeEvent>) {
    let mut counters = EventCounters::default();
    let total_messages = messages.len();
    let recent_start = total_messages.saturating_sub(10);

    for (idx, message) in messages.iter().enumerate() {
        let is_recent = idx >= recent_start;
        inspect_message(session, message, &mut counters, is_recent);
    }

    let mut recent_error = false;
    for message in &messages[recent_start..] {
        if message_has_recent_error(message) {
            recent_error = true;
            break;
        }
    }

    let status = if counters.has_active_tool {
        "working"
    } else if recent_error {
        "error"
    } else if counters.completed_tools > 0 || latest_assistant_finished(messages) {
        "completed"
    } else if counters.has_cancel {
        "idle"
    } else {
        "idle"
    };

    let mood = match status {
        "working" => "working",
        "completed" => "happy",
        "error" => "error",
        _ => "sleeping",
    };

    let state = PetState {
        progress: TaskProgress {
            total_tools: counters.total_tools,
            completed_tools: counters.completed_tools,
            current_tool: counters.current_tool,
            status: status.to_string(),
            session_title: session.title.clone(),
            last_message: counters.last_text,
        },
        is_meowing: false,
        mood: mood.to_string(),
        current_pet_id: None,
        last_event: counters.last_event.clone(),
    };

    (state, counters.last_event)
}

fn inspect_message(session: &Session, message: &Message, counters: &mut EventCounters, is_recent: bool) {
    let parsed = serde_json::from_str::<Value>(&message.parts);
    match parsed {
        Ok(Value::Array(parts)) => {
            for part in parts {
                inspect_part(session, message, &part, counters, is_recent);
            }
        }
        Ok(value) => inspect_part(session, message, &value, counters, is_recent),
        Err(_) => inspect_raw_text(session, message, &message.parts, counters, is_recent),
    }
}

fn message_has_recent_error(message: &Message) -> bool {
    let parsed = serde_json::from_str::<Value>(&message.parts);
    match parsed {
        Ok(Value::Array(parts)) => {
            for part in parts {
                if part_has_error(&part) {
                    return true;
                }
            }
            false
        }
        Ok(value) => part_has_error(&value),
        Err(_) => {
            let lower = message.parts.to_lowercase();
            looks_like_error(&lower)
        }
    }
}

fn part_has_error(part: &Value) -> bool {
    let part_type = part.get("type").and_then(Value::as_str).unwrap_or_default();
    let data = part.get("data").unwrap_or(part);
    
    if part_type == "text" {
        if let Some(text) = data.get("text").and_then(Value::as_str) {
            let lower = text.to_lowercase();
            return looks_like_error(&lower);
        }
    }
    
    if part_type.contains("error") || part_type.contains("fail") {
        return true;
    }
    
    false
}

fn inspect_part(session: &Session, message: &Message, part: &Value, counters: &mut EventCounters, is_recent: bool) {
    let part_type = part.get("type").and_then(Value::as_str).unwrap_or_default();
    let data = part.get("data").unwrap_or(part);
    let lower_part = part.to_string().to_lowercase();

    if part_type == "text" {
        if let Some(text) = data.get("text").and_then(Value::as_str) {
            remember_text(text, counters);
            inspect_raw_text(session, message, text, counters, is_recent);
        }
    }

    if part_type.contains("tool_call")
        || lower_part.contains("tool_call")
        || lower_part.contains("toolcall")
    {
        counters.total_tools += 1;
        counters.has_active_tool = message.finished_at.is_none();
        counters.current_tool = extract_tool_name(part).unwrap_or_else(|| "tool".to_string());
        if is_recent {
            counters.last_event = Some(make_event(
                session,
                message,
                "tool.started",
                "info",
                &format!("Running {}", counters.current_tool),
                &counters.current_tool,
            ));
        }
    }

    if part_type.contains("tool_result")
        || lower_part.contains("tool_result")
        || lower_part.contains("toolresult")
    {
        counters.completed_tools += 1;
        counters.has_active_tool = false;
        let tool_name = extract_tool_name(part).unwrap_or_else(|| counters.current_tool.clone());
        if is_recent {
            counters.last_event = Some(make_event(
                session,
                message,
                "tool.completed",
                "success",
                &format!("Finished {}", fallback_tool_name(&tool_name)),
                &tool_name,
            ));
        }
    }

    if part_type == "finish" {
        let reason = data
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match reason {
            "canceled" => {
                counters.has_cancel = true;
                counters.has_active_tool = false;
                if is_recent {
                    counters.last_event = Some(make_event(
                        session,
                        message,
                        "session.canceled",
                        "warning",
                        "OpenCode session canceled",
                        "",
                    ));
                }
            }
            "end_turn" | "stop" => {
                counters.has_active_tool = false;
                if is_recent {
                    counters.last_event = Some(make_event(
                        session,
                        message,
                        "assistant.completed",
                        "success",
                        "Assistant turn completed",
                        "",
                    ));
                }
            }
            _ => {}
        }
    }

    if looks_like_error(&lower_part) {
        counters.has_error = true;
        counters.has_active_tool = false;
        if is_recent {
            counters.last_event = Some(make_event(
                session,
                message,
                "runtime.error",
                "error",
                "OpenCode reported an error",
                &counters.current_tool,
            ));
        }
    }
}

fn inspect_raw_text(
    session: &Session,
    message: &Message,
    text: &str,
    counters: &mut EventCounters,
    is_recent: bool,
) {
    let lower = text.to_lowercase();
    if looks_like_error(&lower) {
        counters.has_error = true;
        counters.has_active_tool = false;
        if is_recent {
            counters.last_event = Some(make_event(
                session,
                message,
                "runtime.error",
                "error",
                &summary_text(text, "OpenCode reported an error"),
                &counters.current_tool,
            ));
        }
    } else if lower.contains("build success")
        || lower.contains("build succeeded")
        || lower.contains("compiled successfully")
        || lower.contains("finished `release`")
        || lower.contains("finished `dev`")
        || lower.contains("✓ built")
    {
        if is_recent {
            counters.last_event = Some(make_event(
                session,
                message,
                "build.success",
                "success",
                &summary_text(text, "Build succeeded"),
                &counters.current_tool,
            ));
        }
    }
}

fn extract_tool_name(part: &Value) -> Option<String> {
    let keys = ["name", "tool", "tool_name", "toolName", "command"];
    for key in keys {
        if let Some(value) = find_string_key(part, key) {
            return Some(value);
        }
    }
    None
}

fn find_string_key(value: &Value, key: &str) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(found) = map.get(key).and_then(Value::as_str) {
                return Some(found.to_string());
            }
            for nested in map.values() {
                if let Some(found) = find_string_key(nested, key) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items.iter().find_map(|item| find_string_key(item, key)),
        _ => None,
    }
}

fn remember_text(text: &str, counters: &mut EventCounters) {
    let trimmed = text.trim();
    if !trimmed.is_empty() {
        counters.last_text = summary_text(trimmed, trimmed);
    }
}

fn latest_assistant_finished(messages: &[Message]) -> bool {
    messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .and_then(|message| message.finished_at)
        .is_some()
}

fn looks_like_error(lower: &str) -> bool {
    (lower.contains("error:") || lower.contains("error\n") || lower.starts_with("error"))
        || (lower.contains("failed:") || lower.contains("failed\n") || lower.starts_with("failed"))
        || lower.contains("panic:")
        || lower.contains("exception:")
        || lower.contains("traceback (most recent")
        || lower.contains("exit code:")
        || lower.contains("status code:")
        || lower.contains("unhandled exception")
        || lower.contains("fatal error")
}

fn fallback_tool_name(tool_name: &str) -> &str {
    if tool_name.is_empty() {
        "tool"
    } else {
        tool_name
    }
}

fn summary_text(text: &str, fallback: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        let mut chars = trimmed.chars();
        let summary: String = chars.by_ref().take(160).collect();
        if chars.next().is_some() {
            format!("{}…", summary)
        } else {
            summary
        }
    }
}

fn make_event(
    session: &Session,
    message: &Message,
    event_type: &str,
    severity: &str,
    summary: &str,
    tool_name: &str,
) -> OpenCodeEvent {
    OpenCodeEvent {
        id: format!("{}:{}:{}", message.id, event_type, message.created_at),
        event_type: event_type.to_string(),
        severity: severity.to_string(),
        source: "opencode-db".to_string(),
        session_id: session.id.clone(),
        title: session.title.clone(),
        summary: summary.to_string(),
        tool_name: tool_name.to_string(),
        timestamp: message.finished_at.unwrap_or(message.created_at),
    }
}

pub fn live_event_from_server(raw: &Value, session: &Session) -> Option<OpenCodeEvent> {
    let event_type = raw.get("type").and_then(Value::as_str)?;
    let properties = raw.get("properties").unwrap_or(raw);
    let event_session_id = extract_session_id(raw)?;
    if event_session_id != session.id {
        return None;
    }

    let id = raw
        .get("id")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("live:{}:{}", event_type, now_ms()));
    let timestamp = extract_timestamp(properties).unwrap_or_else(now_ms);

    let (mapped_type, severity, summary, tool_name): (String, String, String, String) =
        match event_type {
            "session.status" => {
                let status = properties
                    .get("status")
                    .and_then(|status| status.get("type"))
                    .and_then(Value::as_str)
                    .unwrap_or("busy");
                match status {
                    "idle" => live_tuple("session.idle", "success", "OpenCode 已空闲", ""),
                    "retry" => live_tuple("session.retry", "warning", "OpenCode 正在重试请求", ""),
                    _ => live_tuple("session.working", "info", "OpenCode 正在执行", ""),
                }
            }
            "session.idle" => live_tuple("session.idle", "success", "OpenCode 已空闲", ""),
            "session.error" => live_tuple(
                "runtime.error",
                "error",
                summarize_error(properties.get("error")),
                "",
            ),
            "permission.asked" => live_tuple(
                "permission.asked",
                "warning",
                summarize_permission(properties),
                properties
                    .get("permission")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            ),
            "permission.replied" => {
                live_tuple("permission.replied", "info", "OpenCode 权限请求已处理", "")
            }
            "message.updated" => summarize_message_event(properties)?,
            "message.part.updated" | "message.part.delta" => summarize_part_event(properties)?,
            "session.next.step.started" => {
                live_tuple("assistant.started", "info", "OpenCode 开始处理任务", "")
            }
            "session.next.step.ended" => live_tuple(
                "assistant.completed",
                "success",
                "OpenCode 本轮处理完成",
                "",
            ),
            "session.next.step.failed" => live_tuple(
                "runtime.error",
                "error",
                summarize_error(properties.get("error")),
                "",
            ),
            "session.next.prompted" => {
                live_tuple("user.prompted", "info", "OpenCode 收到新任务", "")
            }
            "session.next.text.delta" => {
                let delta = properties
                    .get("delta")
                    .and_then(Value::as_str)
                    .unwrap_or("OpenCode 正在回复");
                live_tuple(
                    "assistant.streaming",
                    "info",
                    summary_text(delta, "OpenCode 正在回复"),
                    "",
                )
            }
            "session.next.text.ended" => live_tuple(
                "assistant.text.completed",
                "info",
                "OpenCode 回复片段完成",
                "",
            ),
            "session.next.tool.called" => {
                let tool = properties
                    .get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or("tool")
                    .to_string();
                live_tuple(
                    "tool.started",
                    "info",
                    format!("Running {}", fallback_tool_name(&tool)),
                    tool,
                )
            }
            "session.next.tool.success" => {
                let tool = properties
                    .get("tool")
                    .and_then(Value::as_str)
                    .or_else(|| properties.get("callID").and_then(Value::as_str))
                    .unwrap_or("tool")
                    .to_string();
                live_tuple(
                    "tool.completed",
                    "success",
                    format!("Finished {}", fallback_tool_name(&tool)),
                    tool,
                )
            }
            "session.next.tool.failed" => {
                let tool = properties
                    .get("tool")
                    .and_then(Value::as_str)
                    .or_else(|| properties.get("callID").and_then(Value::as_str))
                    .unwrap_or("tool")
                    .to_string();
                live_tuple(
                    "tool.failed",
                    "error",
                    format!("{} failed", fallback_tool_name(&tool)),
                    tool,
                )
            }
            "session.updated" | "session.created" => {
                live_tuple("session.updated", "info", "OpenCode 会话已更新", "")
            }
            _ => return None,
        };

    Some(OpenCodeEvent {
        id,
        event_type: mapped_type,
        severity,
        source: "opencode-sse".to_string(),
        session_id: session.id.clone(),
        title: session.title.clone(),
        summary,
        tool_name,
        timestamp,
    })
}

pub fn apply_live_event(state: &mut PetState, event: &OpenCodeEvent) {
    state.last_event = Some(event.clone());
    state.progress.session_title = event.title.clone();
    state.progress.last_message = event.summary.clone();

    match event.event_type.as_str() {
        "tool.started" => {
            state.progress.status = "working".to_string();
            state.mood = "working".to_string();
            state.progress.total_tools += 1;
            state.progress.current_tool = event.tool_name.clone();
        }
        "tool.completed" => {
            state.progress.status = "working".to_string();
            state.mood = "working".to_string();
            state.progress.completed_tools += 1;
            if !event.tool_name.is_empty() {
                state.progress.current_tool = event.tool_name.clone();
            }
        }
        "tool.failed" | "runtime.error" => {
            state.progress.status = "error".to_string();
            state.mood = "error".to_string();
            if !event.tool_name.is_empty() {
                state.progress.current_tool = event.tool_name.clone();
            }
        }
        "permission.asked" => {
            state.progress.status = "working".to_string();
            state.mood = "curious".to_string();
            state.progress.current_tool = event.tool_name.clone();
        }
        "session.idle" | "assistant.completed" => {
            state.progress.status = "completed".to_string();
            state.mood = "happy".to_string();
            state.progress.current_tool.clear();
        }
        "session.working"
        | "session.retry"
        | "assistant.started"
        | "assistant.streaming"
        | "assistant.text.completed"
        | "user.prompted" => {
            state.progress.status = "working".to_string();
            state.mood = "working".to_string();
        }
        _ => {}
    }
}

fn extract_session_id(value: &Value) -> Option<String> {
    value
        .get("properties")
        .and_then(|properties| find_string_key(properties, "sessionID"))
        .or_else(|| find_string_key(value, "sessionID"))
}

fn extract_timestamp(value: &Value) -> Option<i64> {
    let timestamp = value
        .get("timestamp")
        .or_else(|| value.get("time").and_then(|time| time.get("created")))
        .and_then(Value::as_f64)?;

    Some(timestamp as i64)
}

fn summarize_message_event(properties: &Value) -> Option<(String, String, String, String)> {
    let info = properties.get("info")?;
    let message_type = info.get("type").and_then(Value::as_str).unwrap_or_default();
    if message_type == "user" {
        return Some(live_tuple(
            "message.updated",
            "info",
            "用户消息已写入 OpenCode".to_string(),
            "",
        ));
    }

    if let Some(error) = info.get("error") {
        return Some(live_tuple(
            "runtime.error",
            "error",
            summarize_error(Some(error)),
            "",
        ));
    }

    if info
        .get("time")
        .and_then(|time| time.get("completed"))
        .is_some()
    {
        return Some(live_tuple(
            "assistant.completed",
            "success",
            "OpenCode 回复完成".to_string(),
            "",
        ));
    }

    Some(live_tuple(
        "message.updated",
        "info",
        summarize_assistant_text(info).unwrap_or_else(|| "OpenCode 正在更新消息".to_string()),
        "",
    ))
}

fn summarize_part_event(properties: &Value) -> Option<(String, String, String, String)> {
    let part = properties.get("part")?;
    let part_type = part.get("type").and_then(Value::as_str).unwrap_or_default();

    if part_type == "text" {
        if let Some(text) = part.get("text").and_then(Value::as_str) {
            return Some(live_tuple(
                "assistant.streaming",
                "info",
                summary_text(text, "OpenCode 正在回复"),
                "",
            ));
        }
    }

    if part_type == "tool" {
        let tool = part
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("tool")
            .to_string();
        let status = part
            .get("state")
            .and_then(|state| state.get("status"))
            .and_then(Value::as_str)
            .unwrap_or_default();

        return match status {
            "completed" => Some(live_tuple(
                "tool.completed",
                "success",
                format!("Finished {}", fallback_tool_name(&tool)),
                tool,
            )),
            "error" => Some(live_tuple(
                "tool.failed",
                "error",
                format!("{} failed", fallback_tool_name(&tool)),
                tool,
            )),
            _ => Some(live_tuple(
                "tool.started",
                "info",
                format!("Running {}", fallback_tool_name(&tool)),
                tool,
            )),
        };
    }

    None
}

fn summarize_assistant_text(message: &Value) -> Option<String> {
    let content = message.get("content")?.as_array()?;
    for part in content.iter().rev() {
        if part.get("type").and_then(Value::as_str) == Some("text") {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                return Some(summary_text(text, "OpenCode 正在回复"));
            }
        }
    }
    None
}

fn summarize_permission(properties: &Value) -> String {
    let permission = properties
        .get("permission")
        .and_then(Value::as_str)
        .unwrap_or("permission");
    let pattern = properties
        .get("patterns")
        .and_then(Value::as_array)
        .and_then(|items| items.iter().find_map(Value::as_str))
        .unwrap_or("*");

    format!("OpenCode 需要权限：{permission} {pattern}")
}

fn summarize_error(error: Option<&Value>) -> String {
    let Some(error) = error else {
        return "OpenCode reported an error".to_string();
    };

    for key in ["message", "name", "type", "code"] {
        if let Some(text) = error.get(key).and_then(Value::as_str) {
            return summary_text(text, "OpenCode reported an error");
        }
    }

    summary_text(&error.to_string(), "OpenCode reported an error")
}

fn live_tuple(
    event_type: &str,
    severity: &str,
    summary: impl Into<String>,
    tool_name: impl Into<String>,
) -> (String, String, String, String) {
    (
        event_type.to_string(),
        severity.to_string(),
        summary.into(),
        tool_name.into(),
    )
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
