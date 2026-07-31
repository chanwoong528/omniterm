import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, Minus, Square, Copy } from 'lucide-react';

const IS_ACTUALLY_MACOS = navigator.userAgent.includes('Mac');

// dev 미리보기: VITE_TITLEBAR=windows npm run tauri dev 로 실행하면
// macOS에서도 Windows 타이틀바 UI를 확인할 수 있다.
const FORCED_TITLEBAR = import.meta.env.VITE_TITLEBAR as 'mac' | 'windows' | undefined;

const IS_MACOS = FORCED_TITLEBAR ? FORCED_TITLEBAR === 'mac' : IS_ACTUALLY_MACOS;

export function TitleBar() {
  return IS_MACOS ? <MacTitleBar /> : <WindowsTitleBar />;
}

function useWindowControls() {
  const currentWindow = getCurrentWindow();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDecorated, setIsDecorated] = useState(true);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const syncMaximized = async () => {
      setIsMaximized(await currentWindow.isMaximized());
    };

    syncMaximized();
    currentWindow.isDecorated().then(setIsDecorated);
    currentWindow.onResized(syncMaximized).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMinimize = () => {
    currentWindow.minimize();
  };

  const onClose = () => {
    currentWindow.close();
  };

  const onToggleMaximize = () => {
    currentWindow.toggleMaximize();
  };

  const onDragBarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // SVGElement(버튼 안 아이콘)도 포함해야 하므로 HTMLElement가 아닌 Element로 체크
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button')) return;

    // 더블클릭이면 최대화 토글, 아니면 창 드래그 시작
    if (e.detail === 2) {
      currentWindow.toggleMaximize();
      return;
    }
    currentWindow.startDragging();
  };

  return { isMaximized, isDecorated, onMinimize, onClose, onToggleMaximize, onDragBarMouseDown };
}

// macOS: 네이티브 신호등 버튼(titleBarStyle: Overlay)이 왼쪽 위에 오버레이되므로
// 기본적으로는 드래그 영역과 중앙 타이틀만 렌더링한다.
// 단, 창이 장식 없이(decorations: false) 뜬 경우엔 커스텀 신호등을 폴백으로 그린다.
function MacTitleBar() {
  const { isDecorated, onMinimize, onClose, onToggleMaximize, onDragBarMouseDown } =
    useWindowControls();

  return (
    <div
      role="banner"
      className="relative flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900 px-4"
      onMouseDown={onDragBarMouseDown}
    >
      {!isDecorated && (
        <div className="group flex items-center gap-2">
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
      )}

      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-medium text-zinc-400">
        Omniterm
      </span>
    </div>
  );
}

// Windows/Linux: decorations: false이므로 창 컨트롤을 직접 렌더링한다.
// Windows 표준을 따라 타이틀은 왼쪽, 컨트롤(최소화/최대화/닫기)은 오른쪽에 배치.
function WindowsTitleBar() {
  const { isMaximized, onMinimize, onClose, onToggleMaximize, onDragBarMouseDown } =
    useWindowControls();

  // 실제 macOS 위에서 Windows 타이틀바를 미리보기하는 경우,
  // 네이티브 신호등이 겹치지 않도록 창 장식을 잠시 끈다.
  useEffect(() => {
    if (!IS_ACTUALLY_MACOS) return;
    const currentWindow = getCurrentWindow();
    currentWindow.setDecorations(false);
    return () => {
      currentWindow.setDecorations(true);
    };
  }, []);

  return (
    <div
      role="banner"
      className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900"
      onMouseDown={onDragBarMouseDown}
    >
      <div className="pointer-events-none flex flex-1 items-center pl-4 text-sm font-medium text-zinc-400">
        Omniterm
      </div>

      <div className="flex h-full items-stretch">
        <button
          type="button"
          onClick={onMinimize}
          className="flex w-12 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100"
          aria-label="Minimize window"
          tabIndex={0}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onToggleMaximize}
          className="flex w-12 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100"
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          tabIndex={0}
        >
          {isMaximized ? (
            <Copy className="h-3 w-3 -scale-x-100" strokeWidth={1.5} />
          ) : (
            <Square className="h-3 w-3" strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex w-12 items-center justify-center text-zinc-400 transition-colors hover:bg-[#e81123] hover:text-white"
          aria-label="Close window"
          tabIndex={0}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
