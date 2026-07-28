import { useCallback, useEffect, useRef } from 'react';

const HANDLE_WIDTH_PX = 6;

export const SIDEBAR_MIN_PX = 200;
export const SIDEBAR_MAX_PX = 560;
export const SIDEBAR_DEFAULT_PX = 288;

interface ResizeHandleProps {
  sidebarWidthPx: number;
  onSidebarWidthChange: (widthPx: number) => void;
}

export function ResizeHandle({
  sidebarWidthPx,
  onSidebarWidthChange,
}: ResizeHandleProps) {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const clampWidth = useCallback((value: number) => {
    return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, value));
  }, []);

  // Pointer-capture drag: keeps receiving moves outside the window and ends
  // reliably on pointerup/pointercancel, so the drag can never get stuck.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidthPx };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidthPx]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const next = clampWidth(drag.startWidth + (e.clientX - drag.startX));
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onSidebarWidthChange(next);
        rafRef.current = null;
      });
    },
    [clampWidth, onSidebarWidthChange]
  );

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={sidebarWidthPx}
      aria-valuemin={SIDEBAR_MIN_PX}
      aria-valuemax={SIDEBAR_MAX_PX}
      aria-label="Resize sidebar"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={(e) => {
        const step = 16;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onSidebarWidthChange(clampWidth(sidebarWidthPx - step));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onSidebarWidthChange(clampWidth(sidebarWidthPx + step));
        }
      }}
      className="group flex shrink-0 cursor-col-resize items-stretch border-l border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset"
      style={{ width: HANDLE_WIDTH_PX }}
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
  );
}
