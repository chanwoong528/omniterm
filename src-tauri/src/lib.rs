mod commands;
mod ssh;
mod terminal;

use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ssh_manager = Arc::new(ssh::SshSessionManager::new());
    let shell_manager = Arc::new(terminal::ShellWriteManager::new());

    // Background thread: reap SSH sessions that have been idle for more than 5 minutes.
    {
        let ssh_manager_for_cleanup = Arc::clone(&ssh_manager);
        thread::spawn(move || {
            let idle_limit = Duration::from_secs(5 * 60);
            loop {
                // Check every minute.
                thread::sleep(Duration::from_secs(60));
                let _ = ssh_manager_for_cleanup.reap_idle(idle_limit);
            }
        });
    }

    tauri::Builder::default()
        .manage(ssh_manager)
        .manage(shell_manager)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::ssh_connection::establish_ssh_connection,
            commands::ssh_connection::test_ssh_connection,
            commands::system::get_os_username,
            commands::system::get_platform,
            commands::terminal::spawn_pty_process,
            commands::terminal::write_to_terminal,
            commands::terminal::close_ssh_session,
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
