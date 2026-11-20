/**
 * Boots the real app UI (src/App.tsx) in a plain browser with the Tauri
 * backend mocked, then arranges one scene and publishes the crop rectangle
 * on `window.__shot` for capture.mjs.
 *
 * Usage: /scripts/landing-shots/capture.html?scene=<name from scenes.ts>
 */
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { DEMO_KEYS, DEMO_SESSIONS, DEMO_TERMINALS, DEMO_UPLOAD_PATHS } from './demo-data';
import { handleDemoCommand, writeTerminalOutput } from './mock-backend';
import { SCENES, sftpPanel, type ClipRect, type Scene } from './scenes';

declare global {
  interface Window {
    __shot?: { clip: ClipRect } | { error: string };
  }
}

/** localStorage keys the app reads at startup (see src/stores and src/components/layout). */
const STORAGE = {
  sessions: 'omniterm:sessions:v1',
  keys: 'omniterm:key-manager:v1',
  appearance: 'omniterm:appearance:v1',
  sidebarWidth: 'omniterm-sidebar-width-px',
  sftpPanelWidth: 'omniterm-sftp-panel-width-px',
  sftpPanelCollapsed: 'omniterm-sftp-panel-collapsed',
};

/** Must match SESSION_SCHEMA_VERSION in src/stores/sessionStore.ts so no migration runs. */
const SESSION_STORE_VERSION = 1;
const WAIT_TIMEOUT_MS = 10_000;
const WAIT_POLL_MS = 25;
const TERMINAL_FONT = '13px SFMono-Regular, Menlo, monospace';

function seedLocalStorage(scene: Scene) {
  localStorage.clear();
  const persist = (key: string, state: unknown, version = 0) =>
    localStorage.setItem(key, JSON.stringify({ state, version }));

  persist(
    STORAGE.sessions,
    { savedSessions: DEMO_SESSIONS, activeSessionId: scene.activeSavedSessionId ?? null },
    SESSION_STORE_VERSION
  );
  persist(STORAGE.keys, { registeredKeys: DEMO_KEYS });
  persist(STORAGE.appearance, {
    mode: 'dark',
    terminalThemeIdByMode: { dark: 'omniterm-dark', light: 'omniterm-light' },
  });

  const { sidebarWidthPx, sftpPanelWidthPx, isSftpCollapsed = false } = scene.layout;
  localStorage.setItem(STORAGE.sidebarWidth, String(sidebarWidthPx));
  if (sftpPanelWidthPx !== undefined) {
    localStorage.setItem(STORAGE.sftpPanelWidth, String(sftpPanelWidthPx));
  }
  localStorage.setItem(STORAGE.sftpPanelCollapsed, String(isSftpCollapsed));
}

