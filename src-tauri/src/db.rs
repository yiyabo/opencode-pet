use crate::{Message, Session, TodoItem};
use rusqlite::{Connection, OpenFlags, Result};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DatabaseSchema {
    Legacy,
    Modern,
}

fn open_database(db_path: &Path) -> Result<Connection> {
    let path = db_path.join("opencode.db");
    let uri = format!(
        "file:{}?mode=ro&nolock=1&immutable=1",
        path.to_string_lossy().replace(' ', "%20")
    );
    Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool> {
    let mut stmt = conn
        .prepare("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)")?;

    stmt.query_row([table_name], |row| row.get(0))
}

fn detect_schema(conn: &Connection) -> Result<Option<DatabaseSchema>> {
    if table_exists(conn, "sessions")? && table_exists(conn, "messages")? {
        return Ok(Some(DatabaseSchema::Legacy));
    }

    if table_exists(conn, "session")? && table_exists(conn, "message")? {
        return Ok(Some(DatabaseSchema::Modern));
    }

    Ok(None)
}

fn get_schema(conn: &Connection) -> Result<DatabaseSchema> {
    detect_schema(conn)?.ok_or(rusqlite::Error::InvalidQuery)
}

fn opencode_global_data_dir() -> Option<PathBuf> {
    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        return Some(PathBuf::from(data_home).join("opencode"));
    }

    dirs::home_dir().map(|home| home.join(".local").join("share").join("opencode"))
}

fn candidate_database_dirs() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(global_dir) = opencode_global_data_dir() {
        candidates.push(global_dir);
    }

    if let Ok(current) = std::env::current_dir() {
        let mut path = current.as_path();
        loop {
            candidates.push(path.join(".opencode"));
            if let Some(parent) = path.parent() {
                path = parent;
            } else {
                break;
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".opencode"));
    }

    candidates
}

pub fn is_valid_database_dir(db_path: &Path) -> bool {
    if !db_path.is_dir() || !db_path.join("opencode.db").is_file() {
        return false;
    }

    match open_database(db_path).and_then(|conn| detect_schema(&conn)) {
        Ok(Some(_)) => true,
        Ok(None) | Err(_) => false,
    }
}

pub fn find_opencode_database_dirs() -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut databases = Vec::new();

    for path in candidate_database_dirs() {
        if seen.insert(path.clone()) && is_valid_database_dir(&path) {
            databases.push(path);
        }
    }

    databases
}

fn parse_session_row(row: &rusqlite::Row<'_>) -> Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        directory: row.get(2)?,
        message_count: row.get(3)?,
        prompt_tokens: row.get(4)?,
        completion_tokens: row.get(5)?,
        cost: row.get(6)?,
        updated_at: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn wrap_part_value(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let part_type = map
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("data")
                .to_string();

            let mut wrapped = Map::new();
            wrapped.insert("type".to_string(), Value::String(part_type));
            wrapped.insert("data".to_string(), Value::Object(map));
            Value::Object(wrapped)
        }
        other => {
            let mut wrapped = Map::new();
            wrapped.insert("type".to_string(), Value::String("data".to_string()));
            wrapped.insert("data".to_string(), other);
            Value::Object(wrapped)
        }
    }
}

fn parse_json_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

fn parse_message_metadata(raw: &str) -> (String, Option<String>, Option<i64>) {
    let parsed = parse_json_value(raw);
    let role = parsed
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("assistant")
        .to_string();

    let model = parsed
        .get("modelID")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            parsed
                .get("model")
                .and_then(|model| model.get("modelID"))
                .and_then(Value::as_str)
                .map(str::to_string)
        });

    let finished_at = parsed
        .get("time")
        .and_then(|time| time.get("completed"))
        .and_then(Value::as_i64);

    (role, model, finished_at)
}

fn load_modern_parts(conn: &Connection, session_id: &str) -> Result<HashMap<String, Vec<Value>>> {
    let mut stmt = conn.prepare(
        "SELECT message_id, data
         FROM part
         WHERE session_id = ?1
         ORDER BY time_created ASC",
    )?;

    let mut grouped_parts: HashMap<String, Vec<Value>> = HashMap::new();

    for row in stmt.query_map([session_id], |row| {
        let message_id: String = row.get(0)?;
        let raw_data: String = row.get(1)?;
        Ok((message_id, wrap_part_value(parse_json_value(&raw_data))))
    })? {
        let (message_id, part_value) = row?;
        grouped_parts
            .entry(message_id)
            .or_default()
            .push(part_value);
    }

    Ok(grouped_parts)
}

