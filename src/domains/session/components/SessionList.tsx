import { Plug, Server, Trash2 } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import { useSessionStore } from '../../../stores/sessionStore';
import type { SavedSession } from '../types';

function SessionListItem({
  session,
  isActive,
  onSelect,
  onConnect,
  onRemove,
  isDisabled,
}: {
  session: SavedSession;
  isActive: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onRemove: () => void;
  isDisabled: boolean;
}) {
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
        title={`${session.label} — 더블클릭으로 연결`}
      >
        {session.label}
        {session.lastConnectedAt && (
          <span className="ml-2 text-[11px] text-zinc-500" aria-label="Last connected">
            {new Date(session.lastConnectedAt).toLocaleDateString()}
          </span>
        )}
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
  isConnecting = false,
}: {
  onConnectSavedSession: (session: SavedSession) => void;
  isConnecting?: boolean;
}) {
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const removeSession = useSessionStore((s) => s.removeSession);

  const onRemoveWithConfirm = async (session: SavedSession) => {
    const confirmed = await ask(`저장된 세션을 삭제할까요?\n${session.label}`, {
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
        <p className="text-xs">Create a session above and connect.</p>
      </div>
    );
  }

  return (
    <ul className="flex min-w-0 flex-col gap-0.5" aria-label="Saved SSH sessions">
      {savedSessions.map((session) => (
        <li key={session.id}>
          <SessionListItem
            session={session}
            isActive={activeSessionId === session.id}
            isDisabled={isConnecting}
            onSelect={() => setActiveSessionId(session.id)}
            onConnect={() => onConnectSavedSession(session)}
            onRemove={() => void onRemoveWithConfirm(session)}
          />
        </li>
      ))}
    </ul>
  );
}
