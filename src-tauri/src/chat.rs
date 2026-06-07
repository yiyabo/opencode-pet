use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;
use tokio::process::Command;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
pub struct ChatRequest {
    pub prompt: String,
    pub session_id: Option<String>,
    pub session_title: Option<String>,
    pub event_summary: Option<String>,
    pub recent_context: Option<String>,
    pub dispatch_context: Option<String>,
    pub dispatch_label: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub delegate_to_opencode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatAttempt {
    pub provider: String,
    pub command: String,
    pub status_code: Option<i32>,
    pub elapsed_ms: u128,
    pub timed_out: bool,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub provider: String,
    pub command: String,
    pub output: String,
    pub stderr: String,
    pub status_code: Option<i32>,
    pub elapsed_ms: u128,
    pub timed_out: bool,
    pub project_dir: String,
    pub attempts: Vec<ChatAttempt>,
}

struct HttpCall {
    command: String,
    body: String,
    stderr: String,
    status_code: Option<i32>,
    elapsed_ms: u128,
    timed_out: bool,
}

struct InjectionOutcome {
    output: String,
    command: String,
    status_code: Option<i32>,
    attempts: Vec<ChatAttempt>,
}

enum TuiPromptState {
    Succeeded(InjectionOutcome),
    FailedBeforeAppend(Vec<ChatAttempt>),
    FailedAfterAppend(Vec<ChatAttempt>),
}

// ── opencode serve helpers ──────────────────────────────────────

fn server_host_port(server_url: &str) -> Result<String, ChatAttempt> {
    let after_scheme = server_url
        .strip_prefix("http://")
        .or_else(|| server_url.strip_prefix("https://"))
        .ok_or_else(|| ChatAttempt {
            provider: "opencode-server".to_string(),
            command: server_url.to_string(),
            status_code: None,
            elapsed_ms: 0,
            timed_out: false,
            error: "OpenCode server URL must start with http:// or https://".to_string(),
        })?;

    let host_port = after_scheme.split('/').next().unwrap_or_default();
    if host_port.is_empty() || !host_port.contains(':') {
        return Err(ChatAttempt {
            provider: "opencode-server".to_string(),
            command: server_url.to_string(),
            status_code: None,
            elapsed_ms: 0,
            timed_out: false,
            error: "OpenCode server URL must include host and port".to_string(),
        });
    }

    Ok(host_port.to_string())
}

fn server_port(server_url: &str) -> Result<u16, ChatAttempt> {
    let host_port = server_host_port(server_url)?;
    let port_text = host_port
        .rsplit_once(':')
        .map(|(_, port)| port)
        .unwrap_or("");
    port_text.parse::<u16>().map_err(|_| ChatAttempt {
        provider: "opencode-server".to_string(),
        command: server_url.to_string(),
        status_code: None,
        elapsed_ms: 0,
        timed_out: false,
        error: "OpenCode server URL port must be numeric".to_string(),
    })
}

/// Check if opencode server is running, start it if not.
async fn ensure_opencode_server(
    project_dir: &PathBuf,
    server_url: &str,
) -> Result<(), ChatAttempt> {
    let host_port = server_host_port(server_url)?;
    let port = server_port(server_url)?;

    // Use TCP connect to check port — more reliable than curl in sandboxed env
    if tokio::net::TcpStream::connect(&host_port).await.is_ok() {
        return Ok(());
    }

    // Not running — start it in background
    let opencode = find_opencode();
    let start = Instant::now();
    let started = Command::new(&opencode)
        .current_dir(project_dir)
        .args(["serve", "--port", &port.to_string()])
        .spawn();

    if let Err(err) = started {
        return Err(ChatAttempt {
            provider: "opencode-server".to_string(),
            command: format!("{opencode} serve --port {port}"),
            status_code: None,
            elapsed_ms: start.elapsed().as_millis(),
            timed_out: false,
            error: format!("Failed to start opencode server: {err}"),
        });
    }

    // Wait up to 5s for port to open
    for _ in 0..10 {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        if tokio::net::TcpStream::connect(&host_port).await.is_ok() {
            return Ok(());
        }
    }

    Err(ChatAttempt {
        provider: "opencode-server".to_string(),
        command: format!("{opencode} serve --port {port}"),
        status_code: None,
        elapsed_ms: start.elapsed().as_millis(),
        timed_out: true,
        error: format!("opencode server did not become ready at {server_url}"),
    })
}

fn find_opencode() -> String {
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

async fn curl_json(
    method: &str,
    url: &str,
    body: Option<&serde_json::Value>,
    max_time: &str,
) -> HttpCall {
    let start = Instant::now();
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("-w")
        .arg("\n%{http_code}")
        .arg("-X")
        .arg(method)
        .arg(url)
        .arg("--max-time")
        .arg(max_time);

    if let Some(body) = body {
        command
            .arg("-H")
            .arg("Content-Type: application/json")
            .arg("-d")
            .arg(body.to_string());
    }

    let command_text = format!("curl -X {method} {url}");
    match command.output().await {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let (response_body, status_code) = parse_curl_status(&stdout);
            HttpCall {
                command: command_text,
                body: response_body,
                stderr,
                status_code,
                elapsed_ms: start.elapsed().as_millis(),
                timed_out: output.status.code() == Some(28),
            }
        }
        Err(err) => HttpCall {
            command: command_text,
            body: String::new(),
            stderr: err.to_string(),
            status_code: None,
            elapsed_ms: start.elapsed().as_millis(),
            timed_out: false,
        },
    }
}

fn parse_curl_status(stdout: &str) -> (String, Option<i32>) {
    if let Some((body, code)) = stdout.rsplit_once('\n') {
        let code = code.trim();
        if code.len() == 3 && code.chars().all(|ch| ch.is_ascii_digit()) {
            return (body.to_string(), code.parse::<i32>().ok());
        }
    }

    (stdout.to_string(), None)
}

fn http_attempt(call: &HttpCall, error: String) -> ChatAttempt {
    ChatAttempt {
        provider: "opencode-server".to_string(),
        command: call.command.clone(),
        status_code: call.status_code,
        elapsed_ms: call.elapsed_ms,
        timed_out: call.timed_out,
        error,
    }
}

fn selected_model(model_id: Option<&str>) -> Option<serde_json::Value> {
    let model_id = model_id?;
    let parts: Vec<&str> = model_id.splitn(2, '/').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return None;
    }

