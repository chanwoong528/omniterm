import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalView } from '../terminal/TerminalView';
import { SftpExplorer } from '../../domains/sftp/components/SftpExplorer';
import { X } from 'lucide-react';

const SFTP_PANEL_MIN_PX = 200;
const SFTP_PANEL_MAX_PX = 480;
const SFTP_PANEL_DEFAULT_PX = 260;
const MAIN_RESIZE_HANDLE_WIDTH_PX = 6;
const STORAGE_KEY_SFTP_PANEL_WIDTH = 'omniterm-sftp-panel-width-px';

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

export function MainArea() {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTerminalStore();
  const [sftpPanelWidthPx, setSftpPanelWidthPx] = useState(() => {
    const stored = getStoredSftpPanelWidthPx();
    return stored ?? SFTP_PANEL_DEFAULT_PX;
  });
  const [isDraggingMain, setIsDraggingMain] = useState(false);
  const mainStartXRef = useRef(0);
  const mainStartWidthRef = useRef(0);

  const onSftpPanelWidthChange = useCallback((widthPx: number) => {
    const clamped = clampSftpPanelWidthPx(widthPx);
    setSftpPanelWidthPx(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY_SFTP_PANEL_WIDTH, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const onMainResizeHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      mainStartXRef.current = e.clientX;
      mainStartWidthRef.current = sftpPanelWidthPx;
      setIsDraggingMain(true);
    },
    [sftpPanelWidthPx]
  );

  useEffect(() => {
    if (!isDraggingMain) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - mainStartXRef.current;
      onSftpPanelWidthChange(mainStartWidthRef.current + delta);
    };
    const onMouseUp = () => setIsDraggingMain(false);
    document.addEventListener('mousemove', onMouseMove, { capture: true });
    document.addEventListener('mouseup', onMouseUp, { capture: true });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMouseMove, { capture: true });
      document.removeEventListener('mouseup', onMouseUp, { capture: true });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingMain, onSftpPanelWidthChange]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-zinc-950">
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* SFTP panel - always visible next to terminal */}
        <div
          className="flex min-h-0 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/80"
          style={{ width: sftpPanelWidthPx }}
        >
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
            <SftpExplorer />
          </div>
        </div>

        {/* Resize handle between SFTP and Terminal */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize SFTP and terminal panels"
          tabIndex={0}
          onMouseDown={onMainResizeHandleMouseDown}
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
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      role="tab"
                      aria-selected={activeTabId === tab.id}
                      aria-controls={`terminal-panel-${tab.id}`}
                      id={`tab-${tab.id}`}
                      tabIndex={0}
                      onClick={() => setActiveTab(tab.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveTab(tab.id);
                        }
                      }}
                      className={`flex min-w-0 shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
                        activeTabId === tab.id
                          ? 'border-zinc-400 bg-zinc-900 text-zinc-100'
                          : 'border-transparent text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
                      }`}
                    >
                      <span className="truncate" title={tab.title}>
                        {tab.title}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTab(tab.id);
                        }}
                        className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                        aria-label={`Close ${tab.title}`}
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
