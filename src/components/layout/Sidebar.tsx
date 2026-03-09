import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Server, Key, ChevronDown, ChevronUp } from 'lucide-react';
import type { BastionConfig, TargetServerConfig } from '../../domains/session/types';
import { useEstablishConnection } from '../../domains/session/hooks/useEstablishConnection';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSessionStore } from '../../stores/sessionStore';
import type { SavedSession } from '../../types/session';
import { SessionForm } from '../../domains/session/components/SessionForm';
import { SessionList } from '../../domains/session/components/SessionList';
import { KeyManagerPanel } from '../../domains/key-manager/components/KeyManagerPanel';

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
  const { establishConnection, isConnecting, connectionError, connectionLog, clearLog } = useEstablishConnection();
  const addTab = useTerminalStore((s) => s.addTab);
  const upsertSession = useSessionStore((s) => s.upsertSession);
  const markConnected = useSessionStore((s) => s.markConnected);
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

  /** When set, show in-app password form for this saved session (window.prompt doesn't work in Tauri webview). */
  const [passwordPromptSession, setPasswordPromptSession] = useState<SavedSession | null>(null);
  const [passwordPromptTargetPassword, setPasswordPromptTargetPassword] = useState('');
  const [passwordPromptBastionPassword, setPasswordPromptBastionPassword] = useState('');

  const runConnectWithSession = async (
    session: SavedSession,
    targetPassword: string | undefined,
    bastionPassword: string | undefined
  ) => {
    const shouldReuseBastionAuth =
      Boolean(session.useBastion && session.reuseBastionAuth && session.bastion);

    const bastion: BastionConfig | undefined =
      session.useBastion && session.bastion
        ? session.bastion.authMethod === 'password'
          ? { ...session.bastion, password: bastionPassword ?? undefined }
          : { ...session.bastion }
        : undefined;

    const target: TargetServerConfig = (() => {
      if (shouldReuseBastionAuth && bastion) {
        if (bastion.authMethod === 'password') {
          return { ...session.target, authMethod: 'password', password: bastion.password };
        }
        return { ...session.target, authMethod: 'private_key', privateKeyId: bastion.privateKeyId };
      }
      if (session.target.authMethod === 'password') {
        return { ...session.target, password: targetPassword ?? undefined };
      }
      return { ...session.target };
    })();

    const runtimeSessionId = await establishConnection(target, session.useBastion, bastion);
    if (!runtimeSessionId) return;

    const title = `${target.username}@${target.host}`;
    addTab(runtimeSessionId, title);
    invoke('spawn_pty_process', { sessionId: runtimeSessionId }).catch(() => {});
    markConnected(session.id);
    showSuccessToast('연결됨. 터미널 탭이 열렸습니다.');
  };

  const connectSavedSession = async (session: SavedSession) => {
    if (isConnecting) return;

    const shouldReuseBastionAuth =
      Boolean(session.useBastion && session.reuseBastionAuth && session.bastion);
    const needsBastionPassword =
      session.useBastion && session.bastion?.authMethod === 'password';
    const needsTargetPassword =
      !shouldReuseBastionAuth && session.target.authMethod === 'password';

    if (needsTargetPassword || needsBastionPassword) {
      setPasswordPromptSession(session);
      setPasswordPromptTargetPassword('');
      setPasswordPromptBastionPassword('');
      return;
    }

    await runConnectWithSession(session, undefined, undefined);
  };

  const onSubmitPasswordPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const session = passwordPromptSession;
    if (!session || isConnecting) return;
    const shouldReuseBastionAuth =
      Boolean(session.useBastion && session.reuseBastionAuth && session.bastion);
    const needsBastion = session.useBastion && session.bastion?.authMethod === 'password';
    const needsTarget = !shouldReuseBastionAuth && session.target.authMethod === 'password';
    if (needsTarget && !passwordPromptTargetPassword.trim()) return;
    if (needsBastion && !passwordPromptBastionPassword.trim()) return;

    await runConnectWithSession(
      session,
      needsTarget ? passwordPromptTargetPassword : undefined,
      needsBastion ? passwordPromptBastionPassword : undefined
    );
    setPasswordPromptSession(null);
    setPasswordPromptTargetPassword('');
    setPasswordPromptBastionPassword('');
  };

  const handleConnect = async (args: {
    target: TargetServerConfig;
    useBastion: boolean;
    bastion?: BastionConfig;
    reuseBastionAuth?: boolean;
    saveSession?: { id: string; label: string } | null;
  }) => {
    const sessionId = await establishConnection(args.target, args.useBastion, args.bastion);
    if (sessionId) {
      const title = `${args.target.username}@${args.target.host}`;
      addTab(sessionId, title);
      invoke('spawn_pty_process', { sessionId }).catch(() => {
        // Error already shown via terminal-output event or user can retry
      });
      showSuccessToast('연결됨. 터미널 탭이 열렸습니다.');

      if (args.saveSession) {
        const sanitizeTarget: TargetServerConfig =
          args.target.authMethod === 'password' ? { ...args.target, password: undefined } : { ...args.target };
        const sanitizeBastion: BastionConfig | undefined =
          args.useBastion && args.bastion
            ? args.bastion.authMethod === 'password'
              ? { ...args.bastion, password: undefined }
              : { ...args.bastion }
            : undefined;

        const saved: SavedSession = {
          id: args.saveSession.id,
          label: args.saveSession.label,
          target: sanitizeTarget,
          useBastion: args.useBastion,
          bastion: sanitizeBastion,
          reuseBastionAuth: args.reuseBastionAuth ?? false,
          lastConnectedAt: new Date().toISOString(),
        };
        upsertSession(saved);
        markConnected(saved.id);
      }
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
              onClick={() => setActiveTab(tab.id)}
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
            <ConnectionLog lines={connectionLog} isConnecting={isConnecting} onClear={clearLog} />
          )}
          <SessionForm
            key={activeSavedSessionId ?? 'new'}
            onConnect={handleConnect}
            isConnecting={isConnecting}
          />
          <div className="border-t border-zinc-800 pt-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Saved sessions
            </h3>
            {passwordPromptSession && (
              <form
                onSubmit={onSubmitPasswordPrompt}
                className="mb-3 rounded border border-zinc-600 bg-zinc-800/80 p-3"
              >
                {(() => {
                  const shouldReuseBastionAuth = Boolean(
                    passwordPromptSession.useBastion &&
                      passwordPromptSession.reuseBastionAuth &&
                      passwordPromptSession.bastion
                  );
                  const showTargetPassword =
                    !shouldReuseBastionAuth && passwordPromptSession.target.authMethod === 'password';
                  const showBastionPassword =
                    passwordPromptSession.useBastion &&
                    passwordPromptSession.bastion?.authMethod === 'password';
                  return (
                    <>
                <p className="mb-2 text-xs text-zinc-300">
                  비밀번호 입력: {passwordPromptSession.label}
                </p>
                {showTargetPassword && (
                  <input
                    type="password"
                    placeholder="Target password"
                    value={passwordPromptTargetPassword}
                    onChange={(e) => setPasswordPromptTargetPassword(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mb-2 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    autoComplete="current-password"
                    aria-label="Target server password"
                  />
                )}
                {showBastionPassword && (
                    <input
                      type="password"
                      placeholder={shouldReuseBastionAuth ? 'Bastion/Target password' : 'Bastion password'}
                      value={passwordPromptBastionPassword}
                      onChange={(e) => setPasswordPromptBastionPassword(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="mb-2 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      autoComplete="current-password"
                      aria-label="Bastion server password"
                    />
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className="rounded bg-zinc-600 px-2 py-1.5 text-xs text-white hover:bg-zinc-500 disabled:opacity-50"
                  >
                    {isConnecting ? '연결 중…' : '연결'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordPromptSession(null);
                      setPasswordPromptTargetPassword('');
                      setPasswordPromptBastionPassword('');
                    }}
                    className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    취소
                  </button>
                </div>
                    </>
                  );
                })()}
              </form>
            )}
            <SessionList onConnectSavedSession={connectSavedSession} isConnecting={isConnecting} />
          </div>
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
    </aside>
  );
}

function ConnectionLog({
  lines,
  isConnecting,
  onClear,
}: {
  lines: string[];
  isConnecting: boolean;
  onClear: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, isCollapsed]);

  useEffect(() => {
    if (isConnecting) setIsCollapsed(false);
  }, [isConnecting]);

  const ToggleIcon = isCollapsed ? ChevronDown : ChevronUp;

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
          {isConnecting ? 'Connecting…' : 'Connection Log'}
        </button>
        {!isConnecting && (
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
          {isConnecting && (
            <span className="inline-block animate-pulse text-zinc-500">●</span>
          )}
        </div>
      )}
    </div>
  );
}