    Some(serde_json::json!({
        "providerID": parts[0],
        "modelID": parts[1],
    }))
}

fn session_model(
    session: &serde_json::Value,
    override_model: Option<&str>,
) -> Option<serde_json::Value> {
    if let Some(model) = selected_model(override_model) {
        return Some(model);
    }

    let model = session.get("model")?;
    let provider_id = model
        .get("providerID")
        .and_then(serde_json::Value::as_str)?;
    let model_id = model
        .get("modelID")
        .or_else(|| model.get("id"))
        .and_then(serde_json::Value::as_str)?;

    Some(serde_json::json!({
        "providerID": provider_id,
        "modelID": model_id,
    }))
}

fn session_agent(session: &serde_json::Value) -> Option<String> {
    session
        .get("agent")
        .and_then(serde_json::Value::as_str)
        .filter(|agent| !agent.trim().is_empty())
        .map(ToString::to_string)
}

fn new_message_id() -> String {
    format!("msg_pet_{}", Uuid::new_v4().simple())
}

fn compact_error_text(call: &HttpCall) -> String {
    let mut pieces = Vec::new();
    if !call.body.trim().is_empty() {
        pieces.push(call.body.trim().to_string());
    }
    if !call.stderr.trim().is_empty() {
        pieces.push(call.stderr.trim().to_string());
    }
    if pieces.is_empty() {
        "No response body".to_string()
    } else {
        pieces.join("\n")
    }
}

fn expect_true_response(call: &HttpCall, action: &str) -> Result<(), String> {
    if call.status_code != Some(200) {
        return Err(format!("{action} failed: {}", compact_error_text(call)));
    }

    match serde_json::from_str::<serde_json::Value>(&call.body) {
        Ok(serde_json::Value::Bool(true)) => Ok(()),
        Ok(value) => Err(format!("{action} returned unexpected response: {value}")),
        Err(err) => Err(format!(
            "{action} returned invalid JSON: {err}; body: {}",
            call.body
        )),
    }
}

