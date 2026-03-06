use crate::ssh;
use crate::terminal;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::State;

#[tauri::command]
pub fn spawn_pty_process(
    session_id: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
    app: AppHandle,
) -> Result<(), String> {
    let session = ssh_manager
        .get_target_session(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let (tx, rx) = std::sync::mpsc::channel();

    terminal::spawn_shell_thread(session, session_id.clone(), app, rx)?;
    shell_manager.register(session_id, tx);

    Ok(())
}

#[tauri::command]
pub fn write_to_terminal(
    session_id: String,
    data: String,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
) -> Result<(), String> {
    let sent = shell_manager.send(&session_id, data.into_bytes());
    if sent {
        Ok(())
    } else {
        Err("Terminal session not found or closed".to_string())
    }
}
