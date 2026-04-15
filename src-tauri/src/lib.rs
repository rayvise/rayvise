use serde::Serialize;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
