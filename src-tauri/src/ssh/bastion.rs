//! Bastion (Jump Host) 터널링: Bastion에 SSH 연결 후 channel_direct_tcpip으로
//! Target으로 TCP 터널을 열고, 그 터널 위에 Target SSH 세션을 수립합니다.
//!
//! libssh2 is not thread-safe: the same session/channel must not be used from
//! multiple threads. We use a single bridge thread that does both channel→stream
//! and stream→channel so only one thread touches the channel.

use crate::ssh::auth::AuthPayload;
use crate::ssh::direct;
use crate::ssh::error::SshConnectionError;
use ssh2::{Channel, Session};
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

const CONNECT_TIMEOUT_MS: u32 = 15_000;
const COPY_BUF_SIZE: usize = 32 * 1024;
const BRIDGE_STREAM_READ_TIMEOUT_MS: u64 = 50;

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

    thread::spawn(move || {
        bridge_channel_and_stream(channel, stream_for_channel);
    });
    on_progress("[Tunnel] Bridge active");

    let timeout_duration = Duration::from_millis(CONNECT_TIMEOUT_MS as u64);
    stream_for_session
        .set_read_timeout(Some(timeout_duration))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    stream_for_session
        .set_write_timeout(Some(timeout_duration))
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;

    thread::sleep(Duration::from_millis(100));

    on_progress("[Target] Starting SSH handshake through tunnel...");
    let mut target_sess = Session::new().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Session::new: {}", e))
    })?;
    target_sess.set_timeout(CONNECT_TIMEOUT_MS);
    target_sess.set_tcp_stream(stream_for_session);
    target_sess
        .handshake()
        .map_err(|e| SshConnectionError::TargetConnectionFailed(format!("Target handshake: {}", e)))?;
    on_progress("[Target] Handshake completed");

    let target_progress = |msg: &str| {
        on_progress(&format!("[Target] {}", msg));
    };
    direct::authenticate_session(&mut target_sess, target_username, target_auth, &target_progress, |e| {
        SshConnectionError::TargetAuthFailed(e.to_string())
    })?;

    Ok((target_sess, bastion_sess))
}

fn create_connected_pair() -> std::io::Result<(TcpStream, TcpStream)> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let connector = TcpStream::connect(("127.0.0.1", port))?;
    let (accepted, _) = listener.accept()?;
    Ok((accepted, connector))
}

/// Single-thread bridge: only this thread touches the channel (libssh2 is not thread-safe).
/// Each iteration: try channel→stream, then try stream→channel. Non-blocking channel +
/// short timeout on stream so we don't deadlock.
fn bridge_channel_and_stream(mut channel: Channel, mut stream: TcpStream) {
    let mut from_channel = [0u8; COPY_BUF_SIZE];
    let mut from_stream = [0u8; COPY_BUF_SIZE];
    loop {
        match channel.read(&mut from_channel) {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&from_channel[..n]).is_err() {
                    break;
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {}
            Err(_) => break,
        }
        match stream.read(&mut from_stream) {
            Ok(0) => break,
            Ok(n) => {
                if channel.write_all(&from_stream[..n]).is_err() {
                    break;
                }
            }
            Err(_) => {}
        }
        thread::sleep(Duration::from_millis(2));
    }
}
