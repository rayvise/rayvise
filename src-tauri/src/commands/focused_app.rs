/// Returns the bundle identifier of the frontmost application.
/// Uses raw ObjC messaging to avoid MainThreadMarker requirements in background contexts.
pub fn get_focused_app_inner() -> Option<String> {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;

    unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace.is_null() {
            return None;
        }
        let front_app: *mut AnyObject = msg_send![workspace, frontmostApplication];
        if front_app.is_null() {
            return None;
        }
        let bundle_id: *mut NSString = msg_send![front_app, bundleIdentifier];
        if bundle_id.is_null() {
            return None;
        }
        Some((*bundle_id).to_string())
    }
}

/// Returns the PID of the frontmost application.
pub fn get_frontmost_pid() -> i32 {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace.is_null() {
            return -1;
        }
        let front_app: *mut AnyObject = msg_send![workspace, frontmostApplication];
        if front_app.is_null() {
            return -1;
        }
        let pid: i32 = msg_send![front_app, processIdentifier];
        pid
    }
}

/// Brings the target application to the foreground so synthetic paste
/// events are delivered to the originally focused app instead of Rayvise.
pub fn activate_app_inner(pid: i32) -> bool {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    if pid <= 0 {
        return false;
    }

    unsafe {
        let app: *mut AnyObject = msg_send![
            class!(NSRunningApplication),
            runningApplicationWithProcessIdentifier: pid
        ];
        if app.is_null() {
            return false;
        }

        let options = 1usize << 1;
        msg_send![app, activateWithOptions: options]
    }
}

#[tauri::command]
pub fn get_focused_app() -> Option<String> {
    get_focused_app_inner()
}

/// Re-activates the app with the given PID. Fire-and-forget; used to return
/// focus to the target app after a Tauri overlay window is created (which
/// briefly activates the Rayvise app on macOS).
#[tauri::command]
pub fn activate_app(app: tauri::AppHandle, target_pid: i32) {
    app.run_on_main_thread(move || {
        activate_app_inner(target_pid);
    })
    .ok();
}
