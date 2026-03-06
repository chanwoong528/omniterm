use crate::ssh;
use serde::Serialize;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
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

fn resolve_remote_dir(sftp: &ssh2::Sftp, input: &str) -> Result<String, SftpUploadError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(SftpUploadError::InvalidPath(
            "Remote directory is required".into(),
        ));
    }
    let path = Path::new(trimmed);
    if path == Path::new("~") || path == Path::new(".") {
        let resolved = sftp
            .realpath(Path::new("~"))
            .or_else(|_| sftp.realpath(Path::new(".")))
            .map_err(|e| SftpUploadError::InvalidPath(e.to_string()))?;
        return Ok(resolved.to_string_lossy().into_owned());
    }
    Ok(trimmed.to_string())
}

fn join_remote_path(remote_dir: &str, file_name: &str) -> String {
    let file_name = file_name.replace('/', "");
    if remote_dir.ends_with('/') {
        format!("{}{}", remote_dir, file_name)
    } else {
        format!("{}/{}", remote_dir, file_name)
    }
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

    let session = ssh_manager
        .get_sftp_session(&session_id)
        .ok_or_else(|| SftpUploadError::InvalidSession("Session not found".into()))?;

    let results = tauri::async_runtime::spawn_blocking(move || {
        let sftp = session
            .sftp()
            .map_err(|e| SftpUploadError::UploadFailed(e.to_string()))?;
        let resolved_remote_dir = resolve_remote_dir(&sftp, &remote_dir)?;

        let mut output: Vec<UploadResult> = Vec::with_capacity(local_paths.len());
        for local_path in local_paths {
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

            let remote_path = join_remote_path(&resolved_remote_dir, &file_name);
            let remote_path_buf = Path::new(&remote_path);

            let mut remote_file = match sftp.create(remote_path_buf) {
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

            let copied = io::copy(&mut input_file, &mut remote_file);
            match copied {
                Ok(_) => output.push(UploadResult {
                    local_path,
                    remote_path: Some(remote_path),
                    ok: true,
                    message: None,
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

    Ok(results)
}

