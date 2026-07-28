import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalView } from '../terminal/TerminalView';
import { SftpExplorer } from '../../domains/sftp/components/SftpExplorer';
import { PanelLeftOpen, X } from 'lucide-react';

const SFTP_PANEL_MIN_PX = 200;
const SFTP_PANEL_MAX_PX = 480;
const SFTP_PANEL_DEFAULT_PX = 260;
const MAIN_RESIZE_HANDLE_WIDTH_PX = 6;
const STORAGE_KEY_SFTP_PANEL_WIDTH = 'omniterm-sftp-panel-width-px';
const STORAGE_KEY_SFTP_PANEL_COLLAPSED = 'omniterm-sftp-panel-collapsed';

function getStoredSftpPanelWidthPx(): number | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY_SFTP_PANEL_WIDTH);
    if (value === null) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num < SFTP_PANEL_MIN_PX || num > SFTP_PANEL_MAX_PX) return null;
    return num;
  } catch {
    return null;
  }
}

function clampSftpPanelWidthPx(value: number): number {
  return Math.min(SFTP_PANEL_MAX_PX, Math.max(SFTP_PANEL_MIN_PX, value));
}

function persistSftpPanelWidthPx(widthPx: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY_SFTP_PANEL_WIDTH, String(widthPx));
  } catch {
    // ignore
  }
}

