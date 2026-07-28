use crate::ssh::auth::{AuthMethod, AuthPayload};
use crate::ssh::error::SshConnectionError;
use base64::Engine;
use ssh2::{CheckResult, HashType, HostKeyType, KnownHostFileKind, KnownHostKeyFormat, MethodType, Session};
use std::net::TcpStream;
use std::path::PathBuf;

// Windows runners / networks often need more time for SSH KEX/handshake.
// Keep a slightly higher timeout on Windows to avoid libssh2 socket send/recv failures during KEX.
#[cfg(windows)]
const CONNECT_TIMEOUT_MS: u32 = 60_000;
#[cfg(not(windows))]
const CONNECT_TIMEOUT_MS: u32 = 15_000;

/// Steady-state per-operation timeout after the connection is established.
/// The connect-phase timeout is too aggressive for long-running operations
/// (a huge readdir, a slow stat over a saturated tunnel).
pub(crate) const OPERATION_TIMEOUT_MS: u32 = 30_000;

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

    // Keep a handle to relax the socket timeouts after authentication:
    // libssh2's own session timeout governs steady-state operations.
    let tcp_for_later = tcp.try_clone().ok();

    let mut sess = Session::new().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Session::new: {}", e))
    })?;
    sess.set_tcp_stream(tcp);
    configure_session_methods(&mut sess, on_progress);

    on_progress("SSH handshake in progress...");
    sess.handshake().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Handshake: {}", e))
    })?;
    on_progress("SSH handshake completed");

    verify_host_key(&sess, host, port, on_progress)?;

    sess.set_timeout(CONNECT_TIMEOUT_MS);

    authenticate_session(&mut sess, username, auth, on_progress, |e| {
        SshConnectionError::TargetAuthFailed(e.to_string())
    })?;

    sess.set_timeout(OPERATION_TIMEOUT_MS);
    if let Some(tcp) = tcp_for_later {
        // Switch the socket to non-blocking once the connection is up. The
        // shell loop runs the session in non-blocking mode, and a blocking
        // socket would stall recv() indefinitely (frozen input, "transport
        // read"/"draining incoming flow" failures over bastion tunnels).
        // Blocking-mode operations (SFTP) still wait correctly: libssh2 polls
        // the socket honoring the session timeout above.
        let _ = tcp.set_nonblocking(true);
    }

    Ok(sess)
}

fn known_hosts_path() -> Option<PathBuf> {
    home_dir().map(|h| h.join(".ssh").join("known_hosts"))
}

fn host_key_fingerprint(sess: &Session) -> String {
    sess.host_key_hash(HashType::Sha256)
        .map(|hash| {
            format!(
                "SHA256:{}",
                base64::engine::general_purpose::STANDARD_NO_PAD.encode(hash)
            )
        })
        .unwrap_or_else(|| "unknown".to_string())
}

/// Verifies the server host key against `~/.ssh/known_hosts` with a
/// trust-on-first-use policy: unknown hosts are recorded on first contact,
/// but a CHANGED key aborts the connection — that is the MITM signal.
pub(crate) fn verify_host_key(
    sess: &Session,
    host: &str,
    port: u16,
    on_progress: &dyn Fn(&str),
) -> Result<(), SshConnectionError> {
    let (key, key_type) = sess.host_key().ok_or_else(|| {
        SshConnectionError::HostKeyVerificationFailed("Server presented no host key".into())
    })?;

    let mut known_hosts = sess
        .known_hosts()
        .map_err(|e| SshConnectionError::HostKeyVerificationFailed(e.to_string()))?;
    let path = known_hosts_path();
    if let Some(p) = &path {
        if p.exists() {
            let _ = known_hosts.read_file(p, KnownHostFileKind::OpenSSH);
        }
    }

    match known_hosts.check_port(host, port, key) {
        CheckResult::Match => {
            on_progress(&format!("Host key verified for {}:{}", host, port));
            Ok(())
        }
        CheckResult::Mismatch => Err(SshConnectionError::HostKeyVerificationFailed(format!(
            "HOST KEY CHANGED for {}:{} (fingerprint {}). Someone could be intercepting this connection. \
             If the server was legitimately reinstalled, remove its entry from ~/.ssh/known_hosts and reconnect.",
            host,
            port,
            host_key_fingerprint(sess)
        ))),
        CheckResult::NotFound | CheckResult::Failure => {
            on_progress(&format!(
                "Host key for {}:{} is not in known_hosts; trusting on first use ({})",
                host,
                port,
                host_key_fingerprint(sess)
            ));
            if matches!(key_type, HostKeyType::Unknown) {
                on_progress("Warning: unknown host key type; not persisting to known_hosts");
                return Ok(());
            }
            let format = KnownHostKeyFormat::from(key_type);
            let host_entry = if port == 22 {
                host.to_string()
            } else {
                format!("[{}]:{}", host, port)
            };
            if known_hosts
                .add(&host_entry, key, "added by omniterm", format)
                .is_ok()
            {
                if let Some(p) = &path {
                    if let Some(dir) = p.parent() {
                        let _ = std::fs::create_dir_all(dir);
                    }
                    if let Err(e) = known_hosts.write_file(p, KnownHostFileKind::OpenSSH) {
                        on_progress(&format!("Warning: could not persist known_hosts: {}", e));
                    }
                }
            }
            Ok(())
        }
    }
}

pub(crate) fn configure_session_methods(sess: &mut Session, on_progress: &dyn Fn(&str)) {
    // Prefer modern algorithms, but include legacy fallbacks for older bastion/targets.
    // This avoids "Unable to exchange encryption keys" with legacy-only servers.
    let kex = "curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,diffie-hellman-group14-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,diffie-hellman-group14-sha1,diffie-hellman-group1-sha1";
    let hostkey = "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,rsa-sha2-512,rsa-sha2-256,ssh-rsa";
    let cipher = "chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr,aes256-cbc,aes192-cbc,aes128-cbc";
    let mac = "hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256,hmac-sha1";

    for (label, method, prefs) in [
        ("kex", MethodType::Kex, kex),
        ("hostkey", MethodType::HostKey, hostkey),
        ("cipher_cs", MethodType::CryptCs, cipher),
        ("cipher_sc", MethodType::CryptSc, cipher),
        ("mac_cs", MethodType::MacCs, mac),
        ("mac_sc", MethodType::MacSc, mac),
    ] {
        if let Err(e) = sess.method_pref(method, prefs) {
            on_progress(&format!("Warning: failed to set {} prefs: {}", label, e));
        }
    }
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
