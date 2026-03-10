use ssh2::Session;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use uuid::Uuid;

pub struct ActiveSession {
    /// Used for PTY/shell channel.
    pub target_session: Session,
    /// Used for SFTP (separate connection to avoid "Would block" with shared session).
    pub sftp_session: Session,
    /// Kept alive to maintain the bastion tunnel; dropping closes the tunnel.
    #[allow(dead_code)]
    pub bastion_session: Option<Session>,
    #[allow(dead_code)]
    pub sftp_bastion_session: Option<Session>,
    /// Last time this session had user-visible activity (shell input, SFTP, etc.).
    pub last_activity: Instant,
}

pub struct SshSessionManager {
    sessions: Mutex<HashMap<String, ActiveSession>>,
}

impl SshSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Register a connection with two target sessions: one for shell, one for SFTP.
    pub fn register(
        &self,
        target: Session,
        sftp_target: Session,
        bastion: Option<Session>,
        sftp_bastion: Option<Session>,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let now = Instant::now();
        self.sessions
            .lock()
            .expect("sessions lock")
            .insert(
                id.clone(),
                ActiveSession {
                    target_session: target,
                    sftp_session: sftp_target,
                    bastion_session: bastion,
                    sftp_bastion_session: sftp_bastion,
                    last_activity: now,
                },
            );
        id
    }

    pub fn get_target_session(&self, id: &str) -> Option<Session> {
        self.sessions
            .lock()
            .expect("sessions lock")
            .get(id)
            .map(|s| s.target_session.clone())
    }

    /// Returns the dedicated SFTP session (separate connection from shell).
    pub fn get_sftp_session(&self, id: &str) -> Option<Session> {
        self.sessions
            .lock()
            .expect("sessions lock")
            .get(id)
            .map(|s| s.sftp_session.clone())
    }

    /// Marks a session as having user activity "now".
    pub fn touch(&self, id: &str) {
        if let Ok(mut guard) = self.sessions.lock() {
            if let Some(session) = guard.get_mut(id) {
                session.last_activity = Instant::now();
            }
        }
    }
    /// Returns true if a session with the given id exists.
    pub fn has(&self, id: &str) -> bool {
        self.sessions
            .lock()
            .expect("sessions lock")
            .contains_key(id)
    }

    /// Removes a session from the manager, dropping all associated SSH sessions.
    pub fn remove(&self, id: &str) -> bool {
        self.sessions
            .lock()
            .expect("sessions lock")
            .remove(id)
            .is_some()
    }

    /// Drops any sessions that have been idle for longer than `max_idle`.
    /// Returns the ids of removed sessions (for logging/diagnostics).
    pub fn reap_idle(&self, max_idle: std::time::Duration) -> Vec<String> {
        let now = Instant::now();
        let mut removed_ids = Vec::new();
        if let Ok(mut guard) = self.sessions.lock() {
            guard.retain(|id, session| {
                let idle_for = now.saturating_duration_since(session.last_activity);
                if idle_for > max_idle {
                    removed_ids.push(id.clone());
                    false
                } else {
                    true
                }
            });
        }
        removed_ids
    }
}
