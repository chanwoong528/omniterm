use crate::commands::ssh_connection::{connect_session_from_payload, EstablishSshConnectionPayload};
use crate::ssh;
use serde::Deserialize;
use std::net::{SocketAddr, TcpListener};
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
    local_host: Option<String>,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
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
    let remote_host = rule.remote_host.trim().to_string();
    if rule.id.trim().is_empty() {
        return Err("Rule id is required.".to_string());
    }
    if remote_host.is_empty() {
        return Err("Remote host is required.".to_string());
    }
    if rule.local_port == 0 {
        return Err("Local port must be between 1 and 65535.".to_string());
    }
    if rule.remote_port == 0 {
        return Err("Remote port must be between 1 and 65535.".to_string());
    }
    let local_host = rule
        .local_host
        .as_deref()
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .unwrap_or("127.0.0.1")
        .to_string();

    Ok(ssh::ForwardRuleSpec {
        id: rule.id,
        local_host,
        local_port: rule.local_port,
        remote_host,
        remote_port: rule.remote_port,
    })
}

/// Binds before connecting: a port conflict is by far the most common failure
/// and it costs nothing to detect, while an SSH handshake takes seconds.
fn bind_local_listener(spec: &ssh::ForwardRuleSpec) -> Result<TcpListener, String> {
    let ip = ssh::resolve_bind_ip(&spec.local_host)?;
    let addr = SocketAddr::new(ip, spec.local_port);
    let listener = TcpListener::bind(addr).map_err(|e| match e.kind() {
        std::io::ErrorKind::AddrInUse => format!(
            "Local port {} is already in use. Choose another port or stop the program using it.",
            spec.local_port
        ),
        std::io::ErrorKind::PermissionDenied => format!(
            "No permission to bind local port {}. Ports below 1024 require elevated privileges.",
            spec.local_port
        ),
        _ => format!("Could not bind {}: {}", addr, e),
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Could not configure local listener: {}", e))?;
    Ok(listener)
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

    let (listener, session, bastion_session) = tauri::async_runtime::spawn_blocking(move || {
        let spec = spec_for_blocking;
        let on_progress = |msg: &str| ssh::emit_progress(&app_blocking, &spec.id, msg);

        let listener = bind_local_listener(&spec)?;
        on_progress(&format!(
            "Listening on {}:{} → {}:{}",
            spec.local_host, spec.local_port, spec.remote_host, spec.remote_port
        ));

        let (session, bastion_session) = connect_session_from_payload(&connection, &on_progress)
            .map_err(|e| e.to_string())?;
        on_progress("Tunnel session ready");
        Ok::<_, String>((listener, session, bastion_session))
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
        listener,
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
