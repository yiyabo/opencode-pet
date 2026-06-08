use crate::{Message, Session, TodoItem};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenCodeSessionSummary {
    pub session_id: String,
    pub fingerprint: String,
    pub summary: String,
    pub source: String,
    pub status: String,
    pub provider: Option<String>,
    pub generated_at_ms: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SummaryGenerationInput {
    pub session: Session,
    pub messages: Vec<Message>,
    pub todos: Vec<TodoItem>,
    pub fingerprint: String,
    pub fallback_summary: String,
}

struct LocalSummaryText {
    text: String,
    provider: String,
}

const SUMMARY_MAX_CHARS: usize = 72;
const CONTEXT_MAX_CHARS: usize = 4_000;

pub fn fingerprint(session: &Session, messages: &[Message], todos: &[TodoItem]) -> String {
    let mut text = String::new();
    text.push_str(&session.id);
    text.push('|');
    text.push_str(&session.title);
    text.push('|');
    text.push_str(&session.message_count.to_string());

    for message in messages.iter().rev().take(16) {
        text.push('|');
        text.push_str(&message.id);
        text.push(':');
        text.push_str(&message.role);
        text.push(':');
        text.push_str(&message.created_at.to_string());
        text.push(':');
        text.push_str(&message.finished_at.unwrap_or_default().to_string());
        text.push(':');
        text.push_str(&extract_message_text(&message.parts));
    }

    for todo in todos {
        text.push('|');
        text.push_str(&todo.position.to_string());
        text.push(':');
        text.push_str(&todo.status);
        text.push(':');
        text.push_str(&todo.content);
        text.push(':');
        text.push_str(&todo.time_updated.to_string());
    }

    format!("{:016x}", stable_hash(text.as_bytes()))
}

pub fn rule_summary(session: &Session, messages: &[Message], todos: &[TodoItem]) -> String {
    let active_todo = todos
        .iter()
        .find(|todo| todo.status == "in_progress")
        .or_else(|| todos.iter().find(|todo| todo.status == "pending"));
    let completed = todos
        .iter()
        .filter(|todo| todo.status == "completed")
        .count();
    let last_user = latest_role_text(messages, "user");
    let last_assistant = latest_role_text(messages, "assistant");

    let mut parts = Vec::new();
    if let Some(todo) = active_todo {
        parts.push(format!("当前在做：{}", compact(&todo.content, 34)));
    } else if let Some(user) = last_user.as_deref() {
        parts.push(format!("用户最近在问：{}", compact(user, 38)));
    } else {
        parts.push(format!("对话：{}", compact(&session.title, 38)));
    }

    if !todos.is_empty() {
        parts.push(format!("Todo {}/{}", completed, todos.len()));
    } else if let Some(assistant) = last_assistant.as_deref() {
        parts.push(compact(assistant, 34));
    }

    compact(&parts.join("；"), SUMMARY_MAX_CHARS)
}

pub async fn generate_local_summary(
    input: SummaryGenerationInput,
) -> Result<OpenCodeSessionSummary, String> {
    let prompt = summary_prompt(&input);
    let generated = match call_ollama(&prompt).await {
        Ok(summary) => summary,
        Err(_) => call_local_openai(&prompt).await?,
    };
    let summary = sanitize_model_summary(&generated.text, &input.fallback_summary);

    Ok(OpenCodeSessionSummary {
        session_id: input.session.id,
        fingerprint: input.fingerprint,
        summary,
        source: "local-ai".to_string(),
        status: "ready".to_string(),
        provider: Some(generated.provider),
        generated_at_ms: now_ms(),
        error: None,
    })
}

pub fn fallback_summary(
    input: &SummaryGenerationInput,
    status: &str,
    error: Option<String>,
) -> OpenCodeSessionSummary {
    OpenCodeSessionSummary {
        session_id: input.session.id.clone(),
        fingerprint: input.fingerprint.clone(),
        summary: input.fallback_summary.clone(),
        source: "rule".to_string(),
        status: status.to_string(),
        provider: None,
        generated_at_ms: now_ms(),
        error,
    }
}

fn summary_prompt(input: &SummaryGenerationInput) -> String {
    let mut lines = vec![
        "请为一个 OpenCode 编程对话写一句中文摘要。".to_string(),
        "要求：只输出一句话；不要 Markdown；不要解释；不要提到你是 AI；控制在 36 个汉字左右。".to_string(),
        "摘要要说明用户想做什么、当前做到哪一步；如果有 todo，优先概括 todo。".to_string(),
        String::new(),
        format!("标题：{}", input.session.title),
    ];

    if !input.todos.is_empty() {
        lines.push("Todo：".to_string());
        for todo in input.todos.iter().take(8) {
            lines.push(format!("- [{}] {}", todo.status, todo.content));
        }
    }

    let mut recent = Vec::new();
    for message in input.messages.iter().rev().take(10).rev() {
        let text = compact(&extract_message_text(&message.parts), 520);
        if text.trim().is_empty() {
            continue;
        }
        recent.push(format!("{}: {}", message.role, text));
    }
    if !recent.is_empty() {
        lines.push(String::new());
        lines.push("最近消息：".to_string());
        lines.extend(recent);
    }

    let prompt = lines.join("\n");
    compact(&prompt, CONTEXT_MAX_CHARS)
}

async fn call_ollama(prompt: &str) -> Result<LocalSummaryText, String> {
    let base_url = local_base_url(
        std::env::var("OPENCODE_PET_OLLAMA_URL")
            .ok()
            .as_deref()
            .unwrap_or("http://127.0.0.1:11434"),
    )?;
    let model = std::env::var("OPENCODE_PET_SUMMARY_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| ollama_first_model(&base_url));
    let Some(model) = model else {
        return Err("No local Ollama model found".to_string());
    };

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": 0.2,
            "num_predict": 96
        }
    });
    let raw = curl_json("POST", &format!("{}/api/generate", base_url), Some(&body), "35").await?;
    let value: Value = serde_json::from_str(&raw).map_err(|err| err.to_string())?;
    let text = value
        .get("response")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "Ollama returned no response text".to_string())?;

    Ok(LocalSummaryText {
        text: text.to_string(),
        provider: format!("ollama/{model}"),
    })
}

