/// Returns the current OS username (e.g. for pre-filling localhost test).
#[tauri::command]
pub fn get_os_username() -> String {
    std::env::var("USER").unwrap_or_else(|_| String::new())
}
