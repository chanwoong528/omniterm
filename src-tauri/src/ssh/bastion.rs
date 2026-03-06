//! Bastion (Jump Host) 터널링: Bastion에 SSH 연결 후 channel_direct_tcpip으로
//! Target으로 TCP 터널을 열고, 그 터널 위에 Target SSH 세션을 수립합니다.

use crate::ssh::auth::AuthPayload;
use crate::ssh::direct;
use crate::ssh::error::SshConnectionError;
use ssh2::{Channel, Session};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const CONNECT_TIMEOUT_MS: u32 = 15_000;
const COPY_BUF_SIZE: usize = 32 * 1024;

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
) -> Result<(Session, Session), SshConnectionError> {
    let bastion_sess = direct::connect_direct(
        bastion_host,
        bastion_port,
        bastion_username,
        bastion_auth,
    )
    .map_err(|e| match e {
        SshConnectionError::TargetConnectionFailed(m) => {
            SshConnectionError::BastionConnectionFailed(m)
        }
        SshConnectionError::TargetAuthFailed(m) => SshConnectionError::BastionAuthFailed(m),
        other => other,
    })?;

    let channel = bastion_sess
        .channel_direct_tcpip(target_host, target_port, None)
        .map_err(|e| {
            SshConnectionError::TargetConnectionFailed(format!(
                "Bastion channel_direct_tcpip to {}:{}: {}",
                target_host, target_port, e
            ))
        })?;

    let (stream_for_session, stream_for_channel) = create_connected_pair()
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;

    let channel = Arc::new(Mutex::new(channel));
    let channel_for_read = Arc::clone(&channel);
    let channel_for_write = Arc::clone(&channel);

    let stream_reader = stream_for_channel
        .try_clone()
        .map_err(|e| SshConnectionError::TargetConnectionFailed(e.to_string()))?;
    let stream_writer = stream_for_channel;

    thread::spawn(move || {
        copy_channel_to_stream(channel_for_read, stream_writer);
    });
    thread::spawn(move || {
        copy_stream_to_channel(stream_reader, channel_for_write);
    });

    thread::sleep(Duration::from_millis(50));

    let mut target_sess = Session::new().map_err(|e| {
        SshConnectionError::TargetConnectionFailed(format!("Session::new: {}", e))
    })?;
    target_sess.set_tcp_stream(stream_for_session);
    target_sess
        .handshake()
        .map_err(|e| SshConnectionError::TargetConnectionFailed(format!("Target handshake: {}", e)))?;
    target_sess.set_timeout(CONNECT_TIMEOUT_MS);

    direct::authenticate_session(&mut target_sess, target_username, target_auth, |e| {
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

fn copy_channel_to_stream(channel: Arc<Mutex<Channel>>, mut stream: TcpStream) {
    let mut buf = [0u8; COPY_BUF_SIZE];
    loop {
        let n = match channel.lock().ok().and_then(|mut ch| ch.read(&mut buf).ok()) {
            Some(0) => break,
            Some(n) => n,
            None => break,
        };
        if stream.write_all(&buf[..n]).is_err() {
            break;
        }
    }
}

fn copy_stream_to_channel(mut stream: TcpStream, channel: Arc<Mutex<Channel>>) {
    let mut buf = [0u8; COPY_BUF_SIZE];
    loop {
        let n = match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        if channel
            .lock()
            .ok()
            .and_then(|mut ch| ch.write_all(&buf[..n]).err())
            .is_some()
        {
            break;
        }
    }
}
