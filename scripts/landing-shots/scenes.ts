/**
 * Browser-side scene definitions: the app state each screenshot needs and the
 * region to crop. The viewport size of each shot lives in capture.mjs.
 */
import { DEPLOY_APP_DIR, type DemoTerminalKey } from './demo-data';

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneLayout {
  sidebarWidthPx: number;
  sftpPanelWidthPx?: number;
  isSftpCollapsed?: boolean;
}

export interface Scene {
  layout: SceneLayout;
  /** Saved session selected in the sidebar (also pre-fills the session form). */
  activeSavedSessionId?: string;
  sidebarTab?: 'sessions' | 'keys';
  /** Terminal tabs to open, in order. */
  terminals?: DemoTerminalKey[];
  activeTerminal?: DemoTerminalKey;
  /** Terminals that also run their `followUpOutput` (more history, so a shell fills its pane). */
  followUpTerminals?: DemoTerminalKey[];
  /** Absolute SFTP directory to browse into, by double-clicking folder rows from home. */
  sftpPath?: string;
  /** Simulate a finder drop onto the SFTP panel (upload in flight + drop hover). */
  showUploadDrop?: boolean;
  clip: () => ClipRect;
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function query<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function parentOf(element: Element, levels: number): HTMLElement {
  let current: Element = element;
  for (let i = 0; i < levels; i++) {
    if (!current.parentElement) throw new Error('Unexpected DOM shape');
    current = current.parentElement;
  }
  return current as HTMLElement;
}

function findByText(selector: string, text: string): HTMLElement {
  const match = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (element) => element.textContent?.trim() === text
  );
  if (!match) throw new Error(`Missing ${selector} with text "${text}"`);
  return match;
}

