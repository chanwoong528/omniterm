import { useEffect, useRef, useState } from 'react';
import { Server, Key, ChevronDown, ChevronUp, Pencil, Check } from 'lucide-react';
import type { BastionConfig, TargetServerConfig } from '../../domains/session/types';
import { useEstablishConnection } from '../../domains/session/hooks/useEstablishConnection';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSessionStore } from '../../stores/sessionStore';
import type { SavedSession } from '../../types/session';
import { SessionForm } from '../../domains/session/components/SessionForm';
import { SessionList } from '../../domains/session/components/SessionList';
import { SessionPasswordForm } from '../../domains/session/components/SessionPasswordForm';
import {
  needsPasswordPrompt,
  resolveSessionConnection,
  type SessionPasswords,
} from '../../domains/session/utils/resolveSessionConnection';
import { ImportMxtSessionsButton } from '../../domains/session/components/ImportMxtSessionsButton';
import { KeyManagerPanel } from '../../domains/key-manager/components/KeyManagerPanel';
import { PortForwardPanel } from '../../domains/port-forward/components/PortForwardPanel';
import { usePortForward } from '../../domains/port-forward/hooks/usePortForward';
import { generateId } from '../../utils/generateId';

type SidebarTab = 'sessions' | 'keys';

const TABS: { id: SidebarTab; label: string; icon: typeof Server }[] = [
  { id: 'sessions', label: 'Sessions', icon: Server },
  { id: 'keys', label: 'Key Manager', icon: Key },
];

interface SidebarProps {
  widthPx: number;
}

const SUCCESS_TOAST_HIDE_MS = 2500;

