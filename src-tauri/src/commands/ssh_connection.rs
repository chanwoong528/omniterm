use crate::ssh;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use tauri::{Emitter, State};

#[derive(Debug, Deserialize)]
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
    } else {
        ssh::AuthMethod::Password
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

        let (sftp_session, sftp_bastion) = if let Some((b_host, b_port, b_user, b_auth)) = bastion_params {
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
        on_progress("SFTP connection ready");

        Ok::<_, ssh::SshConnectionError>((
            target_session,
            sftp_session,
            bastion_session,
            sftp_bastion,
        ))
    })
    .await
    .map_err(|e| ssh::SshConnectionError::TargetConnectionFailed(e.to_string()))??;

    let id = manager.register(result.0, result.1, result.2, result.3);
    let _ = app.emit("ssh-connection-progress", format!("Session registered: {}", &id[..8]));
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

    let target_host = payload.target.host.trim();
    let target_port = payload.target.port;
    let target_user = payload.target.username.trim();
    if target_host.is_empty() || target_user.is_empty() {
        return Err("Target host and username required.".into());
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
        let proxy_cmd = if b_port == 22 {
            format!(
                "ssh -W %h:%p -i {} {}@{}",
                bastion_key, b_user, b_host
            )
        } else {
            format!(
                "ssh -W %h:%p -i {} -p {} {}@{}",
                bastion_key, b_port, b_user, b_host
            )
        };
        cmd.arg("-o").arg(format!("ProxyCommand={}", proxy_cmd));
    }
    cmd.arg(format!("{}@{}", target_user, target_host));
    cmd.arg("echo");
    cmd.arg("ok");

    let output = cmd.output().map_err(|e| format!("Failed to run ssh: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let ok = output.status.success();

    Ok(TestSshConnectionResult { ok, stdout, stderr })
}
