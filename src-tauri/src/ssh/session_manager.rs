use ssh2::Session;
use std::collections::HashMap;
use std::sync::Mutex;
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
        self.sessions
            .lock()
            .expect("sessions lock")
            .insert(id.clone(), ActiveSession {
                target_session: target,
                sftp_session: sftp_target,
                bastion_session: bastion,
                sftp_bastion_session: sftp_bastion,
            });
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

}
