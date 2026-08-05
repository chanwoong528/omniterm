use crate::commands::ssh_connection::{connect_session_from_payload, EstablishSshConnectionPayload};
use crate::ssh;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;

/// How long `stop_port_forward` waits for the loop thread to release its
/// listener. Normally a single poll tick; the bound only matters when the
/// SSH disconnect handshake stalls on a dead network.
const STOP_WAIT_TIMEOUT: Duration = Duration::from_secs(2);
const STOP_WAIT_POLL: Duration = Duration::from_millis(10);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardRulePayload {
    id: String,
    kind: ssh::ForwardKind,
    local_host: Option<String>,
    local_port: u16,
    remote_host: Option<String>,
    remote_port: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPortForwardPayload {
    /// Id of the SavedSession the rule belongs to — used to group forwards in
    /// the UI and to stop them all at once.
    saved_session_id: String,
    rule: PortForwardRulePayload,
    /// Same shape as `establish_ssh_connection`: the forward opens its own
    /// dedicated session rather than borrowing the shell's.
    connection: EstablishSshConnectionPayload,
}

fn build_spec(rule: PortForwardRulePayload) -> Result<ssh::ForwardRuleSpec, String> {
    if rule.id.trim().is_empty() {
        return Err("Rule id is required.".to_string());
    }
    let local_host = rule
        .local_host
        .as_deref()
        .map(str::trim)
        .filter(|host| !host.is_empty())
        .unwrap_or("127.0.0.1")
        .to_string();
    let remote_host = rule
        .remote_host
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    let remote_port = rule.remote_port.unwrap_or(0);

    match rule.kind {
        ssh::ForwardKind::Local => {
            if remote_host.is_empty() {
                return Err("Destination host is required for a local forward.".to_string());
            }
            if remote_port == 0 {
                return Err("Destination port must be between 1 and 65535.".to_string());
            }
            if rule.local_port == 0 {
                return Err("Local port must be between 1 and 65535.".to_string());
            }
        }
        ssh::ForwardKind::Remote => {
            if rule.local_port == 0 {
                return Err("Destination port on this machine must be between 1 and 65535.".to_string());
            }
            // remote_port 0 is legal: the server picks a free port and reports it.
        }
        ssh::ForwardKind::Dynamic => {
            if rule.local_port == 0 {
                return Err("SOCKS proxy port must be between 1 and 65535.".to_string());
            }
        }
    }

    Ok(ssh::ForwardRuleSpec {
        id: rule.id,
        kind: rule.kind,
        local_host,
        local_port: rule.local_port,
        remote_host,
        remote_port,
    })
}

/// Human-readable summary for the activity log, so the user can see what the
/// rule actually does without translating `-L`/`-R`/`-D` in their head.
fn describe_spec(spec: &ssh::ForwardRuleSpec) -> String {
    match spec.kind {
        ssh::ForwardKind::Local => format!(
            "Listening on {}:{} → {}:{}",
            spec.local_host, spec.local_port, spec.remote_host, spec.remote_port
        ),
        ssh::ForwardKind::Remote => format!(
            "Server will listen on port {} → {}:{} on this machine",
            spec.remote_port, spec.local_host, spec.local_port
        ),
        ssh::ForwardKind::Dynamic => format!(
            "SOCKS5 proxy on {}:{}",
            spec.local_host, spec.local_port
        ),
    }
}

#[tauri::command]
pub async fn start_port_forward(
    payload: StartPortForwardPayload,
    manager: State<'_, Arc<ssh::PortForwardManager>>,
    app: tauri::AppHandle,
) -> Result<ssh::PortForwardStatus, String> {
    let spec = build_spec(payload.rule)?;
    if manager.is_running(&spec.id) {
        return Err("This port forward is already running.".to_string());
    }

    let manager = Arc::clone(manager.inner());
    let saved_session_id = payload.saved_session_id;
    let connection = payload.connection;
    let app_blocking = app.clone();
    let spec_for_blocking = spec.clone();

    let (source, session, bastion_session, spec) = tauri::async_runtime::spawn_blocking(move || {
        let mut spec = spec_for_blocking;
        let on_progress = |msg: &str| ssh::emit_progress(&app_blocking, &spec.id, msg);

        // A local/dynamic forward owns a local listener, so bind first and fail
        // fast on a port conflict. A remote forward has nothing to bind until
        // the session exists — only the server can listen for it.
        let local_listener = match spec.kind {
            ssh::ForwardKind::Remote => None,
            _ => Some(ssh::bind_local_listener(&spec)?),
        };
        if local_listener.is_some() {
            on_progress(&describe_spec(&spec));
        }

        let (session, bastion_session) = connect_session_from_payload(&connection, &on_progress)
            .map_err(|e| e.to_string())?;

        let source = match local_listener {
            Some(listener) => ssh::ForwardSource::LocalSocket(listener),
            None => {
                let (listener, bound_port) = ssh::listen_on_server(&session, &spec)?;
                // The server may have picked the port (requested 0), so record
                // what it actually bound before the UI shows it.
                spec.remote_port = bound_port;
                on_progress(&describe_spec(&spec));
                ssh::ForwardSource::RemoteChannel(listener)
            }
        };
        on_progress("Tunnel session ready");
        Ok::<_, String>((source, session, bastion_session, spec))
    })
    .await
    .map_err(|e| e.to_string())??;

    let stop = Arc::new(AtomicBool::new(false));
    let done = Arc::new(AtomicBool::new(false));
    let stats = Arc::new(ssh::ForwardStats::default());
    let status = manager.insert(
        saved_session_id.clone(),
        spec.clone(),
        Arc::clone(&stop),
        Arc::clone(&done),
        Arc::clone(&stats),
    )?;

    ssh::spawn_forward_thread(ssh::ForwardRuntime {
        session,
        bastion_session,
        source,
        spec,
        saved_session_id,
        stop,
        done,
        stats,
        manager: Arc::clone(&manager),
        app: app.clone(),
    });

    ssh::emit_status(&app, &status);
    Ok(status)
}

/// Waits for the forward threads to release their listeners, so an immediate
/// restart of the same rule does not fail with "address already in use".
fn wait_for_stop(flags: Vec<Arc<AtomicBool>>) {
    let deadline = Instant::now() + STOP_WAIT_TIMEOUT;
    for flag in flags {
        while !flag.load(Ordering::Acquire) && Instant::now() < deadline {
            std::thread::sleep(STOP_WAIT_POLL);
        }
    }
}

#[tauri::command]
pub async fn stop_port_forward(
    rule_id: String,
    manager: State<'_, Arc<ssh::PortForwardManager>>,
) -> Result<(), String> {
    // Not running is not an error: the thread may have already exited on its
    // own (connection lost) and the UI is just catching up.
    let Some(done) = manager.request_stop(&rule_id) else {
        return Ok(());
    };
    tauri::async_runtime::spawn_blocking(move || wait_for_stop(vec![done]))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_port_forwards_for_session(
    saved_session_id: String,
    manager: State<'_, Arc<ssh::PortForwardManager>>,
) -> Result<(), String> {
    let flags = manager.request_stop_for_session(&saved_session_id);
    if flags.is_empty() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || wait_for_stop(flags))
        .await
        .map_err(|e| e.to_string())
}

/// Full snapshot of what is running, so the UI can resync after a reload
/// instead of trusting only the events it happened to be listening for.
#[tauri::command]
pub async fn list_port_forwards(
    manager: State<'_, Arc<ssh::PortForwardManager>>,
) -> Result<Vec<ssh::PortForwardStatus>, String> {
    Ok(manager.statuses())
}
