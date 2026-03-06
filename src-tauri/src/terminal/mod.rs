mod shell_channel;

use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Mutex;

pub use shell_channel::spawn_shell_thread;

pub struct ShellWriteManager {
    senders: Mutex<HashMap<String, mpsc::Sender<Vec<u8>>>>,
}

impl ShellWriteManager {
    pub fn new() -> Self {
        Self {
            senders: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, session_id: String, tx: mpsc::Sender<Vec<u8>>) {
        self.senders
            .lock()
            .expect("senders lock")
            .insert(session_id, tx);
    }

    pub fn send(&self, session_id: &str, data: Vec<u8>) -> bool {
        self.senders
            .lock()
            .expect("senders lock")
            .get(session_id)
            .map(|tx| tx.send(data).is_ok())
            .unwrap_or(false)
    }

    pub fn remove(&self, session_id: &str) {
        self.senders
            .lock()
            .expect("senders lock")
            .remove(session_id);
    }
}
