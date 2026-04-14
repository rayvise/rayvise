use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod commands;

#[derive(Clone, Serialize)]
struct HotkeyPayload {
    app: String,
    selected_text: String,
    target_pid: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    page_url: Option<String>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let app = app.clone();
                        // Run entirely on the main thread so AppKit calls are safe,
                        // then emit from there — no channel or timeout needed.
                        app.clone()
                            .run_on_main_thread(move || {
                                let bundle_id = commands::focused_app::get_focused_app_inner()
                                    .unwrap_or_default();
                                let pid = commands::focused_app::get_frontmost_pid();
                                let text = commands::text::get_selected_text_inner(pid)
                                    .unwrap_or_default();
                                let app_for_emit = app.clone();
                                std::thread::spawn(move || {
                                    let page_url =
                                        commands::browser_url::try_get_active_tab_url(&bundle_id);
                                    app_for_emit
                                        .emit(
                                            "rayvise://hotkey-triggered",
                                            HotkeyPayload {
                                                app: bundle_id,
                                                selected_text: text,
                                                target_pid: pid,
                                                page_url,
                                            },
                                        )
                                        .ok();
                                });
                            })
                            .ok();
                    }
                })
                .build(),
        )
        .setup(|app| {
            let _ = migrate_legacy_app_data();
            app.global_shortcut().register("CmdOrCtrl+Control+R")?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::apps::list_apps,
            commands::apps::get_icon_base64,
            commands::apps::get_icon_base64_for_icns,
            commands::website_icons::fetch_website_icon,
            commands::focused_app::get_focused_app,
            commands::focused_app::activate_app,
            commands::text::get_selected_text,
            commands::text::write_text_back,
            commands::file_dialog::save_json_file,
            load_legacy_local_storage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

const LEGACY_DB_PATH: &str = "Library/Application Support/com.raypaste.raypaste/raypaste.db";
const CURRENT_DB_DIR: &str = "Library/Application Support/com.rayvise.rayvise";
const CURRENT_DB_PATH: &str = "Library/Application Support/com.rayvise.rayvise/rayvise.db";
const LEGACY_WEBKIT_DIR: &str = "Library/WebKit/Raypaste";
const CURRENT_WEBKIT_DIR: &str = "Library/WebKit/Rayvise";
const MIGRATION_MARKER: &str = "Library/Application Support/com.rayvise.rayvise/.legacy_rename_migration_v1";
const LEGACY_LOCAL_STORAGE_KEYS: [&str; 3] = ["raypaste-settings", "raypaste-prompts", "raypaste-apps"];

fn migrate_legacy_app_data() -> io::Result<()> {
    let home = match std::env::var("HOME") {
        Ok(home) if !home.is_empty() => PathBuf::from(home),
        _ => return Ok(()),
    };

    let marker_path = home.join(MIGRATION_MARKER);
    if marker_path.exists() {
        return Ok(());
    }

    fs::create_dir_all(home.join(CURRENT_DB_DIR))?;

    let legacy_db = home.join(LEGACY_DB_PATH);
    let current_db = home.join(CURRENT_DB_PATH);
    if should_copy_legacy_db(&legacy_db, &current_db)? {
        remove_sidecar_if_exists(&current_db.with_extension("db-shm"))?;
        remove_sidecar_if_exists(&current_db.with_extension("db-wal"))?;
        fs::copy(&legacy_db, &current_db)?;
    }

    let legacy_webkit = home.join(LEGACY_WEBKIT_DIR);
    let current_webkit = home.join(CURRENT_WEBKIT_DIR);
    merge_copy_dir(&legacy_webkit, &current_webkit)?;

    fs::write(marker_path, b"legacy rename migration complete\n")?;
    Ok(())
}

fn should_copy_legacy_db(legacy_db: &Path, current_db: &Path) -> io::Result<bool> {
    if !legacy_db.exists() {
        return Ok(false);
    }

    if !current_db.exists() {
        return Ok(true);
    }

    let legacy_size = fs::metadata(legacy_db)?.len();
    let current_size = fs::metadata(current_db)?.len();

    Ok(current_size < 128 * 1024 && legacy_size > current_size)
}

fn remove_sidecar_if_exists(path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[tauri::command]
fn load_legacy_local_storage() -> HashMap<String, String> {
    read_legacy_local_storage().unwrap_or_default()
}

fn read_legacy_local_storage() -> io::Result<HashMap<String, String>> {
    let home = match std::env::var("HOME") {
        Ok(home) if !home.is_empty() => PathBuf::from(home),
        _ => return Ok(HashMap::new()),
    };

    let mut results = HashMap::new();
    for webkit_dir in [home.join(LEGACY_WEBKIT_DIR), home.join(CURRENT_WEBKIT_DIR)] {
        collect_legacy_local_storage_from_webkit_dir(&webkit_dir, &mut results)?;
    }

    Ok(results)
}

fn collect_legacy_local_storage_from_webkit_dir(
    webkit_dir: &Path,
    results: &mut HashMap<String, String>,
) -> io::Result<()> {
    let default_dir = webkit_dir.join("WebsiteData/Default");
    if !default_dir.exists() {
        return Ok(());
    }

    for hash_dir in fs::read_dir(default_dir)? {
        let hash_dir = hash_dir?;
        let hash_path = hash_dir.path();
        if !hash_path.is_dir() {
            continue;
        }

        let nested_dir = hash_path.join(hash_dir.file_name());
        let sqlite_path = nested_dir.join("LocalStorage/localstorage.sqlite3");
        if !sqlite_path.exists() {
            continue;
        }

        let connection = match rusqlite::Connection::open_with_flags(
            &sqlite_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        ) {
            Ok(connection) => connection,
            Err(_) => continue,
        };

        for key in LEGACY_LOCAL_STORAGE_KEYS {
            if results.contains_key(key) {
                continue;
            }

            let value: Result<Vec<u8>, _> = connection.query_row(
                "SELECT value FROM ItemTable WHERE key = ?1 LIMIT 1",
                [key],
                |row| row.get(0),
            );

            if let Ok(value) = value {
                let decoded = decode_storage_blob(&value);
                results.insert(key.to_string(), decoded);
            }
        }

        if results.len() == LEGACY_LOCAL_STORAGE_KEYS.len() {
            break;
        }
    }

    Ok(())
}

fn decode_storage_blob(value: &[u8]) -> String {
    if value.len() >= 4 && value.iter().skip(1).step_by(4).all(|b| *b == 0)
        && value.iter().skip(2).step_by(4).all(|b| *b == 0)
        && value.iter().skip(3).step_by(4).all(|b| *b == 0)
    {
        let units = value
            .chunks_exact(4)
            .map(|chunk| u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .filter_map(char::from_u32)
            .collect::<String>();
        return units;
    }

    if value.len() >= 2 && value.iter().skip(1).step_by(2).all(|b| *b == 0) {
        let units = value
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16_lossy(&units);
    }

    if value.len() >= 2 && value.iter().step_by(2).all(|b| *b == 0) {
        let units = value
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16_lossy(&units);
    }

    String::from_utf8_lossy(value).into_owned()
}

fn merge_copy_dir(source: &Path, destination: &Path) -> io::Result<()> {
    if !source.exists() {
        return Ok(());
    }

    if source.is_file() {
        if !destination.exists() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source, destination)?;
        }
        return Ok(());
    }

    fs::create_dir_all(destination)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let entry_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        merge_copy_dir(&entry_path, &destination_path)?;
    }

    Ok(())
}
