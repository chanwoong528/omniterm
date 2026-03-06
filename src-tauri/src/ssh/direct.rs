use crate::ssh::auth::AuthPayload;
use crate::ssh::error::SshConnectionError;
use ssh2::Session;
use std::net::TcpStream;
use std::path::Path;

const CONNECT_TIMEOUT_MS: u32 = 15_000;

/// Direct SSH connection (no bastion).
/// Caller must ensure auth payload matches the chosen method.
pub fn connect_direct(
    host: &str,
    port: u16,
    username: &str,
    auth: &AuthPayload,
) -> Result<Session, SshConnectionError> {
    let address = format!("{}:{}", host, port);
    let tcp = TcpStream::connect(&address).map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("{}: {}", address, e))
    })?;
    tcp.set_read_timeout(Some(std::time::Duration::from_millis(CONNECT_TIMEOUT_MS as u64)))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    tcp.set_write_timeout(Some(std::time::Duration::from_millis(CONNECT_TIMEOUT_MS as u64)))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;

    let mut sess = Session::new().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Session::new: {}", e))
    })?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Handshake: {}", e))
    })?;
    sess.set_timeout(CONNECT_TIMEOUT_MS);

    authenticate_session(&mut sess, username, auth, |e| {
        SshConnectionError::TargetAuthFailed(e.to_string())
    })?;

    Ok(sess)
}

pub fn authenticate_session<F>(
    sess: &mut Session,
    username: &str,
    auth: &AuthPayload,
    into_error: F,
) -> Result<(), SshConnectionError>
where
    F: Fn(ssh2::Error) -> SshConnectionError,
{
    match &auth.method {
        crate::ssh::auth::AuthMethod::Password => {
            let password = auth
                .password
                .as_deref()
                .ok_or_else(|| into_error(ssh2::Error::new(ssh2::ErrorCode::Session(-1), "Password required")))?;
            sess.userauth_password(username, password)
                .map_err(&into_error)?;
        }
        crate::ssh::auth::AuthMethod::PrivateKey => {
            let path = auth
                .private_key_path
                .as_deref()
                .ok_or_else(|| SshConnectionError::InvalidConfig("Private key path required".into()))?;
            let path = Path::new(path);
            sess.userauth_pubkey_file(username, None, path, None)
                .map_err(&into_error)?;
        }
    }
    if !sess.authenticated() {
        return Err(into_error(ssh2::Error::new(
            ssh2::ErrorCode::Session(-1),
            "Authentication did not succeed",
        )));
    }
    Ok(())
}