export function Sidebar({ widthPx }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('sessions');
  const [isEditingSessions, setIsEditingSessions] = useState(false);
  const {
    establishConnection,
    testConnection,
    isConnecting,
    isTesting,
    connectionError,
    connectionLog,
    clearLog,
    abortConnection,
  } = useEstablishConnection();
  const addTab = useTerminalStore((s) => s.addTab);
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const upsertSession = useSessionStore((s) => s.upsertSession);
  const markConnected = useSessionStore((s) => s.markConnected);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const activeSavedSessionId = useSessionStore((s) => s.activeSessionId);

  const [successToastMessage, setSuccessToastMessage] = useState<string | null>(null);
  const successToastTimeoutRef = useRef<number | null>(null);

  const showSuccessToast = (message: string) => {
    setSuccessToastMessage(message);
    if (successToastTimeoutRef.current !== null) {
      window.clearTimeout(successToastTimeoutRef.current);
    }
    successToastTimeoutRef.current = window.setTimeout(() => {
      setSuccessToastMessage(null);
      successToastTimeoutRef.current = null;
    }, SUCCESS_TOAST_HIDE_MS);
  };

  useEffect(() => {
    return () => {
      if (successToastTimeoutRef.current !== null) {
        window.clearTimeout(successToastTimeoutRef.current);
      }
    };
  }, []);

  /** When set, show in-app password form for this saved session (window.prompt doesn't work in Tauri webview). */
  const [passwordPromptSession, setPasswordPromptSession] = useState<SavedSession | null>(null);
  /** When set, the port forwarding panel is open for this saved session. */
  const [portForwardSessionId, setPortForwardSessionId] = useState<string | null>(null);
  const { startRule } = usePortForward();

  const runConnectWithSession = async (session: SavedSession, passwords: SessionPasswords) => {
    const { target, useBastion, bastion } = resolveSessionConnection(session, passwords);

    const runtimeSessionId = await establishConnection(target, useBastion, bastion);
    if (!runtimeSessionId) return false;

    // The shell (spawn_pty_process) is started by TerminalView after its
    // output listener is registered, so the first prompt is never lost.
    const title = `${target.username}@${target.host}`;
    addTab(runtimeSessionId, title);
    markConnected(session.id);
    showSuccessToast('Connected. Terminal tab opened.');

    // Auto-start forwards here rather than in the panel: this is the one
    // moment we hold the session's password, which is never persisted.
    const autoStartRules = (session.portForwards ?? []).filter((rule) => rule.autoStart);
    for (const rule of autoStartRules) {
      void startRule(session, rule, passwords);
    }
    return true;
  };

  const connectSavedSession = async (session: SavedSession) => {
    if (isConnecting) return;
    if (needsPasswordPrompt(session)) {
      setPasswordPromptSession(session);
      return;
    }
    await runConnectWithSession(session, {});
  };

  const onSubmitPasswordPrompt = async (passwords: SessionPasswords) => {
    const session = passwordPromptSession;
    if (!session || isConnecting) return;
    const connected = await runConnectWithSession(session, passwords);
    // Keep the form open on failure so a typo doesn't force re-selecting the
    // session and retyping everything; the error shows above via connectionError.
    if (connected) setPasswordPromptSession(null);
  };

  /** Finds a saved session with the same target/bastion endpoints, so
   *  reconnecting to a known server updates it instead of duplicating it. */
  const findMatchingSavedSession = (
    target: TargetServerConfig,
    useBastion: boolean,
    bastion?: BastionConfig
  ): SavedSession | undefined =>
    savedSessions.find((s) => {
      const sameTarget =
        s.target.host === target.host &&
        s.target.port === target.port &&
        s.target.username === target.username;
      if (!sameTarget || s.useBastion !== useBastion) return false;
      if (!useBastion) return true;
      return (
        s.bastion?.host === bastion?.host &&
        s.bastion?.port === bastion?.port &&
        s.bastion?.username === bastion?.username
      );
    });

  const handleConnect = async (args: {
    target: TargetServerConfig;
    useBastion: boolean;
    bastion?: BastionConfig;
    reuseBastionAuth?: boolean;
    saveSession?: { id?: string; label: string } | null;
  }) => {
    if (isConnecting) return;

    // Auto-save at connect time (passwords excluded) — a failed attempt still
    // keeps the configuration for retry.
    const sanitizeTarget: TargetServerConfig =
      args.target.authMethod === 'password' ? { ...args.target, password: undefined } : { ...args.target };
    const sanitizeBastion: BastionConfig | undefined =
      args.useBastion && args.bastion
        ? args.bastion.authMethod === 'password'
          ? { ...args.bastion, password: undefined }
          : { ...args.bastion }
        : undefined;
    // The id is decided by ENDPOINT match only: the same target/bastion
    // updates its existing entry; anything else becomes a NEW entry. The
    // form's selected-session id must not be reused here — the form stays
    // bound to the last-connected session, and editing it to point at a
    // different server would otherwise overwrite that entry in place.
    const existing = findMatchingSavedSession(args.target, args.useBastion, args.bastion);
    const saved: SavedSession = {
      id: existing?.id ?? generateId('sess'),
      label:
        args.saveSession?.label.trim() ||
        existing?.label ||
        `${args.target.username}@${args.target.host}`,
      folder: existing?.folder,
      target: sanitizeTarget,
      useBastion: args.useBastion,
      bastion: sanitizeBastion,
      reuseBastionAuth: args.reuseBastionAuth ?? false,
      portForwards: existing?.portForwards,
      lastConnectedAt: existing?.lastConnectedAt,
    };
    upsertSession(saved);

    const sessionId = await establishConnection(args.target, args.useBastion, args.bastion);
    if (!sessionId) return;

    const title = `${args.target.username}@${args.target.host}`;
    addTab(sessionId, title);
    showSuccessToast('Connected. Session saved automatically.');
    markConnected(saved.id);
    setActiveSessionId(saved.id);

    // Same rule as connecting from the list: auto-start forwards while we
    // still hold the passwords, which are deliberately not saved.
    const autoStartRules = (saved.portForwards ?? []).filter((rule) => rule.autoStart);
    for (const rule of autoStartRules) {
      void startRule(saved, rule, {
        targetPassword: args.target.password,
        bastionPassword: args.bastion?.password,
      });
    }
  };

  return (
    <aside
      className="flex min-w-0 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900"
      style={{ width: widthPx }}
    >
      <div className="flex min-w-0 shrink-0 border-b border-zinc-800" role="tablist" aria-label="Sidebar sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== 'sessions') setIsEditingSessions(false);
              }}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden px-2 py-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
                activeTab === tab.id
                  ? 'border-b-2 border-zinc-400 bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-3">
        <div
          id="panel-sessions"
          role="tabpanel"
          aria-labelledby="tab-sessions"
          hidden={activeTab !== 'sessions'}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="border-b border-zinc-800 pb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Saved sessions
              </h3>
              <div className="flex shrink-0 items-center gap-0.5">
                {isEditingSessions && <ImportMxtSessionsButton />}
                <button
                  type="button"
                  onClick={() => setIsEditingSessions((prev) => !prev)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                    isEditingSessions
                      ? 'text-emerald-400 hover:bg-zinc-700 hover:text-emerald-300'
                      : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                  aria-pressed={isEditingSessions}
                  aria-label={isEditingSessions ? 'Done editing sessions' : 'Edit saved sessions'}
                  title={isEditingSessions ? 'Done' : 'Edit'}
                >
                  {isEditingSessions ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {isEditingSessions ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>
            {passwordPromptSession && (
              <div className="mb-3">
                <SessionPasswordForm
                  key={passwordPromptSession.id}
                  session={passwordPromptSession}
                  submitLabel="Connect"
                  busyLabel="Connecting…"
                  isBusy={isConnecting}
                  onSubmit={(passwords) => void onSubmitPasswordPrompt(passwords)}
                  onCancel={() => setPasswordPromptSession(null)}
                />
              </div>
            )}
            <SessionList
              onConnectSavedSession={connectSavedSession}
              onOpenPortForward={(session) => setPortForwardSessionId(session.id)}
              isConnecting={isConnecting}
              isEditMode={isEditingSessions}
            />
          </div>
          <SessionForm
            key={activeSavedSessionId ?? 'new'}
            onConnect={handleConnect}
            onTestConnection={async (args) => {
              await testConnection(args.target, args.useBastion, args.bastion);
            }}
            isConnecting={isConnecting}
            isTesting={isTesting}
          />
          {connectionError && (
            <p className="rounded bg-red-900/30 px-3 py-2 text-sm text-red-300" role="alert">
              {connectionError}
            </p>
          )}
          {successToastMessage && (
            <p className="rounded bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300" role="status">
              {successToastMessage}
            </p>
          )}
          {connectionLog.length > 0 && (
            <ConnectionLog
              lines={connectionLog}
              isConnecting={isConnecting}
              isTesting={isTesting}
              onClear={clearLog}
              onAbort={abortConnection}
            />
          )}
        </div>

        <div
          id="panel-keys"
          role="tabpanel"
          aria-labelledby="tab-keys"
          hidden={activeTab !== 'keys'}
          className="min-w-0"
        >
          <KeyManagerPanel />
        </div>
      </div>

      {portForwardSessionId && (
        <PortForwardPanel
          sessionId={portForwardSessionId}
          onClose={() => setPortForwardSessionId(null)}
        />
      )}
    </aside>
  );
}

function ConnectionLog({
  lines,
  isConnecting,
  isTesting = false,
  onClear,
  onAbort,
}: {
  lines: string[];
  isConnecting: boolean;
  isTesting?: boolean;
  onClear: () => void;
  onAbort?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const inProgress = isConnecting || isTesting;

  // Auto-expand when a connection starts — adjust state during render
  // instead of via an effect (avoids a cascading re-render).
  const [prevInProgress, setPrevInProgress] = useState(inProgress);
  if (prevInProgress !== inProgress) {
    setPrevInProgress(inProgress);
    if (inProgress) setIsCollapsed(false);
  }

  useEffect(() => {
    if (scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, isCollapsed]);

  const ToggleIcon = isCollapsed ? ChevronDown : ChevronUp;
  const statusLabel = isConnecting ? 'Connecting…' : isTesting ? 'Testing…' : 'Connection Log';
  const onClickAbort = () => {
    if (!onAbort) {
      return;
    }
    onAbort();
  };

  return (
    <div className="overflow-hidden rounded border border-zinc-700 bg-zinc-950/80">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-1">
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300 focus:outline-none"
          aria-label={isCollapsed ? 'Expand connection log' : 'Collapse connection log'}
          aria-expanded={!isCollapsed}
        >
          <ToggleIcon className="h-3 w-3" aria-hidden />
          {statusLabel}
        </button>
        {inProgress ? (
          <button
            type="button"
            onClick={onClickAbort}
            disabled={!onAbort}
            className="text-[10px] text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
            aria-label="Abort current connection attempt"
          >
            Abort
          </button>
        ) : (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 focus:outline-none"
            aria-label="Clear connection log"
          >
            Clear
          </button>
        )}
      </div>
      {!isCollapsed && (
        <div
          ref={scrollRef}
          className="max-h-36 space-y-px overflow-y-auto p-2 font-mono text-[11px] leading-5 text-zinc-400"
        >
          {lines.map((line, i) => {
            const isError = line.startsWith('ERROR');
            const isSectionHeader = line.startsWith('──');
            return (
              <div
                key={i}
                className={
                  isError
                    ? 'text-red-400'
                    : isSectionHeader
                      ? 'pt-1 text-zinc-300 font-semibold'
                      : ''
                }
              >
                {line}
              </div>
            );
          })}
          {inProgress && (
            <span className="inline-block animate-pulse text-zinc-500">●</span>
          )}
        </div>
      )}
    </div>
  );
}
