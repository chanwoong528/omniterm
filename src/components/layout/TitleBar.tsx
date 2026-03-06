import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, Minus, Square } from 'lucide-react';

export function TitleBar() {
  const currentWindow = getCurrentWindow();

  const onClose = () => {
    currentWindow.close();
  };

  const onMinimize = () => {
    currentWindow.minimize();
  };

  const onToggleMaximize = async () => {
    const isMaximized = await currentWindow.isMaximized();
    if (isMaximized) {
      currentWindow.unmaximize();
    } else {
      currentWindow.maximize();
    }
  };

  const onTitleBarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('button')) return;
    currentWindow.startDragging();
  };

  return (
    <div
      data-tauri-drag-region
      role="banner"
      className="flex h-9 shrink-0 cursor-grab active:cursor-grabbing items-center border-b border-zinc-800 bg-zinc-900 pl-4 pr-4"
      onMouseDown={onTitleBarMouseDown}
    >
      {/* macOS-style traffic lights - 버튼만 클릭 가능, 주변은 드래그 영역 */}
      <div
        data-tauri-drag-region
        className="group flex items-center gap-1.5"
        style={{ marginLeft: 4 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] transition-colors hover:bg-[#ff5f57]/90"
          aria-label="Close window"
          tabIndex={0}
        >
          <X className="h-1.5 w-1.5 opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={onMinimize}
          className="flex h-3 w-3 items-center justify-center rounded-full bg-[#febc2e] transition-colors hover:bg-[#febc2e]/90"
          aria-label="Minimize window"
          tabIndex={0}
        >
          <Minus className="h-1.5 w-1.5 opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={onToggleMaximize}
          className="flex h-3 w-3 items-center justify-center rounded-full bg-[#28c840] transition-colors hover:bg-[#28c840]/90"
          aria-label="Maximize window"
          tabIndex={0}
        >
          <Square className="h-1.5 w-1.5 opacity-0 group-hover:opacity-100" strokeWidth={2.5} />
        </button>
      </div>

      <div
        data-tauri-drag-region
        className="flex flex-1 items-center justify-center text-sm font-medium text-zinc-400"
      >
        OmniTerm
      </div>

      {/* Spacer for balance */}
      <div className="w-[52px]" aria-hidden />
    </div>
  );
}
