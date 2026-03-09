use crate::ssh;
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;

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
    let method = if payload.auth_method.eq_ignore_ascii_case("agent")
        || payload.auth_method.eq_ignore_ascii_case("ssh_agent")
        || payload.auth_method.eq_ignore_ascii_case("sshagent")
    {
        ssh::AuthMethod::Agent
    } else if payload.auth_method.eq_ignore_ascii_case("private_key")
        || payload.auth_method.eq_ignore_ascii_case("privatekey")
        || payload.auth_method.eq_ignore_ascii_case("private_key_path")
        || payload.auth_method.eq_ignore_ascii_case("privatekeypath")
        || payload.auth_method.eq_ignore_ascii_case("privatekey")
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
        ssh::AuthMethod::Agent => ssh::AuthPayload::with_agent(),
    };
    Ok(auth)
}

#[tauri::command]
pub async fn establish_ssh_connection(
    payload: EstablishSshConnectionPayload,
    manager: State<'_, Arc<ssh::SshSessionManager>>,
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

    let result = tauri::async_runtime::spawn_blocking(move || {
        // First connection: shell/PTY.
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
            )?;
            (target_sess, Some(bastion_sess))
        } else {
            let sess = ssh::connect_direct(
                &target_host,
                target_port,
                &target_username,
                &target_auth,
            )?;
            (sess, None)
        };

        // Second connection: SFTP only (avoids "Would block" when shell channel is active).
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
            )?;
            (target_sess, Some(bastion_sess))
        } else {
            let sess = ssh::connect_direct(
                &target_host,
                target_port,
                &target_username,
                &target_auth,
            )?;
            (sess, None)
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

    let id = manager.register(result.0, result.1, result.2, result.3);
    Ok(id)
}
