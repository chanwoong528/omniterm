import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Folder,
  GripVertical,
  Plug,
  Server,
  Trash2,
} from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import { useSessionStore } from '../../../stores/sessionStore';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { PortForwardBadge } from '../../port-forward/components/PortForwardBadge';
import { buildSshCommand } from '../utils/buildSshCommand';
import { partitionSessions } from '../utils/reorderSessions';
import type { SavedSession } from '../types';

const COPY_FEEDBACK_MS = 1500;

type DropDestination = { folder: string | undefined; beforeId: string | null };

function folderFromDataset(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

/** Hit-test under the pointer. Tauri disables HTML5 DnD when dragDropEnabled is on (needed for SFTP), so we use pointer capture instead. */
function resolveDropAtPoint(
  clientX: number,
  clientY: number,
  draggedId: string,
  sessions: SavedSession[]
): DropDestination | null {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    if (!(el instanceof Element)) continue;

    const endZone = el.closest('[data-session-drop-end]') as HTMLElement | null;
    if (endZone) {
      return { folder: folderFromDataset(endZone.dataset.sessionFolder), beforeId: null };
    }

    const folderHeader = el.closest('[data-session-folder-header]') as HTMLElement | null;
    if (folderHeader) {
      return {
        folder: folderFromDataset(folderHeader.dataset.sessionFolder),
        beforeId: null,
      };
    }

    const row = el.closest('[data-session-id]') as HTMLElement | null;
    if (!row) continue;
    const sessionId = row.dataset.sessionId;
    if (!sessionId || sessionId === draggedId) continue;

    const folder = folderFromDataset(row.dataset.sessionFolder);
    const rect = row.getBoundingClientRect();
    const insertBefore = clientY < rect.top + rect.height / 2;
    if (insertBefore) return { folder, beforeId: sessionId };

    const { byFolder, root } = partitionSessions(sessions);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return { folder, beforeId: null };
    const group = session.folder ? (byFolder.get(session.folder) ?? []) : root;
    const idx = group.findIndex((s) => s.id === sessionId);
    if (idx === -1 || idx === group.length - 1) return { folder, beforeId: null };
    return { folder, beforeId: group[idx + 1]?.id ?? null };
  }
  return null;
}