function rectOf(element: Element): ClipRect {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/** Full-width slice of `container` between two y coordinates. */
function verticalSlice(container: Element, top: number, bottom: number): ClipRect {
  const box = rectOf(container);
  return { x: box.x, y: top, width: box.width, height: bottom - top };
}

const viewport = (): ClipRect => ({
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

const sidebar = () => query('aside');

/** Tab bar + terminal stack (the column right of the SFTP panel). */
export const terminalColumn = () =>
  parentOf(query('[role="tablist"][aria-label="Terminal tabs"]'), 2);

/** The SFTP panel including its right border. */
export const sftpPanel = () => {
  const explorerRoot = query('[aria-label="Collapse SFTP panel"]').closest('div.relative');
  if (!explorerRoot) throw new Error('Missing SFTP explorer root');
  return parentOf(explorerRoot, 2);
};

/** The xterm screen of the visible terminal tab (rows × cell height, no leftover). */
function activeTerminalScreen(): HTMLElement {
  const panel = [...document.querySelectorAll<HTMLElement>('[id^="terminal-panel-"]')].find(
    (element) => element.style.display !== 'none'
  );
  if (!panel) throw new Error('No visible terminal panel');
  return query('.xterm-screen', panel);
}

/**
 * Tab bar + terminal, cut on a text-row boundary so the partial row xterm
 * leaves at the bottom of its container never shows as a band.
 */
function terminalColumnCrop(maxHeight: number): ClipRect {
  const column = rectOf(terminalColumn());
  const screen = activeTerminalScreen();
  const screenRect = rectOf(screen);
  const rowHeight = rectOf(query('.xterm-rows > div', screen)).height;
  const limit = Math.min(screenRect.y + screenRect.height, column.y + maxHeight);
  const visibleRows = Math.floor((limit - screenRect.y) / rowHeight);
  const bottom = screenRect.y + visibleRows * rowHeight;
  return { x: column.x, y: column.y, width: column.width, height: bottom - column.y };
}

/** Breathing room kept around a cropped block, in CSS px. */
const CROP_PADDING_PX = 12;

// ─── Scenes ──────────────────────────────────────────────────────────────────

const ALL_TABS: DemoTerminalKey[] = ['prodApi', 'stagingWeb', 'dbReplica'];

/** Logical size of the macOS window-corner crop. */
const MACOS_CROP = { width: 520, height: 380 };

/** Wide enough that feature crops of the sidebar land at ~460 CSS px. */
const FEATURE_SIDEBAR_PX = 460;

export const SCENES: Record<string, Scene> = {
  hero: {
    layout: { sidebarWidthPx: 340, sftpPanelWidthPx: 320 },
    activeSavedSessionId: 'sess-prod-api',
    terminals: ALL_TABS,
    activeTerminal: 'prodApi',
    followUpTerminals: ['prodApi'],
    sftpPath: DEPLOY_APP_DIR,
    clip: viewport,
  },

  'hero-mobile': {
    layout: { sidebarWidthPx: 288, isSftpCollapsed: true },
    activeSavedSessionId: 'sess-prod-api',
    terminals: ALL_TABS,
    activeTerminal: 'prodApi',
    followUpTerminals: ['prodApi'],
    clip: () => terminalColumnCrop(520),
  },

  'feature-tabs': {
    layout: { sidebarWidthPx: 288, isSftpCollapsed: true },
    activeSavedSessionId: 'sess-staging-web',
    terminals: ALL_TABS,
    activeTerminal: 'stagingWeb',
    followUpTerminals: ['stagingWeb'],
    clip: () => terminalColumnCrop(320),
  },

  'feature-sftp': {
    layout: { sidebarWidthPx: 288, sftpPanelWidthPx: 460 },
    activeSavedSessionId: 'sess-prod-api',
    terminals: ['prodApi'],
    activeTerminal: 'prodApi',
    sftpPath: DEPLOY_APP_DIR,
    showUploadDrop: true,
    clip: () => rectOf(sftpPanel()),
  },

  'feature-keys': {
    layout: { sidebarWidthPx: FEATURE_SIDEBAR_PX },
    sidebarTab: 'keys',
    clip: () => {
      const list = query('[aria-label="Registered private keys"]');
      return verticalSlice(sidebar(), rectOf(sidebar()).y, rectOf(list).y + rectOf(list).height + CROP_PADDING_PX);
    },
  },

  'feature-sessions': {
    layout: { sidebarWidthPx: FEATURE_SIDEBAR_PX },
    activeSavedSessionId: 'sess-prod-api',
    clip: () => {
      const block = findByText('h3', 'Saved sessions').closest('div.border-b');
      if (!block) throw new Error('Missing saved sessions block');
      const blockRect = rectOf(block);
      return verticalSlice(sidebar(), rectOf(sidebar()).y, blockRect.y + blockRect.height + CROP_PADDING_PX / 2);
    },
  },

  'feature-bastion': {
    layout: { sidebarWidthPx: FEATURE_SIDEBAR_PX },
    activeSavedSessionId: 'sess-prod-api',
    clip: () => {
      const targetFieldset = findByText('legend', 'Target Server').closest('fieldset');
      const bastionFieldset = findByText('legend', 'Bastion Server').closest('fieldset');
      if (!targetFieldset || !bastionFieldset) throw new Error('Missing session form fieldsets');
      const top = rectOf(targetFieldset).y - CROP_PADDING_PX;
      const bastionRect = rectOf(bastionFieldset);
      return verticalSlice(sidebar(), top, bastionRect.y + bastionRect.height + CROP_PADDING_PX);
    },
  },

  // Top-left corner of the window: traffic lights, centered title, sidebar
  // and the first terminal tabs. The viewport (capture.mjs) is narrow enough
  // that the centered "Omniterm" title falls inside the crop.
  'feature-macos': {
    layout: { sidebarWidthPx: 288, isSftpCollapsed: true },
    activeSavedSessionId: 'sess-prod-api',
    terminals: ALL_TABS,
    activeTerminal: 'prodApi',
    clip: () => ({ x: 0, y: 0, width: MACOS_CROP.width, height: MACOS_CROP.height }),
  },
};
