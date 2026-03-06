use crate::ssh;
use libc::{S_IFDIR, S_IFMT};
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum SftpError {
    InvalidSession(String),
    ReadFailed(String),
    InvalidPath(String),
}

impl std::fmt::Display for SftpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSession(m) => write!(f, "Invalid session: {}", m),
            Self::ReadFailed(m) => write!(f, "SFTP read failed: {}", m),
            Self::InvalidPath(m) => write!(f, "Invalid path: {}", m),
        }
    }
}

impl std::error::Error for SftpError {}

#[derive(Debug, Clone, Serialize)]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub mtime: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadSftpDirectoryResult {
    pub entries: Vec<SftpEntry>,
    /// Path actually used for listing (after realpath or fallback). Frontend should set currentPath to this.
    pub path_used: String,
}

fn is_dir_from_perm(perm: Option<u32>) -> bool {
    let Some(perm) = perm else { return false };
    (perm & (S_IFMT as u32)) == (S_IFDIR as u32)
}

fn permission_denied_hint(path: &str) -> &'static str {
    // We can't reliably detect remote OS, but macOS commonly blocks remote sshd/sftp-server
    // from accessing privacy-protected folders (TCC).
    // Keep this short; frontend shows a more detailed, localized hint.
    let lower = path.to_lowercase();
    let looks_like_macos_path = path.starts_with("/Users/") || lower.contains("/desktop") || lower.contains("/downloads")
        || lower.contains("/documents") || lower.contains("/music") || lower.contains("/pictures");
    if looks_like_macos_path {
        " If the remote is macOS, enable “Allow full disk access for remote users” in System Settings → General → Sharing → Remote Login (i), then restart Remote Login."
    } else {
        ""
    }
}

#[tauri::command]
pub async fn read_sftp_directory(
    session_id: String,
    path: String,
    ssh_manager: State<'_, Arc<ssh::SshSessionManager>>,
) -> Result<ReadSftpDirectoryResult, SftpError> {
    if path.trim().is_empty() {
        return Err(SftpError::InvalidPath("Path is required".into()));
    }

    let session = ssh_manager
        .get_sftp_session(&session_id)
        .ok_or_else(|| SftpError::InvalidSession("Session not found".into()))?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        let sftp = session.sftp().map_err(|e| SftpError::ReadFailed(e.to_string()))?;
        let path_trimmed = path.trim().to_string();
        let target_path = Path::new(&path_trimmed);

        let (dir_path, path_used): (String, String) = if target_path == Path::new(".")
            || target_path == Path::new("~")
        {
            // Try realpath("~") then realpath("."). If both fail, do not try "/" (often permission denied);
            // return error so user can enter path manually (e.g. /home/username).
            let resolved = sftp
                .realpath(Path::new("~"))
                .or_else(|_| sftp.realpath(Path::new(".")));
            match resolved {
                Ok(p) => {
                    let s = p.to_string_lossy().into_owned();
                    (s.clone(), s)
                }
                Err(_) => {
                    return Err(SftpError::ReadFailed(
                        "Could not resolve home path. Enter path manually in the path field (e.g. /home/username)."
                            .to_string(),
                    ));
                }
            }
        } else {
            (path_trimmed.clone(), path_trimmed)
        };

        let path_for_read = Path::new(&dir_path);
        let items = sftp.readdir(path_for_read).map_err(|e| {
            let msg = e.to_string();
            let hint = if msg.contains("permission denied") && (dir_path == "/" || dir_path == "~" || dir_path == ".") {
                " Try entering your home path manually (e.g. /home/username)."
            } else {
                ""
            };
            let mac_hint = if msg.contains("permission denied") {
                permission_denied_hint(&dir_path)
            } else {
                ""
            };
            SftpError::ReadFailed(format!("{}{}{}", msg, hint, mac_hint))
        })?;

        let mut entries: Vec<SftpEntry> = items
            .into_iter()
            .filter_map(|(p, stat)| {
                let name = p.file_name()?.to_string_lossy().to_string();
                let path = p.to_string_lossy().to_string();
                Some(SftpEntry {
                    name,
                    path,
                    is_dir: is_dir_from_perm(stat.perm),
                    size: stat.size,
                    mtime: stat.mtime,
                })
            })
            .collect();

        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok::<_, SftpError>(ReadSftpDirectoryResult {
            entries,
            path_used,
        })
    })
    .await
    .map_err(|e| SftpError::ReadFailed(e.to_string()))??;

    Ok(result)
}

