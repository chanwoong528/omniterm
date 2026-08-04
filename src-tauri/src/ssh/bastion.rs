//! Bastion (Jump Host) 터널링: Bastion에 SSH 연결 후 channel_direct_tcpip으로
//! Target으로 TCP 터널을 열고, 그 터널 위에 Target SSH 세션을 수립합니다.
//!
//! libssh2 is not thread-safe: the same session/channel must not be used from
//! multiple threads. We use a single bridge thread that does both channel→stream
//! and stream→channel so only one thread touches the channel.

use crate::ssh::auth::AuthPayload;
use crate::ssh::bridge::bridge_channel_and_stream;
use crate::ssh::direct;
use crate::ssh::error::SshConnectionError;
use ssh2::Session;
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const CONNECT_TIMEOUT_MS: u32 = 15_000;
const BRIDGE_STREAM_READ_TIMEOUT_MS: u64 = 10;
const BRIDGE_READY_TIMEOUT_MS: u64 = 5_000;

/// Bastion을 거쳐 Target SSH 세션을 수립합니다.
/// 반환: (Target Session, Bastion Session). Bastion Session을 drop하면 터널이 닫히므로
/// 호출 측에서 두 세션을 모두 보관해야 합니다.
pub fn connect_via_bastion(
    bastion_host: &str,
    bastion_port: u16,
    bastion_username: &str,
    bastion_auth: &AuthPayload,
    target_host: &str,
    target_port: u16,
    target_username: &str,
    target_auth: &AuthPayload,
    on_progress: &dyn Fn(&str),
) -> Result<(Session, Session), SshConnectionError> {
    let bastion_progress = |msg: &str| {
        on_progress(&format!("[Bastion] {}", msg));
    };
    let bastion_sess = direct::connect_direct(
        bastion_host,
        bastion_port,
        bastion_username,
        bastion_auth,
        &bastion_progress,
    )
    .map_err(|e| match e {
        SshConnectionError::TargetConnectionFailed(m) => {
            SshConnectionError::BastionConnectionFailed(m)
        }
        SshConnectionError::TargetAuthFailed(m) => SshConnectionError::BastionAuthFailed(m),
        other => other,
    })?;

    on_progress(&format!(
        "[Tunnel] Opening direct-tcpip channel to {}:{}...",
        target_host, target_port
    ));
    let channel = bastion_sess
        .channel_direct_tcpip(target_host, target_port, None)
        .map_err(|e| {
            SshConnectionError::TargetConnectionFailed(format!(
                "Bastion channel_direct_tcpip to {}:{}: {}",
                target_host, target_port, e
            ))
        })?;
    on_progress("[Tunnel] Channel established");

    bastion_sess.set_blocking(false);

    on_progress("[Tunnel] Setting up local bridge...");
    let (stream_for_session, stream_for_channel) = create_connected_pair()
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;

    stream_for_channel
        .set_read_timeout(Some(Duration::from_millis(BRIDGE_STREAM_READ_TIMEOUT_MS)))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    stream_for_channel
        .set_write_timeout(Some(Duration::from_millis(CONNECT_TIMEOUT_MS as u64)))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;

    // The bridge signals when its loop is actually running — a fixed sleep is
    // a race on a loaded machine or a cold thread pool.
    let (ready_tx, ready_rx) = mpsc::channel::<()>();
    thread::spawn(move || {
        let _ = ready_tx.send(());
        bridge_channel_and_stream(channel, stream_for_channel);
    });
    ready_rx
        .recv_timeout(Duration::from_millis(BRIDGE_READY_TIMEOUT_MS))
        .map_err(|_| {
            SshConnectionError::TargetConnectionFailed("Tunnel bridge failed to start".into())
        })?;
    on_progress("[Tunnel] Bridge active");

    let timeout_duration = Duration::from_millis(CONNECT_TIMEOUT_MS as u64);
    stream_for_session
        .set_read_timeout(Some(timeout_duration))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    stream_for_session
        .set_write_timeout(Some(timeout_duration))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    let stream_for_later = stream_for_session.try_clone().ok();

    on_progress("[Target] Starting SSH handshake through tunnel...");
    let mut target_sess = Session::new().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Session::new: {}", e))
    })?;
    target_sess.set_timeout(CONNECT_TIMEOUT_MS);
    target_sess.set_tcp_stream(stream_for_session);
    // Legacy KEX/cipher fallbacks must apply to the tunneled target too, not
    // only to direct connections and the bastion hop.
    direct::configure_session_methods(&mut target_sess, on_progress);
    target_sess
        .handshake()
        .map_err(|e| SshConnectionError::TargetConnectionFailed(format!("Target handshake: {}", e)))?;
    on_progress("[Target] Handshake completed");

    let target_progress = |msg: &str| {
        on_progress(&format!("[Target] {}", msg));
    };
    direct::verify_host_key(&target_sess, target_host, target_port, &target_progress)?;

    direct::authenticate_session(&mut target_sess, target_username, target_auth, &target_progress, |e| {
        SshConnectionError::TargetAuthFailed(e.to_string())
    })?;

    target_sess.set_timeout(direct::OPERATION_TIMEOUT_MS);
    if let Some(stream) = stream_for_later {
        // Same rationale as connect_direct: the shell loop uses non-blocking
        // session mode, which requires a non-blocking transport socket.
        let _ = stream.set_nonblocking(true);
    }

    Ok((target_sess, bastion_sess))
}

/// Creates a loopback TCP pair and verifies that the accepted peer really is
/// our own connector: between bind and accept any local process could connect
/// to the ephemeral port, and everything the tunnel carries (including the
/// target SSH handshake) flows over this socket.
fn create_connected_pair() -> std::io::Result<(TcpStream, TcpStream)> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let connector = TcpStream::connect(("127.0.0.1", port))?;
    let expected = connector.local_addr()?;
    // Bounded number of tries: reject foreign connections instead of pairing with them.
    for _ in 0..8 {
        let (accepted, peer) = listener.accept()?;
        if peer == expected {
            return Ok((accepted, connector));
        }
        drop(accepted);
    }
    Err(std::io::Error::new(
        ErrorKind::ConnectionRefused,
        "Loopback bridge pairing failed: unexpected peer kept connecting",
    ))
}
