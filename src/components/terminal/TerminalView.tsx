import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

const TERMINAL_OUTPUT_EVENT = 'terminal-output';

interface TerminalViewProps {
  sessionId: string;
  isActive: boolean;
}

function decodeBase64ToUtf8(base64: string): string {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function TerminalView({ sessionId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const writeToBackend = useCallback(
    (data: string) => {
      invoke('write_to_terminal', { sessionId, data }).catch(() => {
        // Session may be closed; ignore
      });
    },
    [sessionId]
  );

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
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(el);
    fitAddon.fit();

    term.onData((data) => writeToBackend(data));

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, writeToBackend]);

  useEffect(() => {
    const unlisten = listen<{ session_id: string; data?: string; error?: string }>(
      TERMINAL_OUTPUT_EVENT,
      (event) => {
        const payload = event.payload;
        if (payload.session_id !== sessionId) return;
        if (payload.error) {
          terminalRef.current?.writeln(`\r\n[Error] ${payload.error}`);
          return;
        }
        if (payload.data) {
          const text = decodeBase64ToUtf8(payload.data);
          terminalRef.current?.write(text);
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [sessionId]);

  useEffect(() => {
    if (!isActive) return;
    const fit = fitAddonRef.current;
    if (!fit) return;
    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    const t = setTimeout(() => fit.fit(), 0);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
      role="application"
      aria-label={`Terminal for session ${sessionId}`}
    />
  );
}
