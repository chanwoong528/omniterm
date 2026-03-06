import { useCallback, useState } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainArea } from './components/layout/MainArea';
import {
  ResizeHandle,
  SIDEBAR_DEFAULT_PX,
  SIDEBAR_MAX_PX,
  SIDEBAR_MIN_PX,
} from './components/layout/ResizeHandle';

const STORAGE_KEY_SIDEBAR_WIDTH = 'omniterm-sidebar-width-px';

function getStoredSidebarWidthPx(): number | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY_SIDEBAR_WIDTH);
    if (value === null) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num < SIDEBAR_MIN_PX || num > SIDEBAR_MAX_PX) return null;
    return num;
  } catch {
    return null;
  }
}

function clampSidebarWidthPx(value: number): number {
  return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, value));
}

function App() {
  const [sidebarWidthPx, setSidebarWidthPx] = useState(() => {
    const stored = getStoredSidebarWidthPx();
    return stored ?? SIDEBAR_DEFAULT_PX;
  });

  const onSidebarWidthChange = useCallback((widthPx: number) => {
    const clamped = clampSidebarWidthPx(widthPx);
    setSidebarWidthPx(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY_SIDEBAR_WIDTH, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-x-hidden bg-zinc-900 text-zinc-100">
      <TitleBar />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Sidebar widthPx={sidebarWidthPx} />
        <ResizeHandle
          sidebarWidthPx={sidebarWidthPx}
          onSidebarWidthChange={onSidebarWidthChange}
        />
        <MainArea />
      </div>
    </div>
  );
}

export default App;
