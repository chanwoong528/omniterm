import { useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Folder,
  Plug,
  Server,
  Trash2,
} from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import { useSessionStore } from '../../../stores/sessionStore';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { PortForwardBadge } from '../../port-forward/components/PortForwardBadge';
import { buildSshCommand } from '../utils/buildSshCommand';
import type { SavedSession } from '../types';

const COPY_FEEDBACK_MS = 1500;

function SessionListItem({
  session,
  isActive,
  onSelect,
  onConnect,
  onOpenPortForward,
  onCopyCommand,
  onRemove,
  isDisabled,
}: {
  session: SavedSession;
  isActive: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onOpenPortForward: () => void;
  onCopyCommand: () => Promise<void>;
  onRemove: () => void;
  isDisabled: boolean;
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
      className={`flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-zinc-700/50 ${
        isActive ? 'bg-zinc-700/80 text-zinc-100' : 'text-zinc-300'
      }`}
    >
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
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        aria-label={`Remove session ${session.label}`}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function SessionList({
  onConnectSavedSession,
  onOpenPortForward,
  isConnecting = false,
}: {
  onConnectSavedSession: (session: SavedSession) => void;
  onOpenPortForward: (session: SavedSession) => void;
  isConnecting?: boolean;
}) {
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const removeSession = useSessionStore((s) => s.removeSession);
  const registeredKeys = useKeyManagerStore((s) => s.registeredKeys);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

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

  if (savedSessions.length === 0) {
    return (
      <div className="flex min-w-0 flex-col items-center justify-center gap-2 py-6 text-center text-sm text-zinc-500">
        <Server className="h-8 w-8 text-zinc-600" aria-hidden />
        <p>No saved sessions</p>
        <p className="text-xs">Create a session below and connect.</p>
      </div>
    );
  }

  // 폴더별 그룹핑: 폴더 있는 세션은 접을 수 있는 그룹으로, 나머지는 루트에 표시.
  const sessionsByFolder = new Map<string, SavedSession[]>();
  const rootSessions: SavedSession[] = [];
  for (const session of savedSessions) {
    if (!session.folder) {
      rootSessions.push(session);
      continue;
    }
    const group = sessionsByFolder.get(session.folder);
    if (group) {
      group.push(session);
    } else {
      sessionsByFolder.set(session.folder, [session]);
    }
  }
  const folderNames = [...sessionsByFolder.keys()].sort((a, b) => a.localeCompare(b));

  const renderSessionItem = (session: SavedSession) => (
    <li key={session.id}>
      <SessionListItem
        session={session}
        isActive={activeSessionId === session.id}
        isDisabled={isConnecting}
        onSelect={() => setActiveSessionId(session.id)}
        onConnect={() => onConnectSavedSession(session)}
        onOpenPortForward={() => onOpenPortForward(session)}
        onCopyCommand={() => copySshCommand(session)}
        onRemove={() => void onRemoveWithConfirm(session)}
      />
    </li>
  );

  return (
    <div className="flex min-w-0 flex-col gap-0.5" aria-label="Saved SSH sessions">
      {folderNames.map((folderName) => {
        const isCollapsed = collapsedFolders.has(folderName);
        const groupSessions = sessionsByFolder.get(folderName) ?? [];
        return (
          <div key={folderName} className="min-w-0">
            <button
              type="button"
              onClick={() => onToggleFolder(folderName)}
              className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
              aria-expanded={!isCollapsed}
              aria-label={`Folder ${folderName} (${groupSessions.length} sessions)`}
              title={folderName}
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
              <ul className="ml-2.5 flex min-w-0 flex-col gap-0.5 border-l border-zinc-800 pl-1.5">
                {groupSessions.map(renderSessionItem)}
              </ul>
            )}
          </div>
        );
      })}
      {rootSessions.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-0.5">{rootSessions.map(renderSessionItem)}</ul>
      )}
    </div>
  );
}