pub fn get_session(db_path: &Path, session_id: &str) -> Result<Session> {
    let conn = open_database(db_path)?;

    match get_schema(&conn)? {
        DatabaseSchema::Legacy => {
            let mut stmt = conn.prepare(
                "SELECT id, title, NULL as directory, message_count, prompt_tokens, completion_tokens, cost, updated_at, created_at
                 FROM sessions
                 WHERE id = ?1
                 LIMIT 1",
            )?;

            stmt.query_row([session_id], parse_session_row)
        }
        DatabaseSchema::Modern => {
            let mut stmt = conn.prepare(
                "SELECT s.id,
                        s.title,
                        s.directory,
                        CAST((SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS INTEGER) AS message_count,
                        CAST(s.tokens_input AS INTEGER) AS prompt_tokens,
                        CAST(s.tokens_output AS INTEGER) AS completion_tokens,
                        s.cost,
                        s.time_updated,
                        s.time_created
                 FROM session s
                 WHERE s.id = ?1
                 LIMIT 1",
            )?;

            stmt.query_row([session_id], parse_session_row)
        }
    }
}

pub fn get_messages(db_path: &Path, session_id: &str) -> Result<Vec<Message>> {
    let conn = open_database(db_path)?;

    match get_schema(&conn)? {
        DatabaseSchema::Legacy => {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, role, parts, model, created_at, finished_at
                 FROM messages
                 WHERE session_id = ?1
                 ORDER BY created_at ASC",
            )?;

            let messages = stmt
                .query_map([session_id], |row| {
                    Ok(Message {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        role: row.get(2)?,
                        parts: row.get(3)?,
                        model: row.get(4)?,
                        created_at: row.get(5)?,
                        finished_at: row.get(6)?,
                    })
                })?
                .filter_map(|message| message.ok())
                .collect();

            Ok(messages)
        }
        DatabaseSchema::Modern => {
            let parts_by_message = load_modern_parts(&conn, session_id)?;
            let mut stmt = conn.prepare(
                "SELECT id, session_id, time_created, data
                 FROM message
                 WHERE session_id = ?1
                 ORDER BY time_created ASC",
            )?;

            let messages = stmt
                .query_map([session_id], |row| {
                    let id: String = row.get(0)?;
                    let session_id: String = row.get(1)?;
                    let created_at: i64 = row.get(2)?;
                    let raw_data: String = row.get(3)?;
                    let (role, model, finished_at) = parse_message_metadata(&raw_data);

                    let parts = parts_by_message
                        .get(&id)
                        .cloned()
                        .filter(|items| !items.is_empty())
                        .unwrap_or_else(|| vec![wrap_part_value(parse_json_value(&raw_data))]);

                    Ok(Message {
                        id,
                        session_id,
                        role,
                        parts: serde_json::to_string(&parts).unwrap_or_else(|_| "[]".to_string()),
                        model,
                        created_at,
                        finished_at,
                    })
                })?
                .filter_map(|message| message.ok())
                .collect();

            Ok(messages)
        }
    }
}

pub fn get_all_sessions(db_path: &Path) -> Result<Vec<Session>> {
    let conn = open_database(db_path)?;

    match get_schema(&conn)? {
        DatabaseSchema::Legacy => {
            let mut stmt = conn.prepare(
                "SELECT id, title, NULL as directory, message_count, prompt_tokens, completion_tokens, cost, updated_at, created_at
                 FROM sessions
                 ORDER BY updated_at DESC",
            )?;

            let sessions = stmt
                .query_map([], parse_session_row)?
                .filter_map(|session| session.ok())
                .collect();

            Ok(sessions)
        }
        DatabaseSchema::Modern => {
            let mut stmt = conn.prepare(
                "SELECT s.id,
                        s.title,
                        s.directory,
                        CAST((SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS INTEGER) AS message_count,
                        CAST(s.tokens_input AS INTEGER) AS prompt_tokens,
                        CAST(s.tokens_output AS INTEGER) AS completion_tokens,
                        s.cost,
                        s.time_updated,
                        s.time_created
                 FROM session s
                 ORDER BY s.time_updated DESC",
            )?;

            let sessions = stmt
                .query_map([], parse_session_row)?
                .filter_map(|session| session.ok())
                .collect();

            Ok(sessions)
        }
    }
}

pub fn get_session_todos(db_path: &Path, session_id: &str) -> Result<Vec<TodoItem>> {
    let conn = open_database(db_path)?;

    if !table_exists(&conn, "todo")? {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT session_id, content, status, priority, position, time_created, time_updated
         FROM todo
         WHERE session_id = ?1
         ORDER BY position ASC",
    )?;

    let todos = stmt
        .query_map([session_id], |row| {
            Ok(TodoItem {
                session_id: row.get(0)?,
                content: row.get(1)?,
                status: row.get(2)?,
                priority: row.get(3)?,
                position: row.get(4)?,
                time_created: row.get(5)?,
                time_updated: row.get(6)?,
            })
        })?
        .filter_map(|todo| todo.ok())
        .collect();

    Ok(todos)
}

pub fn get_all_todos(db_path: &Path) -> Result<HashMap<String, Vec<TodoItem>>> {
    let conn = open_database(db_path)?;

    if !table_exists(&conn, "todo")? {
        return Ok(HashMap::new());
    }

    let mut stmt = conn.prepare(
        "SELECT session_id, content, status, priority, position, time_created, time_updated
         FROM todo
         ORDER BY session_id, position ASC",
    )?;

    let mut result: HashMap<String, Vec<TodoItem>> = HashMap::new();

    let rows = stmt
        .query_map([], |row| {
            Ok(TodoItem {
                session_id: row.get(0)?,
                content: row.get(1)?,
                status: row.get(2)?,
                priority: row.get(3)?,
                position: row.get(4)?,
                time_created: row.get(5)?,
                time_updated: row.get(6)?,
            })
        })?;

    for row in rows {
        if let Ok(todo) = row {
            result
                .entry(todo.session_id.clone())
                .or_default()
                .push(todo);
        }
    }

    Ok(result)
}
