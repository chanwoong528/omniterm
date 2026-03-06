import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { File, Folder, FolderOpen, Home, RefreshCcw, ArrowUp } from 'lucide-react';
import { useTerminalStore } from '../../../stores/terminalStore';
import type { SftpEntry } from '../types';

const DEFAULT_HOME_PATH = '~';

function formatBytes(value: number | undefined): string {
  if (value === undefined) return '';
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function joinRemotePath(parentPath: string, name: string): string {
  const trimmedName = name.replaceAll('/', '');
  if (parentPath === '.' || parentPath === '~' || parentPath === '') return trimmedName;
  if (parentPath === '/') return `/${trimmedName}`;
  return parentPath.endsWith('/') ? `${parentPath}${trimmedName}` : `${parentPath}/${trimmedName}`;
}

function getParentPath(currentPath: string): string {
  if (currentPath === '.' || currentPath === '~' || currentPath === '' || currentPath === '/') return currentPath;
  const isAbsolute = currentPath.startsWith('/');
  const parts = currentPath.split('/').filter(Boolean);
  if (parts.length <= 1) return isAbsolute ? '/' : DEFAULT_HOME_PATH;
  const parent = parts.slice(0, -1).join('/');
  return isAbsolute ? `/${parent}` : parent;
}

/**
 * SFTP 파일 탐색기 (Step 5에서 실제 연동)
 * 현재 연결된 세션의 파일 트리 표시
 */
export function SftpExplorer() {
  const activeTerminalSessionId = useTerminalStore((state) => {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    return activeTab?.sessionId ?? null;
  });

  const [currentPath, setCurrentPath] = useState<string>(DEFAULT_HOME_PATH);
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDropHover, setIsDropHover] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  interface ReadSftpResult {
    entries: SftpEntry[];
    pathUsed: string;
  }

  const loadDirectory = useCallback(async () => {
    if (!activeTerminalSessionId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await invoke<ReadSftpResult>('read_sftp_directory', {
        sessionId: activeTerminalSessionId,
        path: currentPath,
      });
      setEntries(result.entries);
      setCurrentPath(result.pathUsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      setLoadError(message);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTerminalSessionId, currentPath]);

  const uploadDroppedFiles = useCallback(
    async (localPaths: string[]) => {
      if (!activeTerminalSessionId) return;
      if (localPaths.length === 0) return;
      setUploadStatus(`Uploading ${localPaths.length} file(s)…`);
      try {
        type UploadResult = {
          localPath: string;
          remotePath?: string;
          ok: boolean;
          message?: string;
        };
        const results = await invoke<UploadResult[]>('upload_sftp_files', {
          sessionId: activeTerminalSessionId,
          remoteDir: currentPath,
          localPaths,
        });
        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        setUploadStatus(
          failCount === 0
            ? `Uploaded ${okCount} file(s).`
            : `Uploaded ${okCount} file(s), failed ${failCount}.`
        );
        await loadDirectory();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
        setUploadStatus(`Upload failed: ${message}`);
      }
    },
    [activeTerminalSessionId, currentPath, loadDirectory]
  );

  useEffect(() => {
    // Window-level drag/drop in Tauri v2. Payload can be enter/over/drop/leave/cancel.
    const currentWebview = getCurrentWebview();
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void currentWebview
      .onDragDropEvent((event) => {
        const payload = event.payload;
        const p = payload as { type: string; paths?: string[] };
        if (p.type === 'drop' && Array.isArray(p.paths)) {
          setIsDropHover(false);
          if (!activeTerminalSessionId) {
            setUploadStatus('Connect to a server first.');
            return;
          }
          void uploadDroppedFiles(p.paths);
          return;
        }
        if (p.type === 'cancel' || p.type === 'leave') {
          setIsDropHover(false);
          return;
        }
        if (p.type === 'enter' || p.type === 'over') {
          setIsDropHover(true);
        }
      })
      .then((fn: () => void) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // If capability isn't granted or API unavailable, just keep DnD disabled.
        setIsDropHover(false);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeTerminalSessionId, uploadDroppedFiles]);

  useEffect(() => {
    setCurrentPath(DEFAULT_HOME_PATH);
  }, [activeTerminalSessionId]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const onEntryOpen = useCallback(
    (entry: SftpEntry) => {
      if (!entry.is_dir) return;
      setCurrentPath((prev) => joinRemotePath(prev, entry.name));
    },
    []
  );

  if (!activeTerminalSessionId) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">SFTP</h3>
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 rounded border border-dashed border-zinc-600 bg-zinc-800/30 py-8 text-center text-sm text-zinc-500">
          <FolderOpen className="h-8 w-8 text-zinc-600" aria-hidden />
          <p>Connect to a server to browse files</p>
          <p className="text-xs">Open a terminal tab, then switch back to SFTP</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-sftp-dropzone="true"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">SFTP</h3>
        <button
          type="button"
          onClick={loadDirectory}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label="Refresh directory listing"
        >
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="text"
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadDirectory();
            }}
            placeholder="Remote path (e.g. ~ or /home/username)"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Remote path on connected server"
          />
          <button
            type="button"
            onClick={() => void loadDirectory()}
            disabled={isLoading}
            className="shrink-0 rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            Go
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPath(DEFAULT_HOME_PATH)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Go to home"
          >
            <Home className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setCurrentPath('/')}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Go to root"
          >
            Root
          </button>
          <button
            type="button"
            onClick={() => setCurrentPath((p) => getParentPath(p))}
            disabled={currentPath === '.' || currentPath === '~' || currentPath === '/' || currentPath === ''}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Go up one directory"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 overflow-hidden text-xs text-zinc-500" aria-label="Current path">
            <span className="truncate">{currentPath || '—'}</span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded bg-red-900/30 px-3 py-2 text-sm text-red-300" role="alert">
          <p>{loadError}</p>
          {loadError.toLowerCase().includes('permission denied') && (
            <p className="mt-1.5 text-xs text-red-200/90">
              <strong>로컬/원격이 macOS인 경우:</strong> 이건 파일 권한이 아니라 macOS 개인정보 보호(TCC) 때문에 <code className="text-red-100">sshd/sftp-server</code>가
              <code className="text-red-100">Desktop/Downloads/Documents/Music</code> 등에 접근을 차단당한 케이스가 많습니다.
              <br />
              1) <strong>System Settings</strong> → <strong>General</strong> → <strong>Sharing</strong> → <strong>Remote Login</strong> 옆 (i) →{' '}
              <strong>“Allow full disk access for remote users”</strong> 를 켜고,
              <br />
              2) Remote Login을 껐다가 다시 켜서(또는 맥 재부팅) sshd를 재시작한 뒤 다시 시도해 보세요.
              <br />
              <strong>다른 서버(Linux 등):</strong> <kbd className="rounded bg-zinc-700 px-1">~</kbd> 또는 <kbd className="rounded bg-zinc-700 px-1">/home/사용자명</kbd> 을 시도하세요.
            </p>
          )}
        </div>
      )}

      {uploadStatus && (
        <p className="rounded bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300" role="status">
          {uploadStatus}
        </p>
      )}

      {isDropHover && (
        <div className="rounded border border-emerald-600/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200" role="status">
          Drop files to upload to <span className="font-mono">{currentPath}</span>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded border border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-500">
          <span>Name</span>
          <span className="ml-4 shrink-0">Size</span>
        </div>
        <div className="max-h-[360px] min-w-0 overflow-y-auto">
          {isLoading && entries.length === 0 ? (
            <div className="px-3 py-3 text-sm text-zinc-500">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-3 text-sm text-zinc-500">Empty</div>
          ) : (
            <ul className="divide-y divide-zinc-900/70">
              {entries.map((entry) => {
                const Icon = entry.is_dir ? Folder : File;
                const sizeText = entry.is_dir ? '' : formatBytes(entry.size);
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => onEntryOpen(entry)}
                      className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
                      aria-label={entry.is_dir ? `Open folder ${entry.name}` : `File ${entry.name}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                        <span className="min-w-0 truncate">{entry.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">{sizeText}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
