use crate::{db, refresh_pet_state_from_app};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::path::PathBuf;
use std::sync::{mpsc::channel, Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub type WatchedPaths = Arc<Mutex<Vec<PathBuf>>>;

pub fn start_monitor(app: AppHandle, watched_paths: WatchedPaths) {
    let (tx, rx) = channel();

    let mut watcher =
        RecommendedWatcher::new(tx, Config::default()).expect("Failed to create file watcher");

    {
        let mut paths = watched_paths.lock().unwrap();
        for path in db::find_opencode_database_dirs() {
            if watcher.watch(&path, RecursiveMode::Recursive).is_ok() {
                paths.push(path);
            }
        }
    }

    loop {
        match rx.recv() {
            Ok(Ok(event)) => {
                if should_process_event(&event) {
                    refresh_pet_state_from_app(&app);
                    if let Err(e) = app.emit("database-changed", json!({"changed": true})) {
                        eprintln!("Failed to emit event: {}", e);
                    }
                }
            }
            Ok(Err(e)) => eprintln!("Watch error: {}", e),
            Err(e) => {
                eprintln!("Channel error: {}", e);
                break;
            }
        }
    }
}

fn should_process_event(event: &Event) -> bool {
    match event.kind {
        notify::EventKind::Modify(_) => event.paths.iter().any(|p| {
            p.extension()
                .map(|ext| ext == "db" || ext == "db-wal" || ext == "db-shm")
                .unwrap_or(false)
        }),
        _ => false,
    }
}
