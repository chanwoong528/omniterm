use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshAgentAddKeyPayload {
    pub key_path: String,
    /// Optional key passphrase. When provided, we use an SSH_ASKPASS helper to feed it to ssh-add.
    pub passphrase: Option<String>,
    /// macOS only: persist the key in Keychain (equivalent of `ssh-add --apple-use-keychain`).
    pub persist_to_keychain: Option<bool>,
}

fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

fn ssh_add_path() -> &'static str {
    // macOS default location; fallback to PATH resolution if unavailable.
    if Path::new("/usr/bin/ssh-add").exists() {
        "/usr/bin/ssh-add"
    } else {
        "ssh-add"
    }
}

fn supports_apple_use_keychain() -> bool {
    if !is_macos() {
        return false;
    }
    // Best-effort detection: parse `ssh-add -h` output.
    let out = Command::new(ssh_add_path())
        .arg("-h")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    let Ok(out) = out else { return false };
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    combined.contains("--apple-use-keychain")
}

fn unique_temp_dir(prefix: &str) -> Result<PathBuf, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join(format!("{}-{}", prefix, ts));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn run_ssh_add(
    key_path: &Path,
    passphrase: Option<&str>,
    persist_to_keychain: bool,
) -> Result<(), String> {
    if !key_path.exists() {
        return Err(format!("Key file not found: {}", key_path.display()));
    }

    let mut args: Vec<String> = Vec::new();
    if persist_to_keychain && is_macos() {
        if supports_apple_use_keychain() {
            args.push("--apple-use-keychain".into());
        } else {
            // Older OpenSSH on macOS used `-K`.
            args.push("-K".into());
        }
    }
    args.push(key_path.display().to_string());

    let mut cmd = Command::new(ssh_add_path());
    cmd.args(args);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // If passphrase is provided, force SSH_ASKPASS to supply it (works without a TTY).
    let temp_dir = if passphrase.is_some() {
        let dir = unique_temp_dir("omniterm-ssh-askpass")?;
        let pass_path = dir.join("passphrase.txt");
        let askpass_path = dir.join("askpass.sh");

        fs::write(&pass_path, passphrase.unwrap())
            .and_then(|_| fs::write(&askpass_path, format!("#!/bin/sh\ncat \"{}\"\n", pass_path.display())))
            .map_err(|e| e.to_string())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&askpass_path, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }

        cmd.env("SSH_ASKPASS", &askpass_path);
        cmd.env("SSH_ASKPASS_REQUIRE", "force");
        // Some OpenSSH builds require DISPLAY to be set for SSH_ASKPASS to activate.
        cmd.env("DISPLAY", "omniterm");
        Some(dir)
    } else {
        None
    };

    let mut child = cmd.spawn().map_err(|e| format!("Failed to run ssh-add: {}", e))?;

    // Basic timeout to avoid hanging forever.
    let timeout = Duration::from_secs(20);
    let start = std::time::Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let out = child
                .wait_with_output()
                .map_err(|e| format!("Failed to read ssh-add output: {}", e))?;
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            if !status.success() {
                if let Some(dir) = temp_dir {
                    let _ = fs::remove_dir_all(dir);
                }
                return Err(format!("ssh-add failed.\n{}\n{}", stdout, stderr).trim().to_string());
            }
            break;
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            if let Some(dir) = temp_dir {
                let _ = fs::remove_dir_all(dir);
            }
            return Err("ssh-add timed out".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    if let Some(dir) = temp_dir {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_agent_add_key(payload: SshAgentAddKeyPayload) -> Result<(), String> {
    let key_path = PathBuf::from(payload.key_path);
    let persist_to_keychain = payload.persist_to_keychain.unwrap_or(false);
    let passphrase = payload.passphrase.filter(|p| !p.is_empty());

    tauri::async_runtime::spawn_blocking(move || {
        run_ssh_add(&key_path, passphrase.as_deref(), persist_to_keychain)
    })
    .await
    .map_err(|e| e.to_string())?
}

