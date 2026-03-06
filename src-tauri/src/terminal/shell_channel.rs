//! SSH shell channel: open PTY + shell on an existing session, read/write and emit output to frontend.

use base64::Engine;
use serde::Serialize;
use ssh2::Session;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Emitter;

pub const TERMINAL_OUTPUT_EVENT: &str = "terminal-output";

#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    #[serde(rename = "data")]
    pub data_base64: String,
}

const READ_BUF_SIZE: usize = 4096;
const WRITE_POLL_MS: u64 = 50;

/// Runs the shell channel loop in a dedicated thread: owns Session and Channel,
/// reads from channel and emits to frontend, receives write requests via rx.
pub fn spawn_shell_thread(
    session: Session,
    session_id: String,
    app: AppHandle,
    write_rx: mpsc::Receiver<Vec<u8>>,
) -> Result<(), String> {
    thread::spawn(move || {
        let mut channel = match session.channel_session() {
            Ok(ch) => ch,
            Err(e) => {
                let _ = emit_error(&app, &session_id, &e.to_string());
                return;
            }
        };
        if let Err(e) = channel.request_pty("xterm", None, None) {
            let _ = emit_error(&app, &session_id, &e.to_string());
            return;
        }
        if let Err(e) = channel.shell() {
            let _ = emit_error(&app, &session_id, &e.to_string());
            return;
        }
        session.set_blocking(false);

        let mut buf = [0u8; READ_BUF_SIZE];
        loop {
            // Drain write queue
            while let Ok(data) = write_rx.try_recv() {
                if channel.write_all(&data).is_err() {
                    break;
                }
                let _ = channel.flush();
            }

            match channel.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    let payload = TerminalOutputPayload {
                        session_id: session_id.clone(),
                        data_base64: data,
                    };
                    if app.emit(TERMINAL_OUTPUT_EVENT, &payload).is_err() {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }

            thread::sleep(Duration::from_millis(WRITE_POLL_MS));
        }
    });
    Ok(())
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
