/// Returns the current OS username (e.g. for pre-filling localhost test).
/// Uses USER on Unix, USERNAME on Windows.
#[tauri::command]
pub fn get_os_username() -> String {
    #[cfg(unix)]
    return std::env::var("USER").unwrap_or_else(|_| String::new());
    #[cfg(windows)]
    return std::env::var("USERNAME").unwrap_or_else(|_| String::new());
}

/// Tightens a private key file to owner-only access (chmod 600) so OpenSSH
/// does not reject it with "UNPROTECTED PRIVATE KEY FILE". Returns true when
/// permissions were changed, false when they were already strict enough.
/// Windows is a no-op: Win32-OpenSSH validates ACLs, not unix mode bits, and
/// default user-profile ACLs already pass its check.
pub fn tighten_key_permissions(path: &str) -> Result<bool, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        const OWNER_ONLY_MODE: u32 = 0o600;
        const GROUP_OTHER_BITS: u32 = 0o077;

        let metadata = std::fs::metadata(&path)
            .map_err(|e| format!("Cannot read key file '{}': {}", path, e))?;
        if !metadata.is_file() {
            return Err(format!("'{}' is not a regular file.", path));
        }

        let current_mode = metadata.permissions().mode();
        if current_mode & GROUP_OTHER_BITS == 0 {
            return Ok(false);
        }

        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(OWNER_ONLY_MODE))
            .map_err(|e| format!("Failed to chmod 600 '{}': {}", path, e))?;
        Ok(true)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(false)
    }
}

/// 프론트(키 등록 시점)에서 호출하는 커맨드 래퍼.
#[tauri::command]
pub fn secure_key_permissions(path: String) -> Result<bool, String> {
    tighten_key_permissions(&path)
}

/// 키 파일이 이 컴퓨터에 존재하는지 확인한다. 다른 OS에서 가져온 세션의
/// 키 경로(E:\... 등)를 연결 전에 검증하는 용도.
#[tauri::command]
pub fn key_file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// Reads a session-import file (e.g. MobaXterm .mxtsessions) as text.
/// MobaXterm on Korean Windows writes CP949, not UTF-8 — invalid UTF-8 input
/// falls back to EUC-KR decoding so Korean folder names and key paths survive.
#[tauri::command]
pub fn read_session_import_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Cannot read '{}': {}", path, e))?;
    match String::from_utf8(bytes) {
        Ok(text) => Ok(text),
        Err(err) => {
            let (decoded, _, _) = encoding_rs::EUC_KR.decode(err.as_bytes());
            Ok(decoded.into_owned())
        }
    }
}

/// Returns the OS platform for UI adaptation: "darwin" | "win32" | "linux".
#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    return "darwin".into();
    #[cfg(target_os = "windows")]
    return "win32".into();
    #[cfg(target_os = "linux")]
    return "linux".into();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown".into();
}
