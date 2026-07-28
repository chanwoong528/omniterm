use crate::ssh;
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{Emitter, State};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerConfigPayload {
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_id: Option<String>,
    /// 키 매니저에 등록된 경로(storageKey) 또는 로컬 경로. Private Key 인증 시 필수.
    private_key_path: Option<String>,
}

// Manual Debug: the plaintext password must never reach logs or panic messages.
impl std::fmt::Debug for ServerConfigPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServerConfigPayload")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("username", &self.username)
            .field("auth_method", &self.auth_method)
            .field("password", &self.password.as_ref().map(|_| "[REDACTED]"))
            .field("private_key_id", &self.private_key_id)
            .field("private_key_path", &self.private_key_path)
            .finish()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstablishSshConnectionPayload {
    target: ServerConfigPayload,
    use_bastion: bool,
    bastion: Option<ServerConfigPayload>,
}

fn server_config_to_auth(payload: &ServerConfigPayload) -> Result<ssh::AuthPayload, ssh::SshConnectionError> {
    let method = if payload.auth_method.eq_ignore_ascii_case("private_key")
        || payload.auth_method.eq_ignore_ascii_case("privatekey")
        || payload.auth_method.eq_ignore_ascii_case("private_key_path")
        || payload.auth_method.eq_ignore_ascii_case("privatekeypath")
    {
        ssh::AuthMethod::PrivateKey
    } else if payload.auth_method.eq_ignore_ascii_case("password") {
        ssh::AuthMethod::Password
    } else {
        // A typo must not silently degrade to password auth — that produces a
        // baffling "Password required" instead of naming the real problem.
        return Err(ssh::SshConnectionError::InvalidConfig(format!(
            "Unsupported auth method: {}",
            payload.auth_method
        )));
    };

    let auth = match method {
        ssh::AuthMethod::Password => {
            let password = payload
                .password
                .clone()
                .ok_or_else(|| ssh::SshConnectionError::InvalidConfig("Password required".into()))?;
            ssh::AuthPayload::with_password(password)
        }
        ssh::AuthMethod::PrivateKey => {
            let path = payload
                .private_key_path
                .clone()
                .or_else(|| payload.private_key_id.clone())
                .ok_or_else(|| {
                    ssh::SshConnectionError::InvalidConfig(
                        "Private key path or key id required".into(),
                    )
                })?;
            ssh::AuthPayload::with_private_key(path)
        }
    };
    Ok(auth)
}

#[tauri::command]
pub async fn establish_ssh_connection(
    payload: EstablishSshConnectionPayload,
    manager: State<'_, Arc<ssh::SshSessionManager>>,
    app: tauri::AppHandle,
) -> Result<String, ssh::SshConnectionError> {
    let target_auth = server_config_to_auth(&payload.target)?;
    let use_bastion = payload.use_bastion;
    let target_host = payload.target.host.clone();
    let target_port = payload.target.port;
    let target_username = payload.target.username.clone();

    let bastion_params = if use_bastion {
        let b = payload.bastion.ok_or_else(|| {
            ssh::SshConnectionError::InvalidConfig(
                "Bastion config required when use_bastion is true".into(),
            )
        })?;
        let bastion_auth = server_config_to_auth(&b)?;
        Some((b.host, b.port, b.username, bastion_auth))
    } else {
        None
    };

    let manager = Arc::clone(manager.inner());
    let app_blocking = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let on_progress = |msg: &str| {
            let _ = app_blocking.emit("ssh-connection-progress", msg.to_string());
        };

        on_progress("── Establishing shell connection ──");

        let (target_session, bastion_session) = if let Some((b_host, b_port, b_user, b_auth)) = bastion_params.clone() {
            let (target_sess, bastion_sess) = ssh::connect_via_bastion(
                &b_host,
                b_port,
                &b_user,
                &b_auth,
                &target_host,
                target_port,
                &target_username,
                &target_auth,
                &on_progress,
            )?;
            (target_sess, Some(bastion_sess))
        } else {
            let sess = ssh::connect_direct(
                &target_host,
                target_port,
                &target_username,
                &target_auth,
                &on_progress,
            )?;
            (sess, None)
        };
        on_progress("Shell connection ready");

        on_progress("── Establishing SFTP connection ──");

        // SFTP is optional: a working shell session must not be thrown away
        // because the second (file-browser) connection failed.
        let sftp_result: Result<(ssh2::Session, Option<ssh2::Session>), ssh::SshConnectionError> =
            if let Some((b_host, b_port, b_user, b_auth)) = bastion_params {
                ssh::connect_via_bastion(
                    &b_host,
                    b_port,
                    &b_user,
                    &b_auth,
                    &target_host,
                    target_port,
                    &target_username,
                    &target_auth,
                    &on_progress,
                )
                .map(|(sess, bastion)| (sess, Some(bastion)))
            } else {
                ssh::connect_direct(
                    &target_host,
                    target_port,
                    &target_username,
                    &target_auth,
                    &on_progress,
                )
                .map(|sess| (sess, None))
            };
        let (sftp_session, sftp_bastion) = match sftp_result {
            Ok((sess, bastion)) => {
                on_progress("SFTP connection ready");
                (Some(sess), bastion)
            }
            Err(e) => {
                on_progress(&format!(
                    "Warning: SFTP connection failed ({}). Terminal will work; the file browser is unavailable.",
                    e
                ));
                (None, None)
            }
        };

        Ok::<_, ssh::SshConnectionError>((
            target_session,
            sftp_session,
            bastion_session,
            sftp_bastion,
        ))
    })
    .await
    .map_err(|e| ssh::SshConnectionError::TargetConnectionFailed(e.to_string()))??;

    let id = manager.register(
        result.0,
        result.1,
        result.2,
        result.3,
        payload.target.username.clone(),
    );
    let short_id = id.get(..8).unwrap_or(&id);
    let _ = app.emit("ssh-connection-progress", format!("Session registered: {}", short_id));
    Ok(id)
}

