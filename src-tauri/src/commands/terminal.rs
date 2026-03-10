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

/// Closes an SSH session and its associated terminal writer, if present.
#[tauri::command]
pub fn close_ssh_session(
    session_id: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
) -> Result<(), String> {
    let had_ssh = ssh_manager.remove(&session_id);
    let had_shell = shell_manager.remove(&session_id);

    if had_ssh || had_shell {
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
pub fn write_to_terminal(
    session_id: String,
    data: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
    shell_manager: State<'_, Arc<terminal::ShellWriteManager>>,
) -> Result<(), String> {
    let sent = shell_manager.send(&session_id, data.into_bytes());
    if sent {
        // Any terminal input counts as activity; keep the session alive.
        ssh_manager.touch(&session_id);
        Ok(())
    } else {
        Err("Terminal session not found or closed".to_string())
    }
}
