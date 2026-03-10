use crate::ssh::auth::{AuthMethod, AuthPayload};
use crate::ssh::error::SshConnectionError;
use ssh2::Session;
use std::net::TcpStream;
use std::path::PathBuf;

const CONNECT_TIMEOUT_MS: u32 = 15_000;

/// Returns the user's home directory for path expansion (cross-platform).
fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    return std::env::var_os("HOME").map(PathBuf::from);
    #[cfg(windows)]
    return std::env::var_os("USERPROFILE").map(PathBuf::from);
}

/// Expands leading `~` or `~/` to the user's home directory (Key Manager paths).
/// Works on macOS/Linux (HOME) and Windows (USERPROFILE).
fn expand_tilde(path: &str) -> PathBuf {
    let path = path.trim();
    if path == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from(path));
    }
    if path.starts_with("~/") {
        if let Some(home) = home_dir() {
            return home.join(path.trim_start_matches("~/"));
        }
    }
    PathBuf::from(path)
}

pub fn connect_direct(
    host: &str,
    port: u16,
    username: &str,
    auth: &AuthPayload,
    on_progress: &dyn Fn(&str),
) -> Result<Session, SshConnectionError> {
    let address = format!("{}:{}", host, port);
    on_progress(&format!("Connecting to {}...", address));

    let tcp = TcpStream::connect(&address).map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("{}: {}", address, e))
    })?;
    on_progress(&format!("TCP connection to {} established", address));

    tcp.set_read_timeout(Some(std::time::Duration::from_millis(CONNECT_TIMEOUT_MS as u64)))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    tcp.set_write_timeout(Some(std::time::Duration::from_millis(CONNECT_TIMEOUT_MS as u64)))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;

    let mut sess = Session::new().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Session::new: {}", e))
    })?;
    sess.set_tcp_stream(tcp);

    on_progress("SSH handshake in progress...");
    sess.handshake().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Handshake: {}", e))
    })?;
    on_progress("SSH handshake completed");

    sess.set_timeout(CONNECT_TIMEOUT_MS);

    authenticate_session(&mut sess, username, auth, on_progress, |e| {
        SshConnectionError::TargetAuthFailed(e.to_string())
    })?;

    Ok(sess)
}

pub fn authenticate_session<F>(
    sess: &mut Session,
    username: &str,
    auth: &AuthPayload,
    on_progress: &dyn Fn(&str),
    into_error: F,
) -> Result<(), SshConnectionError>
where
    F: Fn(ssh2::Error) -> SshConnectionError,
{
    let method_label = match &auth.method {
        AuthMethod::Password => "password",
        AuthMethod::PrivateKey => "private key",
    };
    on_progress(&format!("Authenticating '{}' via {}...", username, method_label));

    match &auth.method {
        AuthMethod::Password => {
            let password = auth
                .password
                .as_deref()
                .ok_or_else(|| into_error(ssh2::Error::new(ssh2::ErrorCode::Session(-1), "Password required")))?;
            sess.userauth_password(username, password)
                .map_err(&into_error)?;
        }
        AuthMethod::PrivateKey => {
            let path_str = auth
                .private_key_path
                .as_deref()
                .ok_or_else(|| SshConnectionError::InvalidConfig("Private key path required".into()))?;
            on_progress(&format!("Using key: {}", path_str));
            let path = expand_tilde(path_str);
            sess.userauth_pubkey_file(username, None, path.as_path(), None)
                .map_err(&into_error)?;
        }
    }
    if !sess.authenticated() {
        return Err(into_error(ssh2::Error::new(
            ssh2::ErrorCode::Session(-1),
            "Authentication did not succeed",
        )));
    }
    on_progress(&format!("Authenticated as '{}'", username));
    Ok(())
}
