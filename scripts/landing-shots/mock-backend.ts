/**
 * Stand-in for the Rust backend: answers the app's `invoke()` calls with the
 * demo data and streams terminal output through the mocked event bus.
 * Installed by capture-entry.tsx via `mockIPC(..., { shouldMockEvents: true })`.
 */
import { emit } from '@tauri-apps/api/event';
import type { InvokeArgs } from '@tauri-apps/api/core';
import type { SftpEntry } from '../../src/domains/sftp/types';
import {
  DEMO_PORT_FORWARD_STATUSES,
  DEMO_SFTP_LISTINGS,
  DEMO_TERMINALS,
  type DemoTerminal,
} from './demo-data';

const TERMINAL_OUTPUT_EVENT = 'terminal-output';
const HOME_ALIAS = '~';

/** Commands whose real result is "nothing" (fire-and-forget or void). */
const VOID_COMMANDS = new Set([
  'resize_pty',
  'write_to_terminal',
  'close_ssh_session',
  'plugin:window|start_dragging',
  'plugin:window|minimize',
  'plugin:window|close',
  'plugin:window|toggle_maximize',
  'plugin:window|set_decorations',
]);

type Args = Record<string, unknown>;

function findTerminal(runtimeSessionId: unknown): DemoTerminal | undefined {
  return Object.values(DEMO_TERMINALS).find((t) => t.runtimeSessionId === runtimeSessionId);
}

/** UTF-8 safe base64, matching what the backend puts in `terminal-output`. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Sends shell output to a terminal tab, as the backend's PTY reader does. */
export function writeTerminalOutput(runtimeSessionId: string, text: string): Promise<void> {
  return emit(TERMINAL_OUTPUT_EVENT, { session_id: runtimeSessionId, data: toBase64(text) });
}

function streamTerminalOutput(terminal: DemoTerminal) {
  // After the current invoke resolves, like a real shell's first bytes.
  window.setTimeout(() => {
    void writeTerminalOutput(terminal.runtimeSessionId, terminal.output);
  }, 0);
}

/** Same order as `read_sftp_directory` in src-tauri: folders first, then case-insensitive name. */
function compareLikeBackend(a: SftpEntry, b: SftpEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  const nameA = a.name.toLowerCase();
  const nameB = b.name.toLowerCase();
  if (nameA === nameB) return 0;
  return nameA < nameB ? -1 : 1;
}

function readSftpDirectory(args: Args) {
  const terminal = findTerminal(args.sessionId);
  if (!terminal) throw new Error('Session not found');
  const requested = String(args.path ?? HOME_ALIAS);
  const pathUsed = requested === HOME_ALIAS ? terminal.homePath : requested;
  const entries = DEMO_SFTP_LISTINGS[pathUsed];
  if (!entries) throw new Error(`No such file: ${pathUsed}`);
  return { entries: [...entries].sort(compareLikeBackend), pathUsed };
}

/** Keeps an upload "in flight" forever so the progress status stays on screen. */
const pendingForever = () => new Promise<never>(() => {});

export function handleDemoCommand(cmd: string, payload?: InvokeArgs): unknown {
  const args = (payload ?? {}) as Args;

  if (VOID_COMMANDS.has(cmd)) return null;

  switch (cmd) {
    // Window chrome: decorations: false → the app draws its own traffic lights.
    case 'plugin:window|is_decorated':
      return false;
    case 'plugin:window|is_maximized':
      return false;

    case 'list_port_forwards':
      return DEMO_PORT_FORWARD_STATUSES;

    case 'spawn_pty_process': {
      const terminal = findTerminal(args.sessionId);
      if (!terminal) throw new Error('Session not found');
      streamTerminalOutput(terminal);
      return null;
    }

    case 'read_sftp_directory':
      return readSftpDirectory(args);

    case 'upload_sftp_files':
      return pendingForever();

    default:
      console.warn(`[landing-shots] unmocked command: ${cmd}`, args);
      return null;
  }
}
