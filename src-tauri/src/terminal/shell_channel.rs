//! SSH shell channel: open PTY + shell on an existing session, read/write and emit output to frontend.

use base64::Engine;
use serde::Serialize;
use ssh2::{Channel, Session};
use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Emitter;

pub const TERMINAL_OUTPUT_EVENT: &str = "terminal-output";
pub const SESSION_DISCONNECTED_EVENT: &str = "session-disconnected";

#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    #[serde(rename = "data")]
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize)]
struct SessionDisconnectedPayload {
    session_id: String,
    reason: String,
}

/// Control messages for the shell thread. The thread owns the libssh2
/// channel exclusively (libssh2 is not thread-safe), so PTY resize and
/// teardown must travel over the same queue as input data.
pub enum ShellMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

const READ_BUF_SIZE: usize = 8192;
/// Coalesce reads up to this many bytes per emitted event.
const MAX_EMIT_BYTES: usize = 128 * 1024;
const POLL_INTERVAL_MS: u64 = 15;
const WRITE_RETRY_MS: u64 = 2;
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

/// Runs the shell channel loop in a dedicated thread: owns Session and Channel,
/// reads from channel and emits to frontend, receives control messages via rx.
pub fn spawn_shell_thread(
    session: Session,
    session_id: String,
    app: AppHandle,
    write_rx: mpsc::Receiver<ShellMsg>,
) -> Result<(), String> {
    thread::spawn(move || {
        let mut channel = match session.channel_session() {
            Ok(ch) => ch,
            Err(e) => {
                let _ = emit_error(&app, &session_id, &e.to_string());
                let _ = emit_disconnected(&app, &session_id, &e.to_string());
                return;
            }
        };
        if let Err(e) = channel.request_pty("xterm-256color", None, None) {
            let _ = emit_error(&app, &session_id, &e.to_string());
            let _ = emit_disconnected(&app, &session_id, &e.to_string());
            return;
        }
        if let Err(e) = channel.shell() {
            let _ = emit_error(&app, &session_id, &e.to_string());
            let _ = emit_disconnected(&app, &session_id, &e.to_string());
            return;
        }
        session.set_blocking(false);
        session.set_keepalive(true, KEEPALIVE_INTERVAL.as_secs() as u32);

        let mut buf = [0u8; READ_BUF_SIZE];
        let mut last_keepalive = Instant::now();
        let mut reason = "Connection closed".to_string();

        'outer: loop {
            // Drain control/write queue. A dropped sender means the session was
            // closed from the UI — exit instead of polling forever.
            loop {
                match write_rx.try_recv() {
                    Ok(ShellMsg::Data(data)) => {
                        if let Err(e) = write_fully(&mut channel, &data) {
                            reason = e;
                            break 'outer;
                        }
                    }
                    Ok(ShellMsg::Resize { cols, rows }) => {
                        let _ = channel.request_pty_size(cols, rows, None, None);
                    }
                    Ok(ShellMsg::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                        reason = "Closed".to_string();
                        break 'outer;
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                }
            }

            // Drain all pending output before sleeping — a single fixed-size
            // read per tick caps throughput at buf_size/interval.
            let mut pending: Vec<u8> = Vec::new();
            loop {
                match channel.read(&mut buf) {
                    Ok(0) => {
                        if channel.eof() {
                            let _ = emit_pending(&app, &session_id, &mut pending);
                            reason = "Remote closed the channel".to_string();
                            break 'outer;
                        }
                        break;
                    }
                    Ok(n) => {
                        pending.extend_from_slice(&buf[..n]);
                        if pending.len() >= MAX_EMIT_BYTES {
                            if emit_pending(&app, &session_id, &mut pending).is_err() {
                                break 'outer;
                            }
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                    Err(e) => {
                        let _ = emit_pending(&app, &session_id, &mut pending);
                        reason = e.to_string();
                        break 'outer;
                    }
                }
            }
            if emit_pending(&app, &session_id, &mut pending).is_err() {
                break 'outer;
            }

            if last_keepalive.elapsed() >= KEEPALIVE_INTERVAL {
                let _ = session.keepalive_send();
                last_keepalive = Instant::now();
            }

            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }

        // Graceful teardown; the connection may already be dead, so ignore errors.
        let _ = channel.send_eof();
        let _ = channel.close();
        let _ = emit_disconnected(&app, &session_id, &reason);
    });
    Ok(())
}

/// Writes the whole buffer, retrying on WouldBlock. `write_all` must not be
/// used on a non-blocking channel: it aborts on WouldBlock after a partial
/// write and the already-consumed bytes are lost.
fn write_fully(channel: &mut Channel, data: &[u8]) -> Result<(), String> {
    let mut written = 0;
    while written < data.len() {
        match channel.write(&data[written..]) {
            Ok(0) => return Err("Channel write returned 0 bytes".to_string()),
            Ok(n) => written += n,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(WRITE_RETRY_MS));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    // NOTE: no channel.flush() here — libssh2's channel flush DISCARDS the
    // channel's unread INCOMING data (it is not a send-buffer flush) and is
    // the very call that raises "Failure while draining incoming flow".
    // libssh2 transmits written data immediately; nothing needs flushing.
    Ok(())
}

fn emit_pending(app: &AppHandle, session_id: &str, pending: &mut Vec<u8>) -> Result<(), ()> {
    if pending.is_empty() {
        return Ok(());
    }
    let data = base64::engine::general_purpose::STANDARD.encode(&pending);
    pending.clear();
    let payload = TerminalOutputPayload {
        session_id: session_id.to_string(),
        data_base64: data,
    };
    app.emit(TERMINAL_OUTPUT_EVENT, &payload).map_err(|_| ())
}

fn emit_error(app: &AppHandle, session_id: &str, message: &str) -> Result<(), tauri::Error> {
    #[derive(Clone, Serialize)]
    struct ErrorPayload {
        session_id: String,
        error: String,
    }
    app.emit(TERMINAL_OUTPUT_EVENT, ErrorPayload {
        session_id: session_id.to_string(),
        error: message.to_string(),
    })
}

fn emit_disconnected(app: &AppHandle, session_id: &str, reason: &str) -> Result<(), tauri::Error> {
    app.emit(
        SESSION_DISCONNECTED_EVENT,
        SessionDisconnectedPayload {
            session_id: session_id.to_string(),
            reason: reason.to_string(),
        },
    )
}
