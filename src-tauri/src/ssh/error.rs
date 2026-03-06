use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum SshConnectionError {
    BastionConnectionFailed(String),
    BastionAuthFailed(String),
    TargetConnectionFailed(String),
    TargetAuthFailed(String),
    InvalidConfig(String),
}

impl std::fmt::Display for SshConnectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BastionConnectionFailed(m) => write!(f, "Bastion connection failed: {}", m),
            Self::BastionAuthFailed(m) => write!(f, "Bastion authentication failed: {}", m),
            Self::TargetConnectionFailed(m) => write!(f, "Target connection failed: {}", m),
            Self::TargetAuthFailed(m) => write!(f, "Target authentication failed: {}", m),
            Self::InvalidConfig(m) => write!(f, "Invalid config: {}", m),
        }
    }
}

impl std::error::Error for SshConnectionError {}
