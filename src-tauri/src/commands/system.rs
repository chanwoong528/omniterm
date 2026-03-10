/// Returns the current OS username (e.g. for pre-filling localhost test).
/// Uses USER on Unix, USERNAME on Windows.
#[tauri::command]
pub fn get_os_username() -> String {
    #[cfg(unix)]
    return std::env::var("USER").unwrap_or_else(|_| String::new());
    #[cfg(windows)]
    return std::env::var("USERNAME").unwrap_or_else(|_| String::new());
}

/// Returns the OS platform for UI adaptation: "darwin" | "win32" | "linux".
#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    return "darwin".into();
    #[cfg(target_os = "windows")]
    return "win32".into();
    #[cfg(target_os = "linux")]
    return "linux".into();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown".into();
}
