import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

const TERMINAL_OUTPUT_EVENT = 'terminal-output';
const SESSION_DISCONNECTED_EVENT = 'session-disconnected';

interface TerminalViewProps {
  sessionId: string;
  isActive: boolean;
}

function base64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function TerminalView({ sessionId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // One persistent streaming decoder per session: a multi-byte character
  // (e.g. Korean) split across two output chunks must not become U+FFFD.
  const decoderRef = useRef<TextDecoder>(new TextDecoder('utf-8'));
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);

  const writeToBackend = useCallback(
    (data: string) => {
      invoke('write_to_terminal', { sessionId, data }).catch(() => {
        // Session may be closed; the session-disconnected banner covers this.
      });
    },
    [sessionId]
  );

  /** Fits xterm to its container and syncs the remote PTY size. */
  const fitAndResizeRemote = useCallback(() => {
    const el = containerRef.current;
    const term = terminalRef.current;
    const fit = fitAddonRef.current;
    // Never fit against a hidden or zero-sized container.
    if (!el || !term || !fit || el.offsetWidth === 0 || el.offsetHeight === 0) return;
    fit.fit();
    const { cols, rows } = term;
    const last = lastSentSizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    lastSentSizeRef.current = { cols, rows };
    invoke('resize_pty', { sessionId, cols, rows }).catch(() => {
      // Shell may not be up yet; the post-spawn resize below retries.
    });
  }, [sessionId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      theme: {
        background: '#18181b',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#18181b',
        selectionBackground: 'rgba(255, 255, 255, 0.2)',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);

    term.onData((data) => writeToBackend(data));

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    decoderRef.current = new TextDecoder('utf-8');
    lastSentSizeRef.current = null;

    let disposed = false;
    let unlistenOutput: (() => void) | null = null;
    let unlistenDisconnect: (() => void) | null = null;

    const setup = async () => {
      // Register listeners BEFORE spawning the shell: anything the shell
      // emits before the listener exists (MOTD, first prompt) is lost.
      unlistenOutput = await listen<{ session_id: string; data?: string; error?: string }>(
        TERMINAL_OUTPUT_EVENT,
        (event) => {
          const payload = event.payload;
          if (payload.session_id !== sessionId) return;
          if (payload.error) {
            terminalRef.current?.writeln(`\r\n[Error] ${payload.error}`);
            return;
          }
          if (payload.data) {
            const bytes = base64ToBytes(payload.data);
            if (!bytes) return;
            const text = decoderRef.current.decode(bytes, { stream: true });
            terminalRef.current?.write(text);
          }
        }
      );
      unlistenDisconnect = await listen<{ session_id: string; reason: string }>(
        SESSION_DISCONNECTED_EVENT,
        (event) => {
          if (event.payload.session_id !== sessionId) return;
          setDisconnectReason(event.payload.reason || 'Connection closed');
        }
      );
      if (disposed) {
        // Unmounted while awaiting listen(): the cleanup already ran, so the
        // listeners must be released here or they leak.
        unlistenOutput?.();
        unlistenDisconnect?.();
        return;
      }

      try {
        await invoke('spawn_pty_process', { sessionId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // "already running" happens on a remount over a live session — benign.
        if (!message.toLowerCase().includes('already running')) {
          terminalRef.current?.writeln(`\r\n[Error] Failed to start shell: ${message}`);
          setDisconnectReason(message);
          return;
        }
      }
      if (disposed) return;
      // Sync the freshly spawned PTY to the real geometry (it starts at 80×24).
      fitAndResizeRemote();
    };
    void setup();

    return () => {
      disposed = true;
      unlistenOutput?.();
      unlistenDisconnect?.();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, writeToBackend, fitAndResizeRemote]);

  // Refit whenever the container's box changes — window resize, splitter
  // drags, and SFTP-panel resizes all land here via ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!isActive) return;
      fitAndResizeRemote();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isActive, fitAndResizeRemote]);

  // On activation the container goes from display:none to visible; fit then.
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      fitAndResizeRemote();
      terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, fitAndResizeRemote]);

  return (
    <div
      className="relative h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Terminal"
      />
      {disconnectReason && (
        <div
          className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-red-900/80 px-3 py-1.5 text-xs text-red-100"
          role="alert"
        >
          <span className="min-w-0 truncate">연결이 끊어졌습니다: {disconnectReason}</span>
        </div>
      )}
    </div>
  );
}
