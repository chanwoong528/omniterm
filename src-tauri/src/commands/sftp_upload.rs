use crate::commands::sftp::{expand_remote_path, join_remote};
use crate::ssh;
use serde::Serialize;
use std::fs::File;
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum SftpUploadError {
    InvalidSession(String),
    InvalidPath(String),
    UploadFailed(String),
}

impl std::fmt::Display for SftpUploadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSession(m) => write!(f, "Invalid session: {}", m),
            Self::InvalidPath(m) => write!(f, "Invalid path: {}", m),
            Self::UploadFailed(m) => write!(f, "SFTP upload failed: {}", m),
        }
    }
}

impl std::error::Error for SftpUploadError {}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    pub local_path: String,
    pub remote_path: Option<String>,
    pub ok: bool,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn upload_sftp_files(
    session_id: String,
    remote_dir: String,
    local_paths: Vec<String>,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
) -> Result<Vec<UploadResult>, SftpUploadError> {
    if local_paths.is_empty() {
        return Err(SftpUploadError::InvalidPath(
            "No local files provided".into(),
        ));
    }

    let sftp_handle = ssh_manager
        .get_or_init_sftp(&session_id)
        .map_err(SftpUploadError::InvalidSession)?;
    let username = ssh_manager.get_username(&session_id).unwrap_or_default();
    let manager = Arc::clone(ssh_manager.inner());
    let session_id_for_touch = session_id.clone();

    let results = tauri::async_runtime::spawn_blocking(move || {
        let sftp = sftp_handle.lock().unwrap_or_else(|e| e.into_inner());
        let resolved_remote_dir = expand_remote_path(&sftp, &username, &remote_dir)
            .map_err(SftpUploadError::InvalidPath)?;

        let mut output: Vec<UploadResult> = Vec::with_capacity(local_paths.len());
        for local_path in local_paths {
            // Long batches must count as activity while in flight, not only at
            // the end — otherwise the idle reaper kills the session mid-upload.
            manager.touch(&session_id_for_touch);

            let local_path_buf = PathBuf::from(&local_path);
            let file_name = match local_path_buf.file_name().and_then(|n| n.to_str()) {
                Some(n) if !n.is_empty() => n.to_string(),
                _ => {
                    output.push(UploadResult {
                        local_path,
                        remote_path: None,
                        ok: false,
                        message: Some("Invalid local file name".into()),
                    });
                    continue;
                }
            };

            let meta = match std::fs::metadata(&local_path_buf) {
                Ok(m) => m,
                Err(e) => {
                    output.push(UploadResult {
                        local_path,
                        remote_path: None,
                        ok: false,
                        message: Some(e.to_string()),
                    });
                    continue;
                }
            };

            if meta.is_dir() {
                output.push(UploadResult {
                    local_path,
                    remote_path: None,
                    ok: false,
                    message: Some("Directories are not supported yet".into()),
                });
                continue;
            }

            let mut input_file = match File::open(&local_path_buf) {
                Ok(f) => f,
                Err(e) => {
                    output.push(UploadResult {
                        local_path,
                        remote_path: None,
                        ok: false,
                        message: Some(e.to_string()),
                    });
                    continue;
                }
            };

            let remote_path = join_remote(&resolved_remote_dir, &file_name);

            let mut remote_file = match sftp.create(std::path::Path::new(&remote_path)) {
                Ok(f) => f,
                Err(e) => {
                    output.push(UploadResult {
                        local_path,
                        remote_path: Some(remote_path),
                        ok: false,
                        message: Some(e.to_string()),
                    });
                    continue;
                }
            };

            // Verify the copy fully flushed and wrote the expected byte count;
            // ssh2::File's Drop swallows close errors, so success must not be
            // reported on io::copy alone.
            let copy_result = io::copy(&mut input_file, &mut remote_file)
                .and_then(|copied| remote_file.flush().map(|_| copied));
            match copy_result {
                Ok(copied) if copied == meta.len() => output.push(UploadResult {
                    local_path,
                    remote_path: Some(remote_path),
                    ok: true,
                    message: None,
                }),
                Ok(copied) => output.push(UploadResult {
                    local_path,
                    remote_path: Some(remote_path),
                    ok: false,
                    message: Some(format!(
                        "Incomplete upload: wrote {} of {} bytes",
                        copied,
                        meta.len()
                    )),
                }),
                Err(e) => output.push(UploadResult {
                    local_path,
                    remote_path: Some(remote_path),
                    ok: false,
                    message: Some(e.to_string()),
                }),
            }
        }

        Ok::<_, SftpUploadError>(output)
    })
    .await
    .map_err(|e| SftpUploadError::UploadFailed(e.to_string()))??;

    ssh_manager.touch(&session_id);

    Ok(results)
}