async fn call_local_openai(prompt: &str) -> Result<LocalSummaryText, String> {
    let base_url = local_base_url(
        std::env::var("OPENCODE_PET_SUMMARY_BASE_URL")
            .ok()
            .as_deref()
            .unwrap_or("http://127.0.0.1:1234/v1"),
    )?;
    let model = std::env::var("OPENCODE_PET_SUMMARY_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| local_openai_first_model(&base_url))
        .unwrap_or_else(|| "local-model".to_string());
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "你只负责把编程对话压缩成一句简短中文摘要。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 96
    });
    let raw = curl_json(
        "POST",
        &format!("{}/chat/completions", base_url.trim_end_matches('/')),
        Some(&body),
        "35",
    )
    .await?;
    let value: Value = serde_json::from_str(&raw).map_err(|err| err.to_string())?;
    let text = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "Local OpenAI-compatible endpoint returned no text".to_string())?;

    Ok(LocalSummaryText {
        text: text.to_string(),
        provider: format!("local-openai/{model}"),
    })
}

fn ollama_first_model(base_url: &str) -> Option<String> {
    let output = std::process::Command::new("curl")
        .args(["-sS", "--max-time", "2", &format!("{base_url}/api/tags")])
        .output()
        .ok()?;
    let raw = String::from_utf8_lossy(&output.stdout);
    let value: Value = serde_json::from_str(&raw).ok()?;
    let models = value.get("models")?.as_array()?;
    let preferred = ["qwen", "llama", "deepseek", "phi", "gemma", "mistral"];
    for needle in preferred {
        if let Some(name) = models
            .iter()
            .filter_map(|model| model.get("name").and_then(Value::as_str))
            .find(|name| name.to_lowercase().contains(needle))
        {
            return Some(name.to_string());
        }
    }
    models
        .first()
        .and_then(|model| model.get("name"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn local_openai_first_model(base_url: &str) -> Option<String> {
    let output = std::process::Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "2",
            &format!("{}/models", base_url.trim_end_matches('/')),
        ])
        .output()
        .ok()?;
    let raw = String::from_utf8_lossy(&output.stdout);
    let value: Value = serde_json::from_str(&raw).ok()?;
    value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

async fn curl_json(
    method: &str,
    url: &str,
    body: Option<&Value>,
    max_time: &str,
) -> Result<String, String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("-X")
        .arg(method)
        .arg(url)
        .arg("--max-time")
        .arg(max_time)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(body) = body {
        command
            .arg("-H")
            .arg("Content-Type: application/json")
            .arg("-d")
            .arg(body.to_string());
    }

    let output = command.output().await.map_err(|err| err.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("curl exited with {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn local_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    let lower = trimmed.to_lowercase();
    if lower.starts_with("http://127.")
        || lower.starts_with("http://localhost")
        || lower.starts_with("http://[::1]")
        || lower.starts_with("http://0.0.0.0")
    {
        Ok(trimmed)
    } else {
        Err("Summary provider must be a local HTTP endpoint".to_string())
    }
}

fn latest_role_text(messages: &[Message], role: &str) -> Option<String> {
    messages
        .iter()
        .rev()
        .filter(|message| message.role == role)
        .filter_map(|message| {
            let text = extract_message_text(&message.parts);
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        })
        .next()
}

fn extract_message_text(parts: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(parts) else {
        return parts.trim().to_string();
    };
    let values = match value {
        Value::Array(items) => items,
        other => vec![other],
    };

    values
        .into_iter()
        .filter_map(|part| {
            let data = part.get("data").unwrap_or(&part);
            data.get("text")
                .and_then(Value::as_str)
                .or_else(|| part.get("text").and_then(Value::as_str))
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(ToString::to_string)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn sanitize_model_summary(value: &str, fallback: &str) -> String {
    let single_line = value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(fallback)
        .trim_matches('"')
        .trim_matches('`')
        .trim()
        .trim_start_matches("摘要：")
        .trim_start_matches("总结：")
        .trim()
        .to_string();

    compact(
        if single_line.is_empty() {
            fallback
        } else {
            &single_line
        },
        SUMMARY_MAX_CHARS,
    )
}

fn compact(value: &str, max_chars: usize) -> String {
    let text = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = text.trim();
    if text.is_empty() {
        return String::new();
    }

    let mut chars = text.chars();
    let clipped: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{clipped}...")
    } else {
        clipped
    }
}

fn stable_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