function SessionListItem({
  session,
  isActive,
  isEditMode,
  isDragging,
  isDropBefore,
  onSelect,
  onConnect,
  onOpenPortForward,
  onCopyCommand,
  onRemove,
  isDisabled,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onHandlePointerCancel,
}: {
  session: SavedSession;
  isActive: boolean;
  isEditMode: boolean;
  isDragging: boolean;
  isDropBefore: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onOpenPortForward: () => void;
  onCopyCommand: () => Promise<void>;
  onRemove: () => void;
  isDisabled: boolean;
  onHandlePointerDown: (sessionId: string, event: ReactPointerEvent<HTMLElement>) => void;
  onHandlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onHandlePointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onHandlePointerCancel: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);

  const onCopyClick = async () => {
    try {
      await onCopyCommand();
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // 클립보드 접근 실패 시 조용히 무시 — 버튼 피드백만 생략된다.
    }
  };

  return (
    // Selection, connect, and delete are sibling buttons — interactive
    // elements must not nest inside each other.
    <div
      data-session-id={session.id}
      data-session-folder={session.folder ?? ''}
      className={`group relative flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-zinc-700/50 ${
        isActive && !isEditMode ? 'bg-zinc-700/80 text-zinc-100' : 'text-zinc-300'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {isDropBefore && (
        <div
          className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 rounded bg-emerald-400"
          aria-hidden
        />
      )}
      {isEditMode && (
        <span
          role="button"
          tabIndex={0}
          onPointerDown={(event) => onHandlePointerDown(session.id, event)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
          }}
          className="shrink-0 touch-none cursor-grab rounded p-0.5 text-zinc-500 opacity-0 group-hover:opacity-100 focus:opacity-100 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={`Drag to reorder ${session.label}`}
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5 pointer-events-none" aria-hidden />
        </span>
      )}
      {isEditMode ? (
        <span className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm" title={session.label}>
          {session.label}
          {session.lastConnectedAt && (
            <span className="ml-2 text-[11px] text-zinc-500" aria-label="Last connected">
              {new Date(session.lastConnectedAt).toLocaleDateString()}
            </span>
          )}
          <PortForwardBadge rules={session.portForwards ?? []} />
        </span>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => {
            if (!isDisabled) onConnect();
          }}
          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
          aria-label={`Select session ${session.label}`}
          title={`${session.label} — double-click to connect`}
        >
          {session.label}
          {session.lastConnectedAt && (
            <span className="ml-2 text-[11px] text-zinc-500" aria-label="Last connected">
              {new Date(session.lastConnectedAt).toLocaleDateString()}
            </span>
          )}
          <PortForwardBadge rules={session.portForwards ?? []} />
        </button>
      )}
      {!isEditMode && (
        <>
          <button
            type="button"
            onClick={onConnect}
            disabled={isDisabled}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-emerald-300 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label={`Connect to ${session.label}`}
            title="Connect"
          >
            <Plug className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onOpenPortForward}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label={`Port forwarding for ${session.label}`}
            title="Port forwarding"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void onCopyClick()}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label={`Copy ssh command for ${session.label}`}
            title="Copy ssh command"
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </>
      )}
      {isEditMode && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-red-300 hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={`Remove session ${session.label}`}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function GroupEndDropZone({
  folder,
  isActive,
  label,
}: {
  folder: string | undefined;
  isActive: boolean;
  label: string;
}) {
  // Absolutely positioned so it never contributes to list gap / layout shift.
  return (
    <div
      data-session-drop-end=""
      data-session-folder={folder ?? ''}
      className={`absolute inset-x-0 -bottom-1.5 z-10 h-3 rounded border border-dashed transition-colors ${
        isActive ? 'border-emerald-400 bg-emerald-900/20' : 'border-transparent'
      }`}
      aria-label={label}
    />
  );
}

export function SessionList({
  onConnectSavedSession,
  onOpenPortForward,
  isConnecting = false,
  isEditMode = false,
}: {
  onConnectSavedSession: (session: SavedSession) => void;
  onOpenPortForward: (session: SavedSession) => void;
  isConnecting?: boolean;
  isEditMode?: boolean;
}) {
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const removeSession = useSessionStore((s) => s.removeSession);
  const moveSession = useSessionStore((s) => s.moveSession);
  const registeredKeys = useKeyManagerStore((s) => s.registeredKeys);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropDestination | null>(null);

  const draggingIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<DropDestination | null>(null);
  const savedSessionsRef = useRef(savedSessions);

  useEffect(() => {
    savedSessionsRef.current = savedSessions;
  }, [savedSessions]);

  const copySshCommand = async (session: SavedSession) => {
    const resolveKeyPath = (keyId: string) =>
      registeredKeys.find((k) => k.id === keyId)?.storageKey;
    await navigator.clipboard.writeText(buildSshCommand(session, resolveKeyPath));
  };

  const onToggleFolder = (folderName: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  const onRemoveWithConfirm = async (session: SavedSession) => {
    const confirmed = await ask(`Delete this saved session?\n${session.label}`, {
      title: 'Delete session',
      kind: 'warning',
    });
    if (confirmed) removeSession(session.id);
  };

  const clearDragState = () => {
    draggingIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };

  const onHandlePointerDown = (sessionId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingIdRef.current = sessionId;
    dropTargetRef.current = null;
    setDraggingId(sessionId);
    setDropTarget(null);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const id = draggingIdRef.current;
    if (!id) return;
    const next = resolveDropAtPoint(
      event.clientX,
      event.clientY,
      id,
      savedSessionsRef.current
    );
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const onHandlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const id = draggingIdRef.current;
    if (!id) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const destination =
      dropTargetRef.current ??
      resolveDropAtPoint(event.clientX, event.clientY, id, savedSessionsRef.current);
    if (destination) {
      moveSession(id, destination);
    }
    clearDragState();
  };

  if (savedSessions.length === 0) {
    return (
      <div className="flex min-w-0 flex-col items-center justify-center gap-2 py-6 text-center text-sm text-zinc-500">
        <Server className="h-8 w-8 text-zinc-600" aria-hidden />
        <p>No saved sessions</p>
        <p className="text-xs">Create a session below and connect.</p>
      </div>
    );
  }

  const { byFolder: sessionsByFolder, root: rootSessions, folderNames } =
    partitionSessions(savedSessions);

  const isDropBefore = (sessionId: string, folder: string | undefined) =>
    dropTarget !== null &&
    dropTarget.folder === folder &&
    dropTarget.beforeId === sessionId &&
    draggingId !== sessionId;

  const isGroupEndActive = (folder: string | undefined) =>
    dropTarget !== null && dropTarget.folder === folder && dropTarget.beforeId === null;

  const renderSessionItem = (session: SavedSession) => (
    <li key={session.id}>
      <SessionListItem
        session={session}
        isActive={activeSessionId === session.id}
        isEditMode={isEditMode}
        isDragging={draggingId === session.id}
        isDropBefore={isDropBefore(session.id, session.folder)}
        isDisabled={isConnecting}
        onSelect={() => setActiveSessionId(session.id)}
        onConnect={() => onConnectSavedSession(session)}
        onOpenPortForward={() => onOpenPortForward(session)}
        onCopyCommand={() => copySshCommand(session)}
        onRemove={() => void onRemoveWithConfirm(session)}
        onHandlePointerDown={onHandlePointerDown}
        onHandlePointerMove={onHandlePointerMove}
        onHandlePointerUp={onHandlePointerUp}
        onHandlePointerCancel={clearDragState}
      />
    </li>
  );

  return (
    <div className="flex min-w-0 flex-col gap-0.5" aria-label="Saved SSH sessions">
      {folderNames.map((folderName) => {
        const isCollapsed = collapsedFolders.has(folderName);
        const groupSessions = sessionsByFolder.get(folderName) ?? [];
        const folderDropActive =
          isEditMode &&
          dropTarget?.folder === folderName &&
          dropTarget.beforeId === null &&
          isCollapsed;
        return (
          <div key={folderName} className="min-w-0">
            <button
              type="button"
              data-session-folder-header=""
              data-session-folder={folderName}
              onClick={() => {
                if (draggingId) return;
                onToggleFolder(folderName);
              }}
              className={`flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
                folderDropActive ? 'bg-emerald-900/20 ring-1 ring-emerald-400/60' : ''
              }`}
              aria-expanded={!isCollapsed}
              aria-label={`Folder ${folderName} (${groupSessions.length} sessions)`}
              title={
                isEditMode
                  ? `${folderName} — drop to move session into this folder`
                  : folderName
              }
              tabIndex={0}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{folderName}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">{groupSessions.length}</span>
            </button>
            {!isCollapsed && (
              <div className="relative ml-2.5 min-w-0 border-l border-zinc-800 pl-1.5">
                <ul className="flex min-w-0 flex-col gap-0.5">
                  {groupSessions.map(renderSessionItem)}
                </ul>
                {isEditMode && (
                  <GroupEndDropZone
                    folder={folderName}
                    isActive={isGroupEndActive(folderName)}
                    label={`Drop at end of folder ${folderName}`}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {(rootSessions.length > 0 || (isEditMode && folderNames.length > 0)) && (
        <div className="relative min-w-0">
          {rootSessions.length > 0 && (
            <ul className="flex min-w-0 flex-col gap-0.5">{rootSessions.map(renderSessionItem)}</ul>
          )}
          {isEditMode && (
            <GroupEndDropZone
              folder={undefined}
              isActive={isGroupEndActive(undefined)}
              label="Drop at end of ungrouped sessions"
            />
          )}
        </div>
      )}
    </div>
  );
}
