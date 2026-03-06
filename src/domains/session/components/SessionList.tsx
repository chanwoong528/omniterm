import { Server, Trash2 } from 'lucide-react';
import { useSessionStore } from '../../../stores/sessionStore';
import type { SavedSession } from '../types';

function SessionListItem({
  session,
  isActive,
  onSelect,
  onRemove,
  isDisabled,
}: {
  session: SavedSession;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  isDisabled: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (isDisabled) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (isDisabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex min-w-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-700/50 ${
        isActive ? 'bg-zinc-700/80 text-zinc-100' : 'text-zinc-300'
      } ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
      aria-label={`Connect to ${session.label}`}
    >
      <span className="min-w-0 flex-1 truncate" title={session.label}>
        {session.label}
        {session.lastConnectedAt && (
          <span className="ml-2 text-[11px] text-zinc-500" aria-label="Last connected">
            {new Date(session.lastConnectedAt).toLocaleDateString()}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        aria-label={`Remove session ${session.label}`}
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
  const { savedSessions, activeSessionId, setActiveSessionId, removeSession } = useSessionStore();

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
            onSelect={() => {
              setActiveSessionId(session.id);
              onConnectSavedSession(session);
            }}
            onRemove={() => removeSession(session.id)}
          />
        </li>
      ))}
    </ul>
  );
}
