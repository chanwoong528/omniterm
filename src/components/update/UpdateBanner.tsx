import { useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ArrowDownToLine, RefreshCw, X } from 'lucide-react';

type UpdateStatus =
  | { phase: 'hidden' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; percent: number | null }
  | { phase: 'installed' }
  | { phase: 'error'; message: string };

/**
 * 앱 시작 시 GitHub Release의 latest.json을 확인해 새 버전이 있으면
 * 타이틀바 아래에 배너를 띄운다. "업데이트" 클릭 → 다운로드/설치 → 재시작.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'hidden' });
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    // dev 서버에는 서명된 번들이 없어 check()가 항상 실패한다.
    if (import.meta.env.DEV) return;

    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const update = await check();
        if (cancelled || !update) return;
        updateRef.current = update;
        setStatus({ phase: 'available', version: update.version });
      } catch {
        // 오프라인이거나 릴리스에 latest.json이 없는 경우 — 조용히 무시.
      }
    };

    checkForUpdate();
    return () => {
      cancelled = true;
    };
  }, []);

  const onInstallClick = async () => {
    const update = updateRef.current;
    if (!update) return;

    setStatus({ phase: 'downloading', percent: null });
    let totalBytes = 0;
    let receivedBytes = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            receivedBytes += event.data.chunkLength;
            setStatus({
              phase: 'downloading',
              percent:
                totalBytes > 0
                  ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
                  : null,
            });
            break;
          case 'Finished':
            setStatus({ phase: 'installed' });
            break;
        }
      });
      // Windows는 설치 프로그램이 앱을 종료·재시작하므로 여기 도달하지 않을 수 있다.
      await relaunch();
    } catch (error) {
      setStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onDismissClick = () => {
    setStatus({ phase: 'hidden' });
  };

  if (status.phase === 'hidden') return null;

  return (
    <div
      role="status"
      className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-800/60 px-4 text-sm"
    >
      {status.phase === 'available' && (
        <>
          <ArrowDownToLine className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="min-w-0 truncate text-zinc-200">
            A new version v{status.version} is available.
          </span>
          <button
            type="button"
            onClick={onInstallClick}
            className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            aria-label="Update now"
            tabIndex={0}
          >
            Update
          </button>
          <button
            type="button"
            onClick={onDismissClick}
            className="ml-auto shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            aria-label="Dismiss update notification"
            tabIndex={0}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {status.phase === 'downloading' && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
          <span className="shrink-0 text-zinc-200">Downloading update…</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${status.percent ?? 100}%` }}
            />
          </div>
          {status.percent !== null && (
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-400">
              {status.percent}%
            </span>
          )}
        </>
      )}

      {status.phase === 'installed' && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
          <span className="text-zinc-200">Installed — restarting the app…</span>
        </>
      )}

      {status.phase === 'error' && (
        <>
          <span className="min-w-0 truncate text-red-400">
            Update failed: {status.message}
          </span>
          <button
            type="button"
            onClick={onDismissClick}
            className="ml-auto shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            aria-label="Dismiss update error notification"
            tabIndex={0}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