fn format_injection_error(
    session_label: &str,
    server_url: &str,
    attempts: &[ChatAttempt],
) -> String {
    let mut message = format!("没有成功发送到 OpenCode 会话 `{session_label}`。");

    if let Some(last) = attempts.last() {
        let status = last
            .status_code
            .map(|code| code.to_string())
            .unwrap_or_else(|| "no HTTP status".to_string());
        message.push_str(&format!(
            "\n\n最后一次请求：`{}`\n状态：`{}`\n错误：{}",
            last.command, status, last.error
        ));
    }

    message.push_str(
        &format!("\n\n这通常表示桌宠读到的 session 不在当前 OpenCode server 里，或者该 session 正在忙。请确认 `{server_url}` 上的 OpenCode server 能看到这个 session。"),
    );
    message
}

async fn send_via_tui(
    server_url: &str,
    session_id: &str,
    session_title: &str,
    prompt: &str,
) -> TuiPromptState {
    let mut attempts = Vec::new();

    let select_url = format!("{server_url}/tui/select-session");
    let select_body = serde_json::json!({ "sessionID": session_id });
    let select_call = curl_json("POST", &select_url, Some(&select_body), "5").await;
    if let Err(error) = expect_true_response(&select_call, "Select TUI session") {
        attempts.push(http_attempt(&select_call, error));
        return TuiPromptState::FailedBeforeAppend(attempts);
    }
    attempts.push(http_attempt(
        &select_call,
        "Selected TUI session".to_string(),
    ));

    let append_url = format!("{server_url}/tui/append-prompt");
    let append_body = serde_json::json!({ "text": prompt });
    let append_call = curl_json("POST", &append_url, Some(&append_body), "5").await;
    if let Err(error) = expect_true_response(&append_call, "Append TUI prompt") {
        attempts.push(http_attempt(&append_call, error));
        return TuiPromptState::FailedBeforeAppend(attempts);
    }
    attempts.push(http_attempt(
        &append_call,
        "Appended TUI prompt".to_string(),
    ));

    let submit_url = format!("{server_url}/tui/submit-prompt");
    let submit_call = curl_json("POST", &submit_url, None, "10").await;
    if let Err(error) = expect_true_response(&submit_call, "Submit TUI prompt") {
        attempts.push(http_attempt(&submit_call, error));
        return TuiPromptState::FailedAfterAppend(attempts);
    }
    attempts.push(http_attempt(
        &submit_call,
        "Submitted TUI prompt".to_string(),
    ));

    match verify_prompt_visible(server_url, session_id, prompt).await {
        Ok(verify_attempt) => attempts.push(verify_attempt),
        Err(verify_attempt) => {
            attempts.push(verify_attempt);
            return TuiPromptState::FailedAfterAppend(attempts);
        }
    }

    TuiPromptState::Succeeded(InjectionOutcome {
        output: format!(
            "已通过 OpenCode TUI 实时提交，并已在消息列表中确认：{session_title}\n\nserver: `{server_url}`\nsession id: `{session_id}`\n\n如果终端里没有立刻出现，请确认它是连到同一个 server，或用普通 TUI 启动时指定同一个端口：`opencode -s {session_id} --port <port>`。"
        ),
        command: format!(
            "POST /tui/select-session -> POST /tui/append-prompt -> POST /tui/submit-prompt"
        ),
        status_code: submit_call.status_code,
        attempts,
    })
}

