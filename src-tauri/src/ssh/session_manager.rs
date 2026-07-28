use ssh2::{Session, Sftp};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;
use uuid::Uuid;

pub struct ActiveSession {
    /// Used for PTY/shell channel.
    pub target_session: Session,
    /// Used for SFTP (separate connection to avoid "Would block" with shared
    /// session). None when the SFTP connection failed — the shell still works.
    pub sftp_session: Option<Session>,
    /// Kept alive to maintain the bastion tunnel; dropping closes the tunnel.
    #[allow(dead_code)]
    pub bastion_session: Option<Session>,
    #[allow(dead_code)]
    pub sftp_bastion_session: Option<Session>,
    /// Login username on the target host (used for home-directory fallbacks).
    pub username: String,
    /// Cached SFTP subsystem handle. libssh2 is not thread-safe, so every SFTP
    /// operation must hold this mutex; caching also avoids re-negotiating the
    /// subsystem (a full channel-open round trip) on every call.
    pub sftp: Option<Arc<Mutex<Sftp>>>,
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

    /// Locks the session map, recovering from poisoning so one panic while
    /// holding the lock does not brick every subsequent command.
    fn lock_sessions(&self) -> MutexGuard<'_, HashMap<String, ActiveSession>> {
        self.sessions.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Register a connection with two target sessions: one for shell, one for SFTP.
    pub fn register(
        &self,
        target: Session,
        sftp_target: Option<Session>,
        bastion: Option<Session>,
        sftp_bastion: Option<Session>,
        username: String,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let now = Instant::now();
        self.lock_sessions().insert(
            id.clone(),
            ActiveSession {
                target_session: target,
                sftp_session: sftp_target,
                bastion_session: bastion,
                sftp_bastion_session: sftp_bastion,
                username,
                sftp: None,
                last_activity: now,
            },
        );
        id
    }

    pub fn get_target_session(&self, id: &str) -> Option<Session> {
        self.lock_sessions().get(id).map(|s| s.target_session.clone())
    }

    /// Returns the dedicated SFTP session (separate connection from shell).
    pub fn get_sftp_session(&self, id: &str) -> Option<Session> {
        self.lock_sessions()
            .get(id)
            .and_then(|s| s.sftp_session.clone())
    }

    /// Returns the login username recorded for this session.
    pub fn get_username(&self, id: &str) -> Option<String> {
        self.lock_sessions().get(id).map(|s| s.username.clone())
    }

    /// Returns the cached SFTP handle, opening the subsystem on first use.
    /// The subsystem handshake runs outside the map lock so a slow network
    /// cannot stall every other command.
    pub fn get_or_init_sftp(&self, id: &str) -> Result<Arc<Mutex<Sftp>>, String> {
        {
            let guard = self.lock_sessions();
            let session = guard.get(id).ok_or_else(|| "Session not found".to_string())?;
            if let Some(sftp) = &session.sftp {
                return Ok(Arc::clone(sftp));
            }
            if session.sftp_session.is_none() {
                return Err(
                    "SFTP is not available for this session (its connection failed). Reconnect to retry."
                        .to_string(),
                );
            }
        }

        let session = self
            .get_sftp_session(id)
            .ok_or_else(|| "Session not found".to_string())?;
        let sftp = session.sftp().map_err(|e| e.to_string())?;
        let created = Arc::new(Mutex::new(sftp));

        let mut guard = self.lock_sessions();
        match guard.get_mut(id) {
            Some(active) => {
                if let Some(existing) = &active.sftp {
                    // Another caller won the race; reuse theirs and drop ours.
                    Ok(Arc::clone(existing))
                } else {
                    active.sftp = Some(Arc::clone(&created));
                    Ok(created)
                }
            }
            None => Err("Session not found".to_string()),
        }
    }

    /// Marks a session as having user activity "now".
    pub fn touch(&self, id: &str) {
        if let Some(session) = self.lock_sessions().get_mut(id) {
            session.last_activity = Instant::now();
        }
    }

    /// Returns true if a session with the given id exists.
    #[allow(dead_code)]
    pub fn has(&self, id: &str) -> bool {
        self.lock_sessions().contains_key(id)
    }

    /// Removes a session from the manager, dropping all associated SSH sessions
    /// outside the lock (dropping performs a blocking libssh2 disconnect).
    pub fn remove(&self, id: &str) -> bool {
        let removed = self.lock_sessions().remove(id);
        let found = removed.is_some();
        drop(removed);
        found
    }

    /// Drops any sessions that have been idle for longer than `max_idle`.
    /// Returns the ids of removed sessions (for logging/diagnostics).
    /// Sessions are dropped outside the lock: dropping blocks on a libssh2
    /// disconnect, which must not stall every other command.
    #[allow(dead_code)]
    pub fn reap_idle(&self, max_idle: std::time::Duration) -> Vec<String> {
        let now = Instant::now();
        let mut removed: Vec<(String, ActiveSession)> = Vec::new();
        {
            let mut guard = self.lock_sessions();
            let expired: Vec<String> = guard
                .iter()
                .filter(|(_, s)| now.saturating_duration_since(s.last_activity) > max_idle)
                .map(|(id, _)| id.clone())
                .collect();
            for id in expired {
                if let Some(session) = guard.remove(&id) {
                    removed.push((id, session));
                }
            }
        }
        removed.into_iter().map(|(id, _session)| id).collect()
    }
}
