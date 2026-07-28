//! SFTP file operations: download, mkdir, rename, remove.

use crate::commands::sftp::SftpError;
use crate::ssh;
use serde::Serialize;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use tauri::State;

const COPY_BUF_SIZE: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub remote_path: String,
    pub local_path: String,
    pub bytes: u64,
}

#[tauri::command]
pub async fn download_sftp_file(
    session_id: String,
    remote_path: String,
    local_path: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
) -> Result<DownloadResult, SftpError> {
    if remote_path.trim().is_empty() || local_path.trim().is_empty() {
        return Err(SftpError::InvalidPath("Remote and local paths are required".into()));
    }

    let sftp_handle = ssh_manager
        .get_or_init_sftp(&session_id)
        .map_err(SftpError::InvalidSession)?;
    let manager = Arc::clone(ssh_manager.inner());
    let session_id_for_touch = session_id.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let sftp = sftp_handle.lock().unwrap_or_else(|e| e.into_inner());
        manager.touch(&session_id_for_touch);

        let mut remote_file = sftp
            .open(Path::new(&remote_path))
            .map_err(|e| SftpError::ReadFailed(format!("{}: {}", remote_path, e)))?;
        let mut local_file = std::fs::File::create(&local_path)
            .map_err(|e| SftpError::ReadFailed(format!("{}: {}", local_path, e)))?;

        let mut buf = [0u8; COPY_BUF_SIZE];
        let mut total: u64 = 0;
        loop {
            let n = remote_file
                .read(&mut buf)
                .map_err(|e| SftpError::ReadFailed(e.to_string()))?;
            if n == 0 {
                break;
            }
            local_file
                .write_all(&buf[..n])
                .map_err(|e| SftpError::ReadFailed(e.to_string()))?;
            total += n as u64;
            manager.touch(&session_id_for_touch);
        }
        local_file
            .flush()
            .map_err(|e| SftpError::ReadFailed(e.to_string()))?;

        Ok::<_, SftpError>(DownloadResult {
            remote_path,
            local_path,
            bytes: total,
        })
    })
    .await
    .map_err(|e| SftpError::ReadFailed(e.to_string()))??;

    ssh_manager.touch(&session_id);
    Ok(result)
}

#[tauri::command]
pub async fn sftp_mkdir(
    session_id: String,
    path: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
) -> Result<(), SftpError> {
    if path.trim().is_empty() {
        return Err(SftpError::InvalidPath("Path is required".into()));
    }
    let sftp_handle = ssh_manager
        .get_or_init_sftp(&session_id)
        .map_err(SftpError::InvalidSession)?;
    ssh_manager.touch(&session_id);

    tauri::async_runtime::spawn_blocking(move || {
        let sftp = sftp_handle.lock().unwrap_or_else(|e| e.into_inner());
        sftp.mkdir(Path::new(&path), 0o755)
            .map_err(|e| SftpError::ReadFailed(format!("mkdir {}: {}", path, e)))
    })
    .await
    .map_err(|e| SftpError::ReadFailed(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_rename(
    session_id: String,
    from_path: String,
    to_path: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
) -> Result<(), SftpError> {
    if from_path.trim().is_empty() || to_path.trim().is_empty() {
        return Err(SftpError::InvalidPath("Both paths are required".into()));
    }
    let sftp_handle = ssh_manager
        .get_or_init_sftp(&session_id)
        .map_err(SftpError::InvalidSession)?;
    ssh_manager.touch(&session_id);

    tauri::async_runtime::spawn_blocking(move || {
        let sftp = sftp_handle.lock().unwrap_or_else(|e| e.into_inner());
        sftp.rename(Path::new(&from_path), Path::new(&to_path), None)
            .map_err(|e| SftpError::ReadFailed(format!("rename {}: {}", from_path, e)))
    })
    .await
    .map_err(|e| SftpError::ReadFailed(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_remove(
    session_id: String,
    path: String,
    is_dir: bool,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
) -> Result<(), SftpError> {
    if path.trim().is_empty() {
        return Err(SftpError::InvalidPath("Path is required".into()));
    }
    let sftp_handle = ssh_manager
        .get_or_init_sftp(&session_id)
        .map_err(SftpError::InvalidSession)?;
    ssh_manager.touch(&session_id);

    tauri::async_runtime::spawn_blocking(move || {
        let sftp = sftp_handle.lock().unwrap_or_else(|e| e.into_inner());
        let result = if is_dir {
            sftp.rmdir(Path::new(&path))
        } else {
            sftp.unlink(Path::new(&path))
        };
        result.map_err(|e| {
            let hint = if is_dir { " (directory must be empty)" } else { "" };
            SftpError::ReadFailed(format!("remove {}: {}{}", path, e, hint))
        })
    })
    .await
    .map_err(|e| SftpError::ReadFailed(e.to_string()))?
}