/// Result of running system `ssh` for connection test (same as CLI: ssh -i key -o ProxyCommand=... user@host echo ok).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSshConnectionResult {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

fn is_private_key_auth(payload: &ServerConfigPayload) -> bool {
    let m = payload.auth_method.to_lowercase();
    m == "private_key" || m == "privatekey" || m == "private_key_path" || m == "privatekeypath"
}

/// Hosts and usernames interpolated into ProxyCommand run through `/bin/sh`.
/// Restrict them to a safe charset instead of trusting quoting alone.
fn is_safe_ssh_word(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ':'))
}

/// Quotes the key path for ProxyCommand. The shell that runs ProxyCommand
/// differs per platform: /bin/sh on unix (POSIX single quotes), but cmd.exe
/// on Win32-OpenSSH, which treats single quotes as literal characters — the
/// path must be double-quoted there or ssh reads `-i 'C:/...'` verbatim.
#[cfg(not(windows))]
fn quote_proxy_key_path(value: &str) -> Result<String, String> {
    Ok(format!("'{}'", value.replace('\'', r"'\''")))
}

#[cfg(windows)]
fn quote_proxy_key_path(value: &str) -> Result<String, String> {
    if value.contains('"') {
        return Err("Key path contains unsupported characters.".into());
    }
    Ok(format!("\"{}\"", value))
}

const TEST_SSH_TIMEOUT: Duration = Duration::from_secs(45);

/// Runs the command with a hard deadline: the inner ProxyCommand ssh does not
/// inherit ConnectTimeout/BatchMode automatically, so without this a stuck
/// bastion hop wedges a worker forever.
fn run_with_timeout(mut cmd: Command) -> Result<std::process::Output, String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Failed to run ssh: {}", e))?;
    let deadline = Instant::now() + TEST_SSH_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map_err(|e| format!("Failed to collect ssh output: {}", e));
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "Connection test timed out after {}s",
                        TEST_SSH_TIMEOUT.as_secs()
                    ));
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Failed to wait for ssh: {}", e)),
        }
    }
}

#[tauri::command]
pub async fn test_ssh_connection(
    payload: EstablishSshConnectionPayload,
) -> Result<TestSshConnectionResult, String> {
    if !is_private_key_auth(&payload.target) {
        return Err("Test connection only supports private key authentication for target.".into());
    }
    let key_path = payload
        .target
        .private_key_path
        .as_deref()
        .or(payload.target.private_key_id.as_deref())
        .ok_or("Target private key path required for test.")?;

    let target_host = payload.target.host.trim().to_string();
    let target_port = payload.target.port;
    let target_user = payload.target.username.trim().to_string();
    if target_host.is_empty() || target_user.is_empty() {
        return Err("Target host and username required.".into());
    }
    if !is_safe_ssh_word(&target_host) || !is_safe_ssh_word(&target_user) {
        return Err("Target host/username contains unsupported characters.".into());
    }

    let mut cmd = Command::new("ssh");
    cmd.arg("-i").arg(key_path);
    cmd.arg("-o").arg("ConnectTimeout=15");
    cmd.arg("-o").arg("BatchMode=yes");
    cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-p").arg(target_port.to_string());
    if payload.use_bastion {
        let b = payload
            .bastion
            .as_ref()
            .ok_or("Bastion config required when use_bastion is true.")?;
        if !is_private_key_auth(b) {
            return Err("Test connection only supports private key authentication for bastion.".into());
        }
        let bastion_key = b
            .private_key_path
            .as_deref()
            .or(b.private_key_id.as_deref())
            .ok_or("Bastion private key path required for test.")?;
        let b_host = b.host.trim();
        let b_port = b.port;
        let b_user = b.username.trim();
        if b_host.is_empty() || b_user.is_empty() {
            return Err("Bastion host and username required.".into());
        }
        // ProxyCommand is executed via /bin/sh: every interpolated value must
        // be either charset-validated or shell-quoted, or a crafted username
        // becomes local command execution.
        if !is_safe_ssh_word(b_host) || !is_safe_ssh_word(b_user) {
            return Err("Bastion host/username contains unsupported characters.".into());
        }
        let proxy_cmd = format!(
            "ssh -W %h:%p -o BatchMode=yes -o ConnectTimeout=15 -i {} -p {} {}@{}",
            quote_proxy_key_path(bastion_key)?,
            b_port,
            b_user,
            b_host
        );
        cmd.arg("-o").arg(format!("ProxyCommand={}", proxy_cmd));
    }
    cmd.arg(format!("{}@{}", target_user, target_host));
    cmd.arg("echo");
    cmd.arg("ok");

    // Blocking wait loop — keep it off the async runtime's core threads.
    let output = tauri::async_runtime::spawn_blocking(move || run_with_timeout(cmd))
        .await
        .map_err(|e| e.to_string())??;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let ok = output.status.success();

    Ok(TestSshConnectionResult { ok, stdout, stderr })
}