export function MainArea() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const removeTab = useTerminalStore((s) => s.removeTab);
  const [sftpPanelWidthPx, setSftpPanelWidthPx] = useState(() => {
    const stored = getStoredSftpPanelWidthPx();
    return stored ?? SFTP_PANEL_DEFAULT_PX;
  });
  const [isSftpCollapsed, setIsSftpCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY_SFTP_PANEL_COLLAPSED) === 'true';
    } catch {
      return false;
    }
  });

  const toggleSftpCollapsed = useCallback(() => {
    setIsSftpCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(STORAGE_KEY_SFTP_PANEL_COLLAPSED, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const closeTab = useCallback(
    (tabId: string, sessionId: string) => {
      // Closing the tab always tears down the backend session; the tab is
      // removed regardless so a backend failure can't strand the UI.
      invoke('close_ssh_session', { sessionId }).finally(() => {
        removeTab(tabId);
      });
    },
    [removeTab]
  );

  // Pointer-capture drag: keeps receiving moves even outside the window and
  // ends reliably on pointerup/pointercancel (a mouseup delivered outside the
  // webview can never leave the drag stuck). Width updates go through rAF and
  // localStorage is written once, at drag end — not per move event.
  const onSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = { startX: e.clientX, startWidth: sftpPanelWidthPx };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sftpPanelWidthPx]
  );

  const onSplitterPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const next = clampSftpPanelWidthPx(drag.startWidth + (e.clientX - drag.startX));
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setSftpPanelWidthPx(next);
      rafRef.current = null;
    });
  }, []);

  const onSplitterPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setSftpPanelWidthPx((width) => {
      persistSftpPanelWidthPx(width);
      return width;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onSftpPanelWidthChange = useCallback((widthPx: number) => {
    const clamped = clampSftpPanelWidthPx(widthPx);
    setSftpPanelWidthPx(clamped);
    persistSftpPanelWidthPx(clamped);
  }, []);

  // Global tab shortcuts: Cmd/Ctrl+W close, Cmd/Ctrl+1..9 jump, Ctrl+Tab cycle.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (tabs.length === 0) return;
      const activeIndex = tabs.findIndex((t) => t.id === activeTabId);

      if (mod && (e.key === 'w' || e.key === 'W')) {
        const active = tabs[activeIndex];
        if (active) {
          e.preventDefault();
          closeTab(active.id, active.sessionId);
        }
        return;
      }
      if (mod && e.key >= '1' && e.key <= '9') {
        const target = tabs[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          setActiveTab(target.id);
        }
        return;
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        const next = tabs[(activeIndex + delta + tabs.length) % tabs.length];
        if (next) setActiveTab(next.id);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [tabs, activeTabId, closeTab, setActiveTab]);

  // Number duplicate titles so two tabs to the same host stay tellable apart.
  const displayTitles = (() => {
    const counts = new Map<string, number>();
    return tabs.map((tab) => {
      const nth = (counts.get(tab.title) ?? 0) + 1;
      counts.set(tab.title, nth);
      return nth > 1 ? `${tab.title} (${nth})` : tab.title;
    });
  })();

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-zinc-950">
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* SFTP panel — collapsible next to terminal */}
        {isSftpCollapsed ? (
          <div className="flex min-h-0 shrink-0 flex-col items-center border-r border-zinc-800 bg-zinc-900/80 py-2">
            <button
              type="button"
              onClick={toggleSftpCollapsed}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              aria-label="Expand SFTP panel"
              title="Expand SFTP panel"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div
            className="flex min-h-0 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/80"
            style={{ width: sftpPanelWidthPx }}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-2">
              <SftpExplorer onCollapse={toggleSftpCollapsed} />
            </div>
          </div>
        )}

        {/* Resize handle between SFTP and Terminal */}
        {!isSftpCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize SFTP and terminal panels"
          aria-valuenow={sftpPanelWidthPx}
          aria-valuemin={SFTP_PANEL_MIN_PX}
          aria-valuemax={SFTP_PANEL_MAX_PX}
          tabIndex={0}
          onPointerDown={onSplitterPointerDown}
          onPointerMove={onSplitterPointerMove}
          onPointerUp={onSplitterPointerEnd}
          onPointerCancel={onSplitterPointerEnd}
          onKeyDown={(e) => {
            const step = 16;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onSftpPanelWidthChange(sftpPanelWidthPx - step);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              onSftpPanelWidthChange(sftpPanelWidthPx + step);
            }
          }}
          className="group flex shrink-0 cursor-col-resize items-stretch border-r border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
          style={{ width: MAIN_RESIZE_HANDLE_WIDTH_PX }}
        >
          <div
            className="pointer-events-none m-auto flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ width: 2 }}
            aria-hidden
          >
            <span className="h-0.5 w-full rounded-full bg-zinc-500" />
            <span className="h-0.5 w-full rounded-full bg-zinc-500" />
            <span className="h-0.5 w-full rounded-full bg-zinc-500" />
          </div>
        </div>
        )}

        {/* Terminal panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          {tabs.length === 0 ? (
            <>
              <div className="flex shrink-0 items-center border-b border-zinc-800 px-3 py-2">
                <span className="text-xs font-medium text-zinc-500">Terminal</span>
              </div>
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-8 py-6 text-center text-sm text-zinc-500">
                  <p>Connect to a server to open a terminal</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Use the session form in the sidebar, then connect
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex shrink-0 items-center border-b border-zinc-800">
                <div
                  className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto"
                  role="tablist"
                  aria-label="Terminal tabs"
                >
                  {tabs.map((tab, index) => (
                    // Plain container: the tab itself and the close control are
                    // sibling buttons — interactive elements must not nest.
                    <div
                      key={tab.id}
                      className={`flex min-w-0 shrink-0 items-center gap-0.5 border-b-2 pr-1 transition-colors ${
                        activeTabId === tab.id
                          ? 'border-zinc-400 bg-zinc-900 text-zinc-100'
                          : 'border-transparent text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
                      }`}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTabId === tab.id}
                        aria-controls={`terminal-panel-${tab.id}`}
                        id={`tab-${tab.id}`}
                        tabIndex={activeTabId === tab.id ? 0 : -1}
                        onClick={() => setActiveTab(tab.id)}
                        onKeyDown={(e) => {
                          // Roving tabindex: arrows move and activate tabs.
                          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                            e.preventDefault();
                            const delta = e.key === 'ArrowRight' ? 1 : -1;
                            const next = tabs[(index + delta + tabs.length) % tabs.length];
                            setActiveTab(next.id);
                            document.getElementById(`tab-${next.id}`)?.focus();
                          }
                        }}
                        className="min-w-0 truncate px-3 py-2 text-left text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
                        title={displayTitles[index]}
                      >
                        {displayTitles[index]}
                      </button>
                      <button
                        type="button"
                        onClick={() => closeTab(tab.id, tab.sessionId)}
                        className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                        aria-label={`Close ${displayTitles[index]}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative min-h-0 flex-1">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    id={`terminal-panel-${tab.id}`}
                    role="tabpanel"
                    aria-labelledby={`tab-${tab.id}`}
                    className="absolute inset-0 h-full w-full"
                    style={{ display: activeTabId === tab.id ? 'block' : 'none' }}
                  >
                    <TerminalView
                      sessionId={tab.sessionId}
                      isActive={activeTabId === tab.id}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
