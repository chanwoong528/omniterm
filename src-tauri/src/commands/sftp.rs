use crate::ssh;
use serde::Serialize;
use ssh2::Sftp;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

// SFTP protocol file-mode bits. These are POSIX wire values defined by the
// protocol itself, independent of the client OS (libc's constants differ on
// Windows, so they must not be used here).
const S_IFMT: u32 = 0o170000;
const S_IFDIR: u32 = 0o040000;
const S_IFLNK: u32 = 0o120000;

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
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: Option<u64>,
    pub mtime: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadSftpDirectoryResult {
    pub entries: Vec<SftpEntry>,
    /// Absolute path actually used for listing (after home resolution).
    /// Frontend must set currentPath to this.
    pub path_used: String,
}

fn mode_is_dir(perm: Option<u32>) -> bool {
    matches!(perm, Some(p) if (p & S_IFMT) == S_IFDIR)
}

fn mode_is_symlink(perm: Option<u32>) -> bool {
    matches!(perm, Some(p) if (p & S_IFMT) == S_IFLNK)
}

/// Joins remote paths as strings. `std::path::Path::join` must not be used for
/// remote paths: on a Windows client it inserts `\`.
pub(crate) fn join_remote(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{}{}", dir, name)
    } else {
        format!("{}/{}", dir, name)
    }
}

/// Resolves the remote home directory with a fallback chain:
/// 1. `realpath(".")` — works on OpenSSH (note: `realpath("~")` does NOT; SFTP
///    has no shell, so `~` is a literal filename there).
/// 2. `/home/<username>` then `/Users/<username>` if they exist.
/// 3. `/` as a last resort, if it is listable.
pub(crate) fn resolve_home_dir(sftp: &Sftp, username: &str) -> Option<String> {
    if let Ok(p) = sftp.realpath(Path::new(".")) {
        let s = p.to_string_lossy().into_owned();
        if !s.is_empty() {
            return Some(s);
        }
    }
    if !username.is_empty() {
        let candidates = [format!("/home/{}", username), format!("/Users/{}", username)];
        for candidate in candidates {
            let is_dir = sftp
                .stat(Path::new(&candidate))
                .map(|s| s.is_dir())
                .unwrap_or(false);
            if is_dir {
                return Some(candidate);
            }
        }
    }
    if sftp.opendir(Path::new("/")).is_ok() {
        return Some("/".to_string());
    }
    None
}

/// Expands `.`, `~`, and `~/sub/dir` into an absolute remote path.
/// Other inputs are passed through trimmed.
pub(crate) fn expand_remote_path(
    sftp: &Sftp,
    username: &str,
    input: &str,
) -> Result<String, String> {
    let trimmed = input.trim();
    let no_home_err = || {
        "Could not resolve home path. Enter an absolute path manually (e.g. /home/username)."
            .to_string()
    };
    if trimmed.is_empty() || trimmed == "." || trimmed == "~" || trimmed == "~/" {
        return resolve_home_dir(sftp, username).ok_or_else(no_home_err);
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        let home = resolve_home_dir(sftp, username).ok_or_else(no_home_err)?;
        return Ok(join_remote(&home, rest));
    }
    if let Some(rest) = trimmed.strip_prefix("./") {
        let home = resolve_home_dir(sftp, username).ok_or_else(no_home_err)?;
        return Ok(join_remote(&home, rest));
    }
    Ok(trimmed.to_string())
}

fn permission_denied_hint(path: &str) -> &'static str {
    // We can't reliably detect remote OS, but macOS commonly blocks remote sshd/sftp-server
    // from accessing privacy-protected folders (TCC).
    // Keep this short; frontend shows a more detailed, localized hint.
    let lower = path.to_lowercase();
    let looks_like_macos_path = path.starts_with("/Users/")
        || lower.contains("/desktop")
        || lower.contains("/downloads")
        || lower.contains("/documents")
        || lower.contains("/music")
        || lower.contains("/pictures");
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

    let sftp_handle = ssh_manager
        .get_or_init_sftp(&session_id)
        .map_err(SftpError::InvalidSession)?;
    let username = ssh_manager.get_username(&session_id).unwrap_or_default();

    // Count the listing as activity up front so a slow listing is not reaped mid-flight.
    ssh_manager.touch(&session_id);

    let result = tauri::async_runtime::spawn_blocking(move || {
        let sftp = sftp_handle.lock().unwrap_or_else(|e| e.into_inner());

        let dir_path = expand_remote_path(&sftp, &username, &path).map_err(SftpError::ReadFailed)?;

        let items = sftp.readdir(Path::new(&dir_path)).map_err(|e| {
            let msg = e.to_string();
            let lower = msg.to_lowercase();
            let is_permission_denied = lower.contains("permission denied");
            let hint = if is_permission_denied && dir_path == "/" {
                " Try entering your home path manually (e.g. /home/username)."
            } else {
                ""
            };
            let mac_hint = if is_permission_denied {
                permission_denied_hint(&dir_path)
            } else {
                ""
            };
            SftpError::ReadFailed(format!("{}{}{}", msg, hint, mac_hint))
        })?;

        let mut entries: Vec<SftpEntry> = items
            .into_iter()
            .filter_map(|(p, stat)| {
                let name = match p.file_name() {
                    Some(n) => n.to_string_lossy().to_string(),
                    None => p.to_string_lossy().to_string(),
                };
                if name.is_empty() || name == "." || name == ".." {
                    return None;
                }
                // Build the remote path by string concatenation; readdir's
                // PathBuf uses the client OS separator (`\` on Windows).
                let entry_path = join_remote(&dir_path, &name);
                let is_symlink = mode_is_symlink(stat.perm);
                // READDIR returns lstat attributes: a symlinked directory shows
                // up as S_IFLNK. Follow the link (stat) to classify it, so
                // symlinked dirs stay navigable. Same when perm is missing.
                let is_dir = if is_symlink || stat.perm.is_none() {
                    sftp.stat(Path::new(&entry_path))
                        .map(|s| s.is_dir())
                        .unwrap_or_else(|_| mode_is_dir(stat.perm))
                } else {
                    mode_is_dir(stat.perm)
                };
                Some(SftpEntry {
                    name,
                    path: entry_path,
                    is_dir,
                    is_symlink,
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
            path_used: dir_path,
        })
    })
    .await
    .map_err(|e| SftpError::ReadFailed(e.to_string()))??;

    ssh_manager.touch(&session_id);

    Ok(result)
}
