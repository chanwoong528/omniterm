import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const clampWidth = useCallback((value: number) => {
    return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, value));
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidthPx;
      setIsDragging(true);
    },
    [sidebarWidthPx]
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = clampWidth(startWidthRef.current + delta);
      onSidebarWidthChange(newWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

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
  }, [isDragging, clampWidth, onSidebarWidthChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={sidebarWidthPx}
      aria-valuemin={SIDEBAR_MIN_PX}
      aria-valuemax={SIDEBAR_MAX_PX}
      aria-label="Resize sidebar"
      tabIndex={0}
      onMouseDown={onMouseDown}
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
