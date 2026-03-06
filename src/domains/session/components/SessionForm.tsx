import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AuthMethod, BastionConfig, SavedSession, TargetServerConfig } from '../types';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { useSessionStore } from '../../../stores/sessionStore';
import { ChevronDown, Server, Key } from 'lucide-react';

const DEFAULT_SSH_PORT = 22;
const DEFAULT_SAVE_ENABLED = true;

interface SessionFormProps {
  onConnect: (args: {
    target: TargetServerConfig;
    useBastion: boolean;
    bastion?: BastionConfig;
    saveSession?: { id: string; label: string } | null;
  }) => void;
  isConnecting?: boolean;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildDefaultLabel(target: TargetServerConfig): string {
  const host = target.host?.trim();
  const user = target.username?.trim();
  if (host && user) return `${user}@${host}`;
  return host || user || 'Session';
}

export function SessionForm({ onConnect, isConnecting = false }: SessionFormProps) {
  const { registeredKeys } = useKeyManagerStore();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const getSessionById = useSessionStore((s) => s.getSessionById);
  const selectedSession: SavedSession | undefined = useMemo(() => {
    if (!activeSessionId) return undefined;
    return getSessionById(activeSessionId);
  }, [activeSessionId, getSessionById]);

  const [useBastion, setUseBastion] = useState(() => selectedSession?.useBastion ?? false);

  const [sessionLabel, setSessionLabel] = useState(() => selectedSession?.label ?? '');
  const [saveEnabled, setSaveEnabled] = useState(DEFAULT_SAVE_ENABLED);

  const [targetHost, setTargetHost] = useState(() => selectedSession?.target.host ?? '');
  const [targetPort, setTargetPort] = useState(() => selectedSession?.target.port ?? DEFAULT_SSH_PORT);
  const [targetUsername, setTargetUsername] = useState(() => selectedSession?.target.username ?? '');
  const [targetAuthMethod, setTargetAuthMethod] = useState<AuthMethod>(() => selectedSession?.target.authMethod ?? 'password');
  const [targetPassword, setTargetPassword] = useState('');
  const [targetKeyId, setTargetKeyId] = useState<string>(() => selectedSession?.target.privateKeyId ?? '');

  const [bastionHost, setBastionHost] = useState(() => selectedSession?.bastion?.host ?? '');
  const [bastionPort, setBastionPort] = useState(() => selectedSession?.bastion?.port ?? DEFAULT_SSH_PORT);
  const [bastionUsername, setBastionUsername] = useState(() => selectedSession?.bastion?.username ?? '');
  const [bastionAuthMethod, setBastionAuthMethod] = useState<AuthMethod>(() => selectedSession?.bastion?.authMethod ?? 'password');
  const [bastionPassword, setBastionPassword] = useState('');
  const [bastionKeyId, setBastionKeyId] = useState<string>(() => selectedSession?.bastion?.privateKeyId ?? '');

  const buildTargetConfig = (): TargetServerConfig => ({
    host: targetHost.trim(),
    port: targetPort,
    username: targetUsername.trim(),
    authMethod: targetAuthMethod,
    ...(targetAuthMethod === 'password' ? { password: targetPassword } : { privateKeyId: targetKeyId || undefined }),
  });

  const buildBastionConfig = (): BastionConfig | undefined => {
    if (!useBastion || !bastionHost.trim()) return undefined;
    return {
      host: bastionHost.trim(),
      port: bastionPort,
      username: bastionUsername.trim(),
      authMethod: bastionAuthMethod,
      ...(bastionAuthMethod === 'password' ? { password: bastionPassword } : { privateKeyId: bastionKeyId || undefined }),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = buildTargetConfig();
    const bastion = buildBastionConfig();

    const label = sessionLabel.trim() || buildDefaultLabel(target);
    const sessionIdForSave = selectedSession?.id ?? createSessionId();
    const saveSession = saveEnabled ? { id: sessionIdForSave, label } : null;

    onConnect({
      target,
      useBastion,
      bastion,
      saveSession,
    });
  };

  const isTargetFormValid =
    targetHost.trim() !== '' &&
    targetUsername.trim() !== '' &&
    (targetAuthMethod === 'password' ? true : targetKeyId !== '');
  const isBastionFormValid = !useBastion || (bastionHost.trim() !== '' && bastionUsername.trim() !== '' && (bastionAuthMethod === 'password' ? true : bastionKeyId !== ''));
  const canSubmit = isTargetFormValid && isBastionFormValid && !isConnecting;

  const fillLocalhostTest = async () => {
    setTargetHost('127.0.0.1');
    setTargetPort(22);
    setTargetAuthMethod('password');
    setUseBastion(false);
    try {
      const username = await invoke<string>('get_os_username');
      if (username) setTargetUsername(username);
    } catch {
      // ignore; user can type username manually
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <p className="text-xs text-zinc-500">
        테스트:{' '}
        <button
          type="button"
          onClick={fillLocalhostTest}
          className="underline hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded"
          aria-label="Fill localhost test values"
        >
          이 컴퓨터(127.0.0.1)로 채우기
        </button>
        {' '}(원격 로그인 켜져 있어야 함)
      </p>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">Session</legend>
        <input
          type="text"
          placeholder="Label (e.g. Prod Bastion)"
          value={sessionLabel}
          onChange={(e) => setSessionLabel(e.target.value)}
          className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="Saved session label"
        />
        <label className="flex min-w-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={saveEnabled}
            onChange={(e) => setSaveEnabled(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-zinc-400 focus:ring-zinc-500"
            aria-label="Save this session"
          />
          <span className="min-w-0 truncate text-sm text-zinc-300">
            Save session (passwords are not stored)
          </span>
        </label>
      </fieldset>
      {/* Target Server */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Target Server
        </legend>
        <input
          type="text"
          placeholder="Host"
          value={targetHost}
          onChange={(e) => setTargetHost(e.target.value)}
          className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="Target server host"
        />
        <div className="flex min-w-0 gap-2">
          <input
            type="number"
            min={1}
            max={65535}
            placeholder="Port"
            value={targetPort === DEFAULT_SSH_PORT ? '' : targetPort}
            onChange={(e) => setTargetPort(e.target.value ? Number(e.target.value) : DEFAULT_SSH_PORT)}
            className="w-16 min-w-0 shrink-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Target server port"
          />
          <input
            type="text"
            placeholder="Username"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Target server username"
          />
        </div>
        <AuthFields
          namePrefix="target"
          authMethod={targetAuthMethod}
          onAuthMethodChange={setTargetAuthMethod}
          password={targetPassword}
          onPasswordChange={setTargetPassword}
          keyId={targetKeyId}
          onKeyIdChange={setTargetKeyId}
          registeredKeys={registeredKeys}
        />
      </fieldset>

      {/* Bastion (Jump Host) Toggle */}
      <label className="flex min-w-0 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={useBastion}
          onChange={(e) => setUseBastion(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-zinc-400 focus:ring-zinc-500"
          aria-label="Use Bastion (Jump Host)"
        />
        <span className="min-w-0 truncate text-sm text-zinc-300">Use Bastion (Jump Host)</span>
      </label>

      {useBastion && (
        <fieldset className="flex min-w-0 flex-col gap-2 rounded border border-zinc-700 bg-zinc-800/50 p-3">
          <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Bastion Server
          </legend>
          <input
            type="text"
            placeholder="Bastion host"
            value={bastionHost}
            onChange={(e) => setBastionHost(e.target.value)}
            className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Bastion server host"
          />
          <div className="flex min-w-0 gap-2">
            <input
              type="number"
              min={1}
              max={65535}
              placeholder="Port"
              value={bastionPort === DEFAULT_SSH_PORT ? '' : bastionPort}
              onChange={(e) => setBastionPort(e.target.value ? Number(e.target.value) : DEFAULT_SSH_PORT)}
              className="w-16 min-w-0 shrink-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              aria-label="Bastion server port"
            />
            <input
              type="text"
              placeholder="Bastion username"
              value={bastionUsername}
              onChange={(e) => setBastionUsername(e.target.value)}
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              aria-label="Bastion server username"
            />
          </div>
          <AuthFields
            namePrefix="bastion"
            authMethod={bastionAuthMethod}
            onAuthMethodChange={setBastionAuthMethod}
            password={bastionPassword}
            onPasswordChange={setBastionPassword}
            keyId={bastionKeyId}
            onKeyIdChange={setBastionKeyId}
            registeredKeys={registeredKeys}
          />
        </fieldset>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex min-w-0 items-center justify-center gap-2 rounded bg-zinc-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
        aria-label="Connect to server"
      >
        <Server className="h-4 w-4" aria-hidden />
        {isConnecting ? 'Connecting…' : 'Connect'}
      </button>
    </form>
  );
}

function AuthFields({
  namePrefix,
  authMethod,
  onAuthMethodChange,
  password,
  onPasswordChange,
  keyId,
  onKeyIdChange,
  registeredKeys,
}: {
  namePrefix: string;
  authMethod: AuthMethod;
  onAuthMethodChange: (m: AuthMethod) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  keyId: string;
  onKeyIdChange: (v: string) => void;
  registeredKeys: { id: string; label: string; keyType: string }[];
}) {
  const radioName = `${namePrefix}-auth-method`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden rounded border border-zinc-600 bg-zinc-800 px-2 py-2 has-checked:border-zinc-500 has-checked:ring-1 has-checked:ring-zinc-500">
          <input
            type="radio"
            name={radioName}
            checked={authMethod === 'password'}
            onChange={() => onAuthMethodChange('password')}
            className="sr-only"
            aria-label="Password authentication"
          />
          <Key className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <span className="truncate text-sm text-zinc-300">Password</span>
        </label>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden rounded border border-zinc-600 bg-zinc-800 px-2 py-2 has-checked:border-zinc-500 has-checked:ring-1 has-checked:ring-zinc-500">
          <input
            type="radio"
            name={radioName}
            checked={authMethod === 'private_key'}
            onChange={() => onAuthMethodChange('private_key')}
            className="sr-only"
            aria-label="Private key authentication"
          />
          <Key className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <span className="truncate text-sm text-zinc-300">Private Key</span>
        </label>
      </div>
      {authMethod === 'password' ? (
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="SSH password"
        />
      ) : (
        <div className="relative min-w-0">
          <select
            value={keyId}
            onChange={(e) => onKeyIdChange(e.target.value)}
            className="min-w-0 w-full appearance-none rounded border border-zinc-600 bg-zinc-800 px-3 py-2 pr-8 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Select private key"
          >
            <option value="">Select key…</option>
            {registeredKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.label} ({key.keyType})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
        </div>
      )}
    </div>
  );
}
