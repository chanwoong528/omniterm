use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    Password,
    PrivateKey,
}

#[derive(Clone)]
pub struct AuthPayload {
    pub method: AuthMethod,
    pub password: Option<String>,
    /// Path to private key file (e.g. from key manager store)
    pub private_key_path: Option<String>,
}

// Manual Debug: the plaintext password must never reach logs or panic
// messages (tauri-plugin-log is active in debug builds).
impl std::fmt::Debug for AuthPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthPayload")
            .field("method", &self.method)
            .field("password", &self.password.as_ref().map(|_| "[REDACTED]"))
            .field("private_key_path", &self.private_key_path)
            .finish()
    }
}

impl AuthPayload {
    pub fn with_password(password: String) -> Self {
        Self {
            method: AuthMethod::Password,
            password: Some(password),
            private_key_path: None,
        }
    }

    pub fn with_private_key(path: String) -> Self {
        Self {
            method: AuthMethod::PrivateKey,
            password: None,
            private_key_path: Some(path),
        }
    }
}
