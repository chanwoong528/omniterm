use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    Password,
    PrivateKey,
    Agent,
}

#[derive(Debug, Clone)]
pub struct AuthPayload {
    pub method: AuthMethod,
    pub password: Option<String>,
    /// Path to private key file (e.g. from key manager store)
    pub private_key_path: Option<String>,
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

    pub fn with_agent() -> Self {
        Self {
            method: AuthMethod::Agent,
            password: None,
            private_key_path: None,
        }
    }
}