async fn send_via_prompt_async(
    server_url: &str,
    session_id: &str,
    session_title: &str,
    server_session: &serde_json::Value,
    prompt: &str,
    model_id: Option<&str>,
) -> Result<InjectionOutcome, Vec<ChatAttempt>> {
    let mut attempts = Vec::new();
    let prompt_url = format!("{server_url}/session/{session_id}/prompt_async");
    let message_id = new_message_id();
    let mut body = serde_json::json!({
        "messageID": message_id,
        "parts": [{"type": "text", "text": prompt}],
    });

    if let Some(agent) = session_agent(server_session) {
        body["agent"] = serde_json::Value::String(agent);
    }

    if let Some(model) = session_model(server_session, model_id) {
        body["model"] = model;
    }

    let prompt_call = curl_json("POST", &prompt_url, Some(&body), "20").await;
    let prompt_attempt = if matches!(prompt_call.status_code, Some(200 | 204)) {
        http_attempt(
            &prompt_call,
            format!("OpenCode accepted prompt_async message `{message_id}`"),
        )
    } else {
        http_attempt(&prompt_call, compact_error_text(&prompt_call))
    };
    attempts.push(prompt_attempt);

    if !matches!(prompt_call.status_code, Some(200 | 204)) {
        return Err(attempts);
    }

    match verify_prompt_visible(server_url, session_id, prompt).await {
        Ok(verify_attempt) => attempts.push(verify_attempt),
        Err(verify_attempt) => {
            attempts.push(verify_attempt);
            return Err(attempts);
        }
    }

    Ok(InjectionOutcome {
        output: format!(
            "已通过 OpenCode API 执行，并已在消息列表中确认：{session_title}\n\nserver: `{server_url}`\nsession id: `{session_id}`\nmessage id: `{message_id}`\n\n没有可控 TUI 时会走这条路径。Web UI 或 `opencode attach {server_url} --dir <project> --session {session_id}` 会接收实时事件；无端口独立 TUI 可能需要重新进入才刷新。"
        ),
        command: format!("POST /session/{session_id}/prompt_async"),
        status_code: prompt_call.status_code,
        attempts,
    })
}

async fn send_via_session_message(
    server_url: &str,
    session_id: &str,
    session_title: &str,
    server_session: &serde_json::Value,
    prompt: &str,
    model_id: Option<&str>,
) -> Result<InjectionOutcome, Vec<ChatAttempt>> {
    let mut attempts = Vec::new();
    let message_url = format!("{server_url}/session/{session_id}/message");
    let mut body = serde_json::json!({
        "parts": [{"type": "text", "text": prompt}],
    });

    if let Some(agent) = session_agent(server_session) {
        body["agent"] = serde_json::Value::String(agent);
    }

    if let Some(model) = session_model(server_session, model_id) {
        body["model"] = model;
    }

    let message_call = curl_json("POST", &message_url, Some(&body), "20").await;
    attempts.push(http_attempt(
        &message_call,
        compact_error_text(&message_call),
    ));

    if message_call.status_code != Some(200) {
        return Err(attempts);
    }

    match prompt_exists_in_messages(&format!("[{}]", message_call.body), prompt) {
        Ok(true) => {}
        Ok(false) => {
            attempts.push(ChatAttempt {
                provider: "opencode-server".to_string(),
                command: message_url,
                status_code: Some(200),
                elapsed_ms: 0,
                timed_out: false,
                error: "OpenCode returned 200, but the created message response did not include the prompt".to_string(),
            });
            return Err(attempts);
        }
        Err(err) => {
            attempts.push(ChatAttempt {
                provider: "opencode-server".to_string(),
                command: message_url,
                status_code: Some(200),
                elapsed_ms: 0,
                timed_out: false,
                error: format!("OpenCode returned 200, but the created message response was not parseable: {err}"),
            });
            return Err(attempts);
        }
    }

    match verify_prompt_visible(server_url, session_id, prompt).await {
        Ok(verify_attempt) => attempts.push(verify_attempt),
        Err(verify_attempt) => {
            attempts.push(verify_attempt);
            return Err(attempts);
        }
    }

    Ok(InjectionOutcome {
        output: format!(
            "已写入 OpenCode 历史记录并已确认：{session_title}\n\nserver: `{server_url}`\nsession id: `{session_id}`\n\n注意：这是历史兜底路径，不一定触发 OpenCode 实时执行。"
        ),
        command: format!("POST /session/{session_id}/message"),
        status_code: Some(200),
        attempts,
    })
}

