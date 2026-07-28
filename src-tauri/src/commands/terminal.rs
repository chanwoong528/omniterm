use crate::ssh;
use crate::terminal;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::State;

#[tauri::command]
pub async fn spawn_pty_process(
    session_id: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
    app: AppHandle,
) -> Result<(), String> {
    let session = ssh_manager
        .get_target_session(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let (tx, rx) = std::sync::mpsc::channel();

    // Register first: this is the duplicate-spawn guard. A second call for the
    // same session fails here instead of spawning a competing shell thread.
    shell_manager.register(session_id.clone(), tx)?;
    if let Err(e) = terminal::spawn_shell_thread(session, session_id.clone(), app, rx) {
        shell_manager.close(&session_id);
        return Err(e);
    }

    Ok(())
}

/// Resizes the remote PTY to match the client terminal geometry.
#[tauri::command]
pub async fn resize_pty(
    session_id: String,
    cols: u32,
    rows: u32,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
) -> Result<(), String> {
    if cols == 0 || rows == 0 {
        return Err("Invalid terminal size".to_string());
    }
    if shell_manager.resize(&session_id, cols, rows) {
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

/// Closes an SSH session and its associated terminal writer, if present.
/// Not finding the session is not an error: it may already have been closed
/// or dropped on the backend side.
#[tauri::command]
pub async fn close_ssh_session(
    session_id: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
) -> Result<(), String> {
    shell_manager.close(&session_id);
    ssh_manager.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn write_to_terminal(
    session_id: String,
    data: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
) -> Result<(), String> {
    let sent = shell_manager.send_data(&session_id, data.into_bytes());
    if sent {
        // Any terminal input counts as activity; keep the session alive.
        ssh_manager.touch(&session_id);
        Ok(())
    } else {
        Err("Terminal session not found or closed".to_string())
    }
}
