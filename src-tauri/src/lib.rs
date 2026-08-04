mod commands;
mod ssh;
mod terminal;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ssh_manager = Arc::new(ssh::SshSessionManager::new());
    let shell_manager = Arc::new(terminal::ShellWriteManager::new());
    // Port forwards own their SSH sessions, so they outlive terminal tabs:
    // closing a tab must not kill a tunnel a local client is using.
    let port_forward_manager = Arc::new(ssh::PortForwardManager::new());

    // Sessions are kept alive with SSH keepalives (sent from each shell
    // thread) instead of being reaped on idle: an idle-reaper kills sessions
    // the user is still watching (tail -f, long builds, slow uploads).

    tauri::Builder::default()
        .manage(ssh_manager)
        .manage(shell_manager)
        .manage(port_forward_manager)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::ssh_connection::establish_ssh_connection,
            commands::ssh_connection::test_ssh_connection,
            commands::system::get_os_username,
            commands::system::get_platform,
            commands::system::secure_key_permissions,
            commands::system::read_session_import_file,
            commands::system::key_file_exists,
            commands::terminal::spawn_pty_process,
            commands::terminal::resize_pty,
            commands::terminal::write_to_terminal,
            commands::terminal::close_ssh_session,
            commands::sftp::read_sftp_directory,
            commands::sftp_upload::upload_sftp_files,
            commands::sftp_ops::download_sftp_file,
            commands::sftp_ops::sftp_mkdir,
            commands::sftp_ops::sftp_rename,
            commands::sftp_ops::sftp_remove,
            commands::port_forward::start_port_forward,
            commands::port_forward::stop_port_forward,
            commands::port_forward::stop_port_forwards_for_session,
            commands::port_forward::list_port_forwards,
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