async fn verify_prompt_visible(
    server_url: &str,
    session_id: &str,
    prompt: &str,
) -> Result<ChatAttempt, ChatAttempt> {
    let messages_url = format!("{server_url}/session/{session_id}/message?limit=30");

    for attempt_index in 1..=8 {
        let call = curl_json("GET", &messages_url, None, "5").await;
        let base_attempt = http_attempt(
            &call,
            format!("Verify prompt in OpenCode messages, attempt {attempt_index}"),
        );

        if call.status_code != Some(200) {
            return Err(ChatAttempt {
                error: format!("Message verification failed: {}", compact_error_text(&call)),
                ..base_attempt
            });
        }

        match prompt_exists_in_messages(&call.body, prompt) {
            Ok(true) => {
                return Ok(ChatAttempt {
                    error: "Verified prompt is present in OpenCode message list".to_string(),
                    ..base_attempt
                });
            }
            Ok(false) => {
                if attempt_index < 8 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(450)).await;
                    continue;
                }

                return Err(ChatAttempt {
                    error: "OpenCode accepted the prompt, but it did not appear in the session messages".to_string(),
                    ..base_attempt
                });
            }
            Err(err) => {
                return Err(ChatAttempt {
                    error: format!(
                        "Could not parse OpenCode messages while verifying prompt: {err}"
                    ),
                    ..base_attempt
                });
            }
        }
    }

    Err(ChatAttempt {
        provider: "opencode-server".to_string(),
        command: messages_url,
        status_code: None,
        elapsed_ms: 0,
        timed_out: true,
        error: "Timed out while verifying prompt in OpenCode messages".to_string(),
    })
}

fn prompt_exists_in_messages(raw: &str, prompt: &str) -> Result<bool, serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(raw)?;

    if let Some(items) = value.as_array() {
        return Ok(items
            .iter()
            .any(|message| message_contains_prompt(message, prompt)));
    };

    Ok(message_contains_prompt(&value, prompt))
}

fn message_contains_prompt(message: &serde_json::Value, prompt: &str) -> bool {
    message
        .get("parts")
        .and_then(serde_json::Value::as_array)
        .map(|parts| {
            parts.iter().any(|part| {
                part.get("type")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|part_type| part_type == "text")
                    && part
                        .get("text")
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(|text| text.contains(prompt))
            })
        })
        .unwrap_or(false)
}

/// Inject a message into an opencode session via the official HTTP API.
async fn inject_to_opencode(
    server_url: &str,
    session_id: &str,
    session_title: Option<&str>,
    prompt: &str,
    model_id: Option<&str>,
    project_dir: &PathBuf,
) -> Result<InjectionOutcome, Vec<ChatAttempt>> {
    let mut attempts = Vec::new();

    if let Err(attempt) = ensure_opencode_server(project_dir, server_url).await {
        attempts.push(attempt);
        return Err(attempts);
    }

    let session_url = format!("{server_url}/session/{session_id}");
    let session_call = curl_json("GET", &session_url, None, "5").await;
    if session_call.status_code != Some(200) {
        attempts.push(http_attempt(
            &session_call,
            format!(
                "Session lookup failed: {}",
                compact_error_text(&session_call)
            ),
        ));
        return Err(attempts);
    }

    let server_session: serde_json::Value = match serde_json::from_str(&session_call.body) {
        Ok(value) => value,
        Err(err) => {
            attempts.push(http_attempt(
                &session_call,
                format!("Session lookup returned invalid JSON: {err}"),
            ));
            return Err(attempts);
        }
    };

    let server_title = server_session
        .get("title")
        .and_then(serde_json::Value::as_str)
        .or(session_title)
        .unwrap_or(session_id);

    // Prefer the TUI route so an attached terminal can show the prompt immediately.
    // If nothing was appended to the TUI, fall back to the API route.
    match send_via_tui(server_url, session_id, server_title, prompt).await {
        TuiPromptState::Succeeded(outcome) => return Ok(outcome),
        TuiPromptState::FailedAfterAppend(attempts) => return Err(attempts),
        TuiPromptState::FailedBeforeAppend(tui_attempts) => attempts.extend(tui_attempts),
    }

    match send_via_prompt_async(
        server_url,
        session_id,
        server_title,
        &server_session,
        prompt,
        model_id,
    )
    .await
    {
        Ok(outcome) => return Ok(outcome),
        Err(prompt_attempts) => {
            let accepted = prompt_attempts.iter().any(|attempt| {
                attempt.command.contains("/prompt_async")
                    && matches!(attempt.status_code, Some(200 | 204))
            });
            attempts.extend(prompt_attempts);
            if accepted {
                return Err(attempts);
            }
        }
    }

    match send_via_session_message(
        server_url,
        session_id,
        server_title,
        &server_session,
        prompt,
        model_id,
    )
    .await
    {
        Ok(outcome) => return Ok(outcome),
        Err(message_attempts) => attempts.extend(message_attempts),
    }

    Err(attempts)
}