async function waitFor<T>(description: string, probe: () => T | null | undefined | false): Promise<T> {
  const deadline = performance.now() + WAIT_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const value = probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function doubleClick(element: Element) {
  element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
}

/** Each output line as xterm shows it: color codes stripped, trimmed. */
function plainLines(output: string): string[] {
  // eslint-disable-next-line no-control-regex
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  return plain.split('\r\n').map((line) => line.trim());
}

/** Text of the terminal rows currently on screen, blank rows dropped. */
function paintedRows(panel: Element): string[] {
  return [...panel.querySelectorAll('.xterm-rows > div')]
    .map((row) => row.textContent?.trim() ?? '')
    .filter(Boolean);
}

/** Waits until `output` has been painted and its idle prompt is the last line on screen. */
async function waitForPaintedOutput(panel: Element, output: string, description: string) {
  const lines = plainLines(output);
  const idlePrompt = lines.at(-1) ?? '';
  // The last command typed is always near the bottom, so it is on screen in every crop.
  const lastCommand =
    [...lines].reverse().find((line) => line.startsWith(idlePrompt) && line !== idlePrompt) ??
    idlePrompt;
  await waitFor(description, () => {
    const rows = paintedRows(panel);
    return rows.at(-1) === idlePrompt && rows.includes(lastCommand);
  });
}

async function openTerminals(scene: Scene) {
  if (!scene.terminals?.length) return;
  const { useTerminalStore } = await import('../../src/stores/terminalStore');
  const { addTab, setActiveTab } = useTerminalStore.getState();

  const tabIdByKey = new Map<string, string>();
  for (const key of scene.terminals) {
    const terminal = DEMO_TERMINALS[key];
    tabIdByKey.set(key, addTab(terminal.runtimeSessionId, terminal.title));
  }
  const activeKey = scene.activeTerminal ?? scene.terminals[0];
  const activeTabId = tabIdByKey.get(activeKey);
  if (!activeTabId) throw new Error(`activeTerminal ${activeKey} is not in terminals`);
  setActiveTab(activeTabId);

  const activeTerminal = DEMO_TERMINALS[activeKey];
  const panel = await waitFor('active terminal panel', () =>
    document.getElementById(`terminal-panel-${activeTabId}`)
  );
  await waitForPaintedOutput(panel, activeTerminal.output, 'terminal output');

  for (const key of scene.followUpTerminals ?? []) {
    const { runtimeSessionId, followUpOutput } = DEMO_TERMINALS[key];
    if (!followUpOutput) throw new Error(`Terminal ${key} has no followUpOutput`);
    await writeTerminalOutput(runtimeSessionId, followUpOutput);
  }
  const activeFollowUp = scene.followUpTerminals?.includes(activeKey) && activeTerminal.followUpOutput;
  if (activeFollowUp) {
    await waitForPaintedOutput(panel, activeFollowUp, 'follow-up terminal output');
    // Scrolling to the new output flashes xterm's scrollbar; let it fade out.
    await nextFrame();
    await nextFrame();
    await waitFor('terminal scrollbar to fade', () =>
      !panel.querySelector('.xterm-scrollable-element > .scrollbar.visible')
    );
  }
  return panel;
}

async function browseSftp(targetPath: string) {
  const parts = targetPath.split('/').filter(Boolean);
  // Home is /home/<user>; walk down from there one folder at a time.
  const remaining = parts.slice(2);
  for (const folder of remaining) {
    const row = await waitFor(`SFTP folder ${folder}`, () =>
      document.querySelector(`[aria-label="Folder ${folder} (double-click to open)"]`)
    );
    doubleClick(row);
  }
  await waitFor(`SFTP path ${targetPath}`, () =>
    document.querySelector(`nav[aria-label="Path breadcrumbs"] button[title="${targetPath}"]`)
  );
}

async function simulateUploadDrop() {
  const rect = sftpPanel().getBoundingClientRect();
  // Tauri reports drag positions in physical pixels.
  const scale = window.devicePixelRatio || 1;
  const position = {
    x: Math.round((rect.left + rect.width / 2) * scale),
    y: Math.round((rect.top + rect.height / 2) * scale),
  };
  const statusText = () => document.body.textContent ?? '';

  await emit('tauri://drag-drop', { paths: DEMO_UPLOAD_PATHS, position });
  await waitFor('upload status', () => statusText().includes('Uploading'));
  // A second batch hovering over the panel while the first one uploads.
  await emit('tauri://drag-over', { position });
  await waitFor('drop hover banner', () => statusText().includes('Drop files to upload'));
}

async function run() {
  const sceneName = new URLSearchParams(window.location.search).get('scene') ?? '';
  const scene = SCENES[sceneName];
  if (!scene) throw new Error(`Unknown scene "${sceneName}"`);

  seedLocalStorage(scene);
  mockWindows('main');
  mockIPC(handleDemoCommand, { shouldMockEvents: true });

  // xterm measures glyphs when it opens, so the font must be ready first.
  await document.fonts.load(TERMINAL_FONT);

  // Imported only now: the persisted stores read localStorage when first loaded.
  const [{ createRoot }, { default: App }, { useAppearanceStore }, { applyAppearanceMode }] =
    await Promise.all([
      import('react-dom/client'),
      import('../../src/App'),
      import('../../src/stores/appearanceStore'),
      import('../../src/domains/appearance/utils/applyAppearanceMode'),
      import('../../src/index.css'),
    ]);
  applyAppearanceMode(useAppearanceStore.getState().mode);

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Missing #root');
  // No StrictMode: its double-mounted effects would spawn every shell twice.
  createRoot(rootElement).render(<App />);
  await waitFor('app shell', () => document.querySelector('aside'));

  if (scene.sidebarTab === 'keys') {
    (await waitFor('Key Manager tab', () => document.getElementById('tab-keys')))?.click();
  }

  const terminalPanel = await openTerminals(scene);
  if (scene.sftpPath) await browseSftp(scene.sftpPath);
  if (scene.showUploadDrop) await simulateUploadDrop();

  // Focus the active shell so its cursor renders as a solid block.
  terminalPanel?.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea')?.focus();

  await document.fonts.ready;
  await nextFrame();
  await nextFrame();

  const clip = scene.clip();
  window.__shot = {
    clip: {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.round(clip.width),
      height: Math.round(clip.height),
    },
  };
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[landing-shots]', message);
  window.__shot = { error: message };
});
