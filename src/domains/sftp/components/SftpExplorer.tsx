import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import {
  ArrowUp,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSymlink,
  Home,
  Link2,
  PanelLeftClose,
  Pencil,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react';
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

function formatMtime(mtime: number | undefined): string {
  if (mtime === undefined) return '';
  const date = new Date(mtime * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' });
}

/**
 * Parent of an absolute remote path. The backend always echoes back an
 * absolute pathUsed, so navigation only ever deals in absolute paths.
 */
function getParentPath(path: string): string {
  if (!path.startsWith('/')) return path;
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  return `/${parts.slice(0, -1).join('/')}`;
}

function joinRemote(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

/** Splits an absolute path into clickable breadcrumb segments. */
function toBreadcrumbs(path: string): { label: string; path: string }[] {
  if (!path.startsWith('/')) return [];
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ label: '/', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

interface ReadSftpResult {
  entries: SftpEntry[];
  pathUsed: string;
}

interface UploadResult {
  localPath: string;
  remotePath?: string;
  ok: boolean;
  message?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: SftpEntry;
}

type PendingNameAction = { mode: 'mkdir' } | { mode: 'rename'; entry: SftpEntry };

interface SftpExplorerProps {
  onCollapse?: () => void;
}

/**
 * SFTP 파일 탐색기 — 현재 활성 터미널 탭 세션의 원격 파일 목록을 표시한다.
 */
export function SftpExplorer({ onCollapse }: SftpExplorerProps) {
  const activeTerminalSessionId = useTerminalStore((state) => {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    return activeTab?.sessionId ?? null;
  });

  // currentPath is the confirmed (loaded) path; pathInput is the draft the
  // user is typing. Typing never fires requests and a late response never
  // clobbers the input.
  const [currentPath, setCurrentPath] = useState<string>(DEFAULT_HOME_PATH);
  const [pathInput, setPathInput] = useState<string>(DEFAULT_HOME_PATH);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDropHover, setIsDropHover] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingNameAction, setPendingNameAction] = useState<PendingNameAction | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // Monotonic request counter: only the latest request may commit state, so a
  // slow earlier response can never overwrite a newer listing.
  const requestSeqRef = useRef(0);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!activeTerminalSessionId) return;
      const seq = ++requestSeqRef.current;
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await invoke<ReadSftpResult>('read_sftp_directory', {
          sessionId: activeTerminalSessionId,
          path,
        });
        if (seq !== requestSeqRef.current) return;
        setEntries(result.entries);
        setCurrentPath(result.pathUsed);
        setPathInput(result.pathUsed);
        setIsEditingPath(false);
        setSelectedPath(null);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
        setLoadError(message);
        setEntries([]);
      } finally {
        if (seq === requestSeqRef.current) setIsLoading(false);
      }
    },
    [activeTerminalSessionId]
  );

  // On tab switch: invalidate in-flight requests from the previous tab, reset
  // to home, and load exactly once — never via an effect chained on path state.
  useEffect(() => {
    requestSeqRef.current += 1;
    setEntries([]);
    setLoadError(null);
    setStatusMessage(null);
    setIsLoading(false);
    setContextMenu(null);
    setPendingNameAction(null);
    setSelectedPath(null);
    setCurrentPath(DEFAULT_HOME_PATH);
    setPathInput(DEFAULT_HOME_PATH);
    setIsEditingPath(false);
    if (activeTerminalSessionId) void loadDirectory(DEFAULT_HOME_PATH);
  }, [activeTerminalSessionId, loadDirectory]);

  const uploadFiles = useCallback(
    async (localPaths: string[]) => {
      if (!activeTerminalSessionId || localPaths.length === 0) return;

      const existingNames = new Set(entries.map((e) => e.name));
      const wouldOverwrite = localPaths
        .map((p) => p.split(/[\\/]/).pop() ?? '')
        .filter((name) => existingNames.has(name));
      if (wouldOverwrite.length > 0) {
        const confirmed = await ask(
          `The following files already exist. Overwrite?\n${wouldOverwrite.join('\n')}`,
          { title: 'Overwrite files?', kind: 'warning' }
        );
        if (!confirmed) return;
      }

      setStatusMessage(`Uploading ${localPaths.length} file(s)…`);
      try {
        const results = await invoke<UploadResult[]>('upload_sftp_files', {
          sessionId: activeTerminalSessionId,
          remoteDir: currentPath,
          localPaths,
        });
        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        const firstFailure = results.find((r) => !r.ok)?.message;
        setStatusMessage(
          failCount === 0
            ? `Uploaded ${okCount} file(s).`
            : `Uploaded ${okCount} file(s), failed ${failCount}.${firstFailure ? ` (${firstFailure})` : ''}`
        );
        await loadDirectory(currentPath);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
        setStatusMessage(`Upload failed: ${message}`);
      }
    },
    [activeTerminalSessionId, currentPath, entries, loadDirectory]
  );

  const isPointInsidePanel = useCallback(
    (position: { x: number; y: number } | undefined): boolean => {
      const el = containerRef.current;
      if (!el) return false;
      // No position info from the runtime → don't block the drop; fall back
      // to accepting it (old window-wide behavior beats a silent no-op).
      if (!position) return true;
      const rect = el.getBoundingClientRect();
      const contains = (x: number, y: number) =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      // Tauri reports physical pixels; DOM rects are CSS pixels. Check both
      // interpretations so a scale mismatch can't reject a valid drop.
      const scale = window.devicePixelRatio || 1;
      return contains(position.x / scale, position.y / scale) || contains(position.x, position.y);
    },
    []
  );

  useEffect(() => {
    // Window-level drag/drop in Tauri v2, hit-tested against the SFTP panel so
    // a file dropped on the terminal does not silently upload.
    const currentWebview = getCurrentWebview();
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void currentWebview
      .onDragDropEvent((event) => {
        const p = event.payload as {
          type: string;
          paths?: string[];
          position?: { x: number; y: number };
        };
        if (p.type === 'drop' && Array.isArray(p.paths)) {
          setIsDropHover(false);
          if (!isPointInsidePanel(p.position)) return;
          if (!activeTerminalSessionId) {
            setStatusMessage('Connect to a server first.');
            return;
          }
          void uploadFiles(p.paths);
          return;
        }
        if (p.type === 'cancel' || p.type === 'leave') {
          setIsDropHover(false);
          return;
        }
        if (p.type === 'enter' || p.type === 'over') {
          setIsDropHover(isPointInsidePanel(p.position));
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
        setIsDropHover(false);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeTerminalSessionId, uploadFiles, isPointInsidePanel]);

  // Close the context menu on any outside click or Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const onEntryOpen = useCallback(
    (entry: SftpEntry) => {
      if (!entry.isDir) return;
      // Navigate with the absolute path the server returned — never rebuild it
      // from currentPath + name on the client.
      void loadDirectory(entry.path);
    },
    [loadDirectory]
  );

  const downloadEntry = useCallback(
    async (entry: SftpEntry) => {
      if (!activeTerminalSessionId || entry.isDir) return;
      try {
        const localPath = await saveDialog({ defaultPath: entry.name, title: `Download ${entry.name}` });
        if (!localPath) return;
        setStatusMessage(`Downloading ${entry.name}…`);
        const result = await invoke<{ bytes: number }>('download_sftp_file', {
          sessionId: activeTerminalSessionId,
          remotePath: entry.path,
          localPath,
        });
        setStatusMessage(`Downloaded ${entry.name} (${formatBytes(result.bytes)}).`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
        setStatusMessage(`Download failed: ${message}`);
      }
    },
    [activeTerminalSessionId]
  );

  const removeEntry = useCallback(
    async (entry: SftpEntry) => {
      if (!activeTerminalSessionId) return;
      const confirmed = await ask(
        `Delete this item?\n${entry.path}${entry.isDir ? '\n(Only empty directories can be deleted)' : ''}`,
        { title: 'Delete', kind: 'warning' }
      );
      if (!confirmed) return;
      try {
        await invoke('sftp_remove', {
          sessionId: activeTerminalSessionId,
          path: entry.path,
          isDir: entry.isDir,
        });
        setStatusMessage(`Deleted ${entry.name}.`);
        await loadDirectory(currentPath);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
        setStatusMessage(`Delete failed: ${message}`);
      }
    },
    [activeTerminalSessionId, currentPath, loadDirectory]
  );

  const submitNameAction = useCallback(async () => {
    if (!activeTerminalSessionId || !pendingNameAction) return;
    const name = pendingName.trim();
    if (!name || name.includes('/')) return;
    try {
      if (pendingNameAction.mode === 'mkdir') {
        await invoke('sftp_mkdir', {
          sessionId: activeTerminalSessionId,
          path: joinRemote(currentPath, name),
        });
        setStatusMessage(`Created folder ${name}.`);
      } else {
        await invoke('sftp_rename', {
          sessionId: activeTerminalSessionId,
          fromPath: pendingNameAction.entry.path,
          toPath: joinRemote(getParentPath(pendingNameAction.entry.path), name),
        });
        setStatusMessage(`Renamed to ${name}.`);
      }
      setPendingNameAction(null);
      setPendingName('');
      await loadDirectory(currentPath);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      setStatusMessage(`${pendingNameAction.mode === 'mkdir' ? 'Create' : 'Rename'} failed: ${message}`);
    }
  }, [activeTerminalSessionId, pendingNameAction, pendingName, currentPath, loadDirectory]);

  const onUploadClick = useCallback(async () => {
    const selected = await openDialog({ multiple: true, title: 'Upload files' });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    void uploadFiles(paths);
  }, [uploadFiles]);

  const onPathSubmit = useCallback(() => {
    const trimmed = pathInput.trim();
    if (trimmed.length === 0) return;
    void loadDirectory(trimmed);
  }, [pathInput, loadDirectory]);

  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'));
  const isUpDisabled = isLoading || !currentPath.startsWith('/') || currentPath === '/';
  const breadcrumbs = toBreadcrumbs(currentPath);
  const selectedEntry = visibleEntries.find((e) => e.path === selectedPath) ?? null;

  const startRename = useCallback((entry: SftpEntry) => {
    setPendingNameAction({ mode: 'rename', entry });
    setPendingName(entry.name);
  }, []);

  /** Finder-style keyboard actions on the selected row: F2 rename, Delete remove. */
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedEntry) return;
      if (e.key === 'F2') {
        e.preventDefault();
        startRename(selectedEntry);
        return;
      }
      if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        void removeEntry(selectedEntry);
      }
    },
    [selectedEntry, startRename, removeEntry]
  );

  if (!activeTerminalSessionId) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">SFTP</h3>
          {onCollapse && <CollapseButton onCollapse={onCollapse} />}
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 rounded border border-dashed border-zinc-600 bg-zinc-800/30 py-8 text-center text-sm text-zinc-500">
          <FolderOpen className="h-8 w-8 text-zinc-600" aria-hidden />
          <p>Connect to a server to browse files</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 min-w-0 flex-col gap-2">
      {/* Header: title + toolbar */}
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">SFTP</h3>
        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarButton
            label="Upload files"
            onClick={() => void onUploadClick()}
            disabled={isLoading}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="New folder"
            onClick={() => {
              setPendingNameAction({ mode: 'mkdir' });
              setPendingName('');
            }}
            disabled={isLoading}
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
          </ToolbarButton>
          <span className="mx-0.5 h-3.5 w-px bg-zinc-700" aria-hidden />
          <ToolbarButton
            label="Download selected file"
            onClick={() => {
              if (selectedEntry) void downloadEntry(selectedEntry);
            }}
            disabled={!selectedEntry || selectedEntry.isDir}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Rename selected (F2)"
            onClick={() => {
              if (selectedEntry) startRename(selectedEntry);
            }}
            disabled={!selectedEntry}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Delete selected (Delete)"
            onClick={() => {
              if (selectedEntry) void removeEntry(selectedEntry);
            }}
            disabled={!selectedEntry}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </ToolbarButton>
          <span className="mx-0.5 h-3.5 w-px bg-zinc-700" aria-hidden />
          <ToolbarButton
            label={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            )}
          </ToolbarButton>
          <ToolbarButton
            label="Refresh directory listing"
            onClick={() => void loadDirectory(currentPath)}
            disabled={isLoading}
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
          </ToolbarButton>
          {onCollapse && <CollapseButton onCollapse={onCollapse} />}
        </div>
      </div>

      {/* Navigation: home/root/up + breadcrumbs (click to edit) */}
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <ToolbarButton label="Go to home" onClick={() => void loadDirectory(DEFAULT_HOME_PATH)} disabled={isLoading}>
          <Home className="h-3.5 w-3.5" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Go up one directory"
          onClick={() => void loadDirectory(getParentPath(currentPath))}
          disabled={isUpDisabled}
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
        </ToolbarButton>

        {isEditingPath || breadcrumbs.length === 0 ? (
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPathSubmit();
              if (e.key === 'Escape') {
                setPathInput(currentPath);
                setIsEditingPath(false);
              }
            }}
            onBlur={() => setIsEditingPath(false)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Remote path (e.g. ~ or /home/username)"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Remote path on connected server"
          />
        ) : (
          <nav
            className="flex min-w-0 flex-1 items-center overflow-x-auto rounded border border-transparent px-1 py-1 hover:border-zinc-700"
            aria-label="Path breadcrumbs"
            onDoubleClick={() => setIsEditingPath(true)}
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex shrink-0 items-center">
                {i > 1 && <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" aria-hidden />}
                <button
                  type="button"
                  onClick={() => void loadDirectory(crumb.path)}
                  className="max-w-32 truncate rounded px-1 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                  title={crumb.path}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setIsEditingPath(true)}
              className="ml-1 shrink-0 rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              aria-label="Edit path"
            >
              <Pencil className="h-3 w-3" aria-hidden />
            </button>
          </nav>
        )}
      </div>

      {/* Inline mkdir/rename form */}
      {pendingNameAction && (
        <div className="flex shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-800/70 p-1.5">
          <span className="shrink-0 text-xs text-zinc-400">
            {pendingNameAction.mode === 'mkdir' ? 'New folder:' : `Rename ${pendingNameAction.entry.name}:`}
          </span>
          <input
            type="text"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNameAction();
              if (e.key === 'Escape') setPendingNameAction(null);
            }}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
            aria-label={pendingNameAction.mode === 'mkdir' ? 'New folder name' : 'New name'}
          />
          <button
            type="button"
            onClick={() => void submitNameAction()}
            className="shrink-0 rounded bg-zinc-600 px-2 py-1 text-xs text-white hover:bg-zinc-500"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setPendingNameAction(null)}
            className="shrink-0 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      )}

      {loadError && (
        <div className="shrink-0 rounded bg-red-900/30 px-3 py-2 text-sm text-red-300" role="alert">
          <p>{loadError}</p>
          {loadError.toLowerCase().includes('permission denied') && (
            <p className="mt-1.5 text-xs text-red-200/90">
              <strong>If the remote is macOS:</strong> macOS privacy protection (TCC) often blocks{' '}
              <code className="text-red-100">sftp-server</code> from accessing Desktop/Downloads/Documents.
              Go to System Settings → General → Sharing → Remote Login (i) → enable{' '}
              <strong>“Allow full disk access for remote users”</strong>, then restart Remote Login.
              <br />
              <strong>Linux and others:</strong> try <kbd className="rounded bg-zinc-700 px-1">~</kbd> or{' '}
              <kbd className="rounded bg-zinc-700 px-1">/home/username</kbd>.
            </p>
          )}
        </div>
      )}

      {statusMessage && (
        <p className="shrink-0 rounded bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-300" role="status">
          {statusMessage}
        </p>
      )}

      {isDropHover && (
        <div
          className="shrink-0 rounded border border-emerald-600/50 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-200"
          role="status"
        >
          Drop files to upload to <span className="font-mono">{currentPath}</span>
        </div>
      )}

      {/* Listing — the panel's single scroll area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border border-zinc-800">
        <div className="flex shrink-0 items-center border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-500">
          <span className="min-w-0 flex-1">Name</span>
          <span className="w-16 shrink-0 text-right">Size</span>
          <span className="w-16 shrink-0 text-right">Modified</span>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" onKeyDown={onListKeyDown}>
          {(() => {
            if (isLoading && entries.length === 0) {
              return <div className="px-3 py-3 text-sm text-zinc-500">Loading…</div>;
            }
            if (loadError) {
              return <div className="px-3 py-3 text-sm text-zinc-500">Could not list this directory</div>;
            }
            if (visibleEntries.length === 0) {
              return (
                <div className="px-3 py-3 text-sm text-zinc-500">
                  {entries.length > 0 ? 'Only hidden files here' : 'Empty'}
                </div>
              );
            }
            return (
              <ul className="divide-y divide-zinc-900/70">
                {visibleEntries.map((entry) => {
                  const Icon = (() => {
                    if (entry.isDir && entry.isSymlink) return FolderSymlink;
                    if (entry.isDir) return Folder;
                    if (entry.isSymlink) return Link2;
                    return File;
                  })();
                  const sizeText = entry.isDir ? '' : formatBytes(entry.size);
                  const isSelected = selectedPath === entry.path;
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        // Finder-style: single click selects, double click
                        // opens a folder / downloads a file.
                        onClick={() => setSelectedPath(entry.path)}
                        onDoubleClick={() => {
                          if (entry.isDir) onEntryOpen(entry);
                          else void downloadEntry(entry);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedPath(entry.path);
                          const rect = containerRef.current?.getBoundingClientRect();
                          setContextMenu({
                            x: e.clientX - (rect?.left ?? 0),
                            y: e.clientY - (rect?.top ?? 0),
                            entry,
                          });
                        }}
                        aria-pressed={isSelected}
                        className={`flex w-full min-w-0 items-center px-3 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
                          isSelected
                            ? 'bg-zinc-700/70 text-zinc-50'
                            : 'text-zinc-200 hover:bg-zinc-900'
                        }`}
                        aria-label={
                          entry.isDir
                            ? `Folder ${entry.name} (double-click to open)`
                            : `File ${entry.name} (double-click to download)`
                        }
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                          <span className="min-w-0 truncate">{entry.name}</span>
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs text-zinc-500">{sizeText}</span>
                        <span className="w-16 shrink-0 text-right text-xs text-zinc-600">{formatMtime(entry.mtime)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute z-20 min-w-40 rounded border border-zinc-700 bg-zinc-800 py-1 shadow-lg"
          style={{ left: Math.min(contextMenu.x, 200), top: contextMenu.y }}
          role="menu"
        >
          {!contextMenu.entry.isDir && (
            <ContextMenuItem
              label="Download"
              icon={<Download className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setContextMenu(null);
                void downloadEntry(contextMenu.entry);
              }}
            />
          )}
          {contextMenu.entry.isDir && (
            <ContextMenuItem
              label="Open"
              icon={<FolderOpen className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setContextMenu(null);
                onEntryOpen(contextMenu.entry);
              }}
            />
          )}
          <ContextMenuItem
            label="Rename"
            icon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              startRename(contextMenu.entry);
              setContextMenu(null);
            }}
          />
          <ContextMenuItem
            label="Copy path"
            icon={<Link2 className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              void navigator.clipboard.writeText(contextMenu.entry.path);
              setStatusMessage('Path copied.');
              setContextMenu(null);
            }}
          />
          <ContextMenuItem
            label="Delete"
            icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
            destructive
            onClick={() => {
              setContextMenu(null);
              void removeEntry(contextMenu.entry);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function CollapseButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <ToolbarButton label="Collapse SFTP panel" onClick={onCollapse}>
      <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
    </ToolbarButton>
  );
}

function ContextMenuItem({
  label,
  icon,
  onClick,
  destructive = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs focus:outline-none focus-visible:bg-zinc-700 ${
        destructive
          ? 'text-red-300 hover:bg-red-900/40'
          : 'text-zinc-200 hover:bg-zinc-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