// ── Config / Mimo fallback ──────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ProviderOptions {
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    #[serde(rename = "baseURL")]
    base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProviderConfig {
    options: Option<ProviderOptions>,
    models: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct OpenCodeConfig {
    provider: Option<HashMap<String, ProviderConfig>>,
}

struct ApiEndpoint {
    base_url: String,
    api_key: String,
    model: String,
    provider_name: String,
}

fn load_api_endpoint(requested_model: Option<&str>) -> Option<ApiEndpoint> {
    let config_path = dirs::home_dir()?.join(".config/opencode/opencode.json");
    let content = std::fs::read_to_string(config_path).ok()?;
    let config: OpenCodeConfig = serde_json::from_str(&content).ok()?;
    let providers = config.provider?;

    if let Some(req) = requested_model {
        let parts: Vec<&str> = req.splitn(2, '/').collect();
        if parts.len() == 2 {
            if let Some(prov) = providers.get(parts[0]) {
                if let Some(opts) = &prov.options {
                    if let (Some(key), Some(url)) = (&opts.api_key, &opts.base_url) {
                        if !key.is_empty() && !url.is_empty() {
                            return Some(ApiEndpoint {
                                base_url: url.clone(),
                                api_key: key.clone(),
                                model: parts[1].to_string(),
                                provider_name: parts[0].to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Prefer mimo, then any provider with credentials
    let preferred = ["mimo", "alibaba-cn", "1", "black"];
    let provider_keys: Vec<String> = providers.keys().cloned().collect();
    let all_ids: Vec<&str> = preferred
        .iter()
        .copied()
        .chain(provider_keys.iter().map(|s| s.as_str()))
        .collect();
    for pid in all_ids {
        if let Some(prov) = providers.get(pid) {
            if let Some(opts) = &prov.options {
                if let (Some(key), Some(url)) = (&opts.api_key, &opts.base_url) {
                    if !key.is_empty() && !url.is_empty() {
                        let model = prov
                            .models
                            .as_ref()
                            .and_then(|m| m.keys().next())
                            .cloned()
                            .unwrap_or_else(|| "gpt-3.5-turbo".to_string());
                        return Some(ApiEndpoint {
                            base_url: url.clone(),
                            api_key: key.clone(),
                            model,
                            provider_name: pid.to_string(),
                        });
                    }
                }
            }
        }
    }
    None
}

async fn call_direct_api(endpoint: &ApiEndpoint, system: &str, user_msg: &str) -> Option<String> {
    let body = serde_json::json!({
        "model": endpoint.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg}
        ],
        "max_tokens": 2048
    })
    .to_string();

    let url = format!(
        "{}/chat/completions",
        endpoint.base_url.trim_end_matches('/')
    );
    let out = Command::new("curl")
        .args([
            "-s",
            "-X",
            "POST",
            &url,
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("Authorization: Bearer {}", endpoint.api_key),
            "-d",
            &body,
            "--max-time",
            "60",
        ])
        .output()
        .await
        .ok()?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let json: serde_json::Value = serde_json::from_str(&stdout).ok()?;

    // Check for API error
    if let Some(err) = json["error"]["message"].as_str() {
        let api_type = json["error"]["type"].as_str().unwrap_or("");
        if api_type == "Arrearage" || err.contains("overdue") {
            return Some(format!("💳 API 账户余额不足（{}）", endpoint.provider_name));
        }
        return Some(format!("❌ API 错误：{err}"));
    }

    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
}

fn local_pet_reply(request: &ChatRequest, project_dir_text: &str) -> String {
    let prompt = request.prompt.trim();
    let session_label = request
        .session_title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
        .unwrap_or("当前会话");

    let wants_action = [
        "修", "改", "执行", "跑", "继续", "交给", "opencode", "OpenCode", "fix", "run", "continue",
    ]
    .iter()
    .any(|needle| prompt.contains(*needle));

    if wants_action && request.session_id.is_some() {
        return format!(
            "我先不直接动 OpenCode。\n\n我可以把这条整理成任务发给 `{session_label}`：\n\n> {prompt}\n\n点“交给 OpenCode”我再执行。"
        );
    }

    if wants_action {
        return format!(
            "我听懂了，这是一个可以交给 OpenCode 的动作，但现在还没有绑定可执行会话。\n\n当前项目：`{project_dir_text}`\n\n先在“会话”里选一个 session，再点“交给 OpenCode”。"
        );
    }

    format!(
        "我在。当前这条我先当作聊天，不会发给 OpenCode。\n\n你可以继续把想法说完整；要我执行时，直接点“交给 OpenCode”。\n\n你刚刚说：{prompt}"
    )
}

fn compact_prompt_block(value: Option<&String>, max_chars: usize) -> Option<String> {
    let text = value?.trim();
    if text.is_empty() {
        return None;
    }

    let mut chars = text.chars();
    let clipped: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        Some(format!("{clipped}..."))
    } else {
        Some(clipped)
    }
}

fn opencode_prompt_payload(request: &ChatRequest, project_dir_text: &str) -> String {
    let raw_prompt = request.prompt.trim();
    let has_event = request
        .event_summary
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let has_context = request
        .recent_context
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let has_dispatch_route = request
        .dispatch_context
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
        || request
            .dispatch_label
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());

    if !has_event && !has_context && !has_dispatch_route {
        return raw_prompt.to_string();
    }

    let mut lines = vec![
        "Use this OpenCode handoff as the source of truth for the next action.".to_string(),
        "Preserve user work, make the smallest useful change, and run the most relevant validation before reporting back.".to_string(),
        String::new(),
        format!("Project: {project_dir_text}"),
    ];

    if let Some(session_id) = request
        .session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("Session: {session_id}"));
    }
    if let Some(title) = request
        .session_title
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("Session title: {title}"));
    }
    if let Some(context) = request
        .dispatch_context
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("Dispatch context: {context}"));
    }
    if let Some(label) = request
        .dispatch_label
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("Dispatch label: {label}"));
    }
    if let Some(model) = request
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty() && *value != "auto")
    {
        lines.push(format!("Requested model: {model}"));
    }

    if let Some(event) = compact_prompt_block(request.event_summary.as_ref(), 1_200) {
        lines.push(String::new());
        lines.push("Latest event:".to_string());
        lines.push(event);
    }

    if let Some(context) = compact_prompt_block(request.recent_context.as_ref(), 4_000) {
        lines.push(String::new());
        lines.push("Recent context:".to_string());
        lines.push(context);
    }

    lines.push(String::new());
    lines.push("User request:".to_string());
    lines.push(raw_prompt.to_string());
    lines.join("\n")
}

