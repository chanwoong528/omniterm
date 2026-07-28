mod shell_channel;

use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Mutex, MutexGuard};

pub use shell_channel::{spawn_shell_thread, ShellMsg};

pub struct ShellWriteManager {
    senders: Mutex<HashMap<String, mpsc::Sender<ShellMsg>>>,
}

impl ShellWriteManager {
    pub fn new() -> Self {
        Self {
            senders: Mutex::new(HashMap::new()),
        }
    }

    /// Locks the sender map, recovering from poisoning so one panic while
    /// holding the lock does not brick every subsequent terminal command.
    fn lock_senders(&self) -> MutexGuard<'_, HashMap<String, mpsc::Sender<ShellMsg>>> {
        self.senders.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Registers the writer for a session. Fails if one is already registered:
    /// a duplicate spawn would attach a second shell thread to the same
    /// session id and interleave its output with the first.
    pub fn register(&self, session_id: String, tx: mpsc::Sender<ShellMsg>) -> Result<(), String> {
        let mut guard = self.lock_senders();
        if guard.contains_key(&session_id) {
            return Err("Terminal is already running for this session".to_string());
        }
        guard.insert(session_id, tx);
        Ok(())
    }

    pub fn send_data(&self, session_id: &str, data: Vec<u8>) -> bool {
        self.lock_senders()
            .get(session_id)
            .map(|tx| tx.send(ShellMsg::Data(data)).is_ok())
            .unwrap_or(false)
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> bool {
        self.lock_senders()
            .get(session_id)
            .map(|tx| tx.send(ShellMsg::Resize { cols, rows }).is_ok())
            .unwrap_or(false)
    }

    /// Asks the shell thread to close its channel and stop, then drops the
    /// sender. Returns false if no writer was registered.
    pub fn close(&self, session_id: &str) -> bool {
        match self.lock_senders().remove(session_id) {
            Some(tx) => {
                let _ = tx.send(ShellMsg::Close);
                true
            }
            None => false,
        }
    }
}
