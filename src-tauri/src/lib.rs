mod commands;
mod ssh;
mod terminal;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ssh_manager = Arc::new(ssh::SshSessionManager::new());
    let shell_manager = Arc::new(terminal::ShellWriteManager::new());

    tauri::Builder::default()
        .manage(ssh_manager)
        .manage(shell_manager)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::ssh_connection::establish_ssh_connection,
            commands::ssh_agent::ssh_agent_add_key,
            commands::system::get_os_username,
            commands::terminal::spawn_pty_process,
            commands::terminal::write_to_terminal,
            commands::sftp::read_sftp_directory,
            commands::sftp_upload::upload_sftp_files,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