// ── Main entry point ────────────────────────────────────────────

pub async fn run_prompt(
    request: ChatRequest,
    project_dir: PathBuf,
    server_url: String,
) -> ChatResponse {
    let project_dir_text = project_dir.to_string_lossy().to_string();
    let start = Instant::now();
    let model_req = request
        .model
        .as_deref()
        .filter(|s| !s.is_empty() && *s != "auto");

    // ── Step 1: Delegate to OpenCode only when the user explicitly asks ──
    let session_id = request
        .session_id
        .as_deref()
        .filter(|s| !s.trim().is_empty());

    if request.delegate_to_opencode && session_id.is_none() {
        return ChatResponse {
            provider: "pet-local".to_string(),
            command: "delegate-missing-session".to_string(),
            output:
                "还没有选中 OpenCode 会话。先在“会话”里绑定一个 session，我再把任务交给 OpenCode。"
                    .to_string(),
            stderr: String::new(),
            status_code: None,
            elapsed_ms: start.elapsed().as_millis(),
            timed_out: false,
            project_dir: project_dir_text,
            attempts: vec![],
        };
    }

    if request.delegate_to_opencode {
        let Some(sid) = session_id else {
            unreachable!("delegate_to_opencode without session_id is handled above");
        };
        let prompt = opencode_prompt_payload(&request, &project_dir_text);
        match inject_to_opencode(
            &server_url,
            sid,
            request.session_title.as_deref(),
            &prompt,
            model_req,
            &project_dir,
        )
        .await
        {
            Ok(outcome) => {
                return ChatResponse {
                    provider: "opencode-server".to_string(),
                    command: outcome.command,
                    output: outcome.output,
                    stderr: String::new(),
                    status_code: outcome.status_code,
                    elapsed_ms: start.elapsed().as_millis(),
                    timed_out: false,
                    project_dir: project_dir_text,
                    attempts: outcome.attempts,
                };
            }
            Err(attempts) => {
                return ChatResponse {
                    provider: "opencode-server".to_string(),
                    command: attempts
                        .last()
                        .map(|attempt| attempt.command.clone())
                        .unwrap_or_else(|| "opencode injection".to_string()),
                    output: format_injection_error(
                        request.session_title.as_deref().unwrap_or(sid),
                        &server_url,
                        &attempts,
                    ),
                    stderr: attempts
                        .iter()
                        .map(|attempt| attempt.error.as_str())
                        .collect::<Vec<_>>()
                        .join("\n"),
                    status_code: attempts.last().and_then(|attempt| attempt.status_code),
                    elapsed_ms: start.elapsed().as_millis(),
                    timed_out: attempts.iter().any(|attempt| attempt.timed_out),
                    project_dir: project_dir_text,
                    attempts,
                };
            }
        }
    }

    // ── Step 2: Pet chat via direct API (Mimo / Kimi) ──
    let mut user_msg = request.prompt.clone();
    if let Some(ev) = &request.event_summary {
        if !ev.trim().is_empty() {
            user_msg = format!("[Event: {ev}]\n\n{user_msg}");
        }
    }
    if let Some(ctx) = &request.recent_context {
        let t: String = ctx.chars().take(3000).collect();
        if !t.trim().is_empty() {
            user_msg = format!("[Context]\n{t}\n\n[User]\n{user_msg}");
        }
    }

    let system = format!(
        "你是一个桌面小宠物里的开发协作者，名字叫小黑。项目路径：{project_dir_text}。\
         默认先和用户讨论、追问、整理思路，不要声称已经执行了命令或修改了文件。\
         如果用户明显想执行任务，请把任务整理清楚，并提醒用户使用“交给 OpenCode”。\
         回复要简洁、有温度，使用 markdown。"
    );

    if let Some(endpoint) = load_api_endpoint(model_req) {
        let provider = endpoint.provider_name.clone();
        if let Some(reply) = call_direct_api(&endpoint, &system, &user_msg).await {
            return ChatResponse {
                provider,
                command: "direct-api".to_string(),
                output: reply,
                stderr: String::new(),
                status_code: Some(0),
                elapsed_ms: start.elapsed().as_millis(),
                timed_out: false,
                project_dir: project_dir_text,
                attempts: vec![],
            };
        }
    }

    // ── Step 3: Hard fallback ──
    let fallback_output = if request.delegate_to_opencode {
        format!(
            "⚠️ 无法连接到 opencode server。\n\n请确认：\n1. opencode 正在运行\n2. `{}` 可以访问\n\n你的消息：{}",
            server_url,
            request.prompt
        )
    } else {
        local_pet_reply(&request, &project_dir_text)
    };

    ChatResponse {
        provider: if request.delegate_to_opencode {
            "error"
        } else {
            "pet-local"
        }
        .to_string(),
        command: "local-fallback".to_string(),
        output: fallback_output,
        stderr: String::new(),
        status_code: None,
        elapsed_ms: start.elapsed().as_millis(),
        timed_out: false,
        project_dir: project_dir_text,
        attempts: vec![],
    }
}
