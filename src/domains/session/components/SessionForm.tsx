import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AuthMethod, BastionConfig, SavedSession, TargetServerConfig } from '../types';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { useSessionStore } from '../../../stores/sessionStore';
import { parseSshCommand } from '../utils/parseSshCommand';
import { ChevronDown, ClipboardPaste, Server, Key } from 'lucide-react';

const DEFAULT_SSH_PORT = 22;

interface SessionFormProps {
  onConnect: (args: {
    target: TargetServerConfig;
    useBastion: boolean;
    bastion?: BastionConfig;
    reuseBastionAuth?: boolean;
    saveSession?: { id?: string; label: string } | null;
  }) => void;
  onTestConnection?: (args: {
    target: TargetServerConfig;
    useBastion: boolean;
    bastion?: BastionConfig;
  }) => void;
  isConnecting?: boolean;
  isTesting?: boolean;
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

export function SessionForm({
  onConnect,
  onTestConnection,
  isConnecting = false,
  isTesting = false,
}: SessionFormProps) {
  const { registeredKeys, addKey } = useKeyManagerStore();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const getSessionById = useSessionStore((s) => s.getSessionById);
  const selectedSession: SavedSession | undefined = useMemo(() => {
    if (!activeSessionId) return undefined;
    return getSessionById(activeSessionId);
  }, [activeSessionId, getSessionById]);

  const [useBastion, setUseBastion] = useState(() => selectedSession?.useBastion ?? false);
  const [reuseBastionAuth, setReuseBastionAuth] = useState(() => selectedSession?.reuseBastionAuth ?? false);

  const [sessionLabel, setSessionLabel] = useState(() => selectedSession?.label ?? '');

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

  const buildTargetConfig = (): TargetServerConfig => {
    const shouldReuse = useBastion && reuseBastionAuth;
    const authMethod: AuthMethod = shouldReuse ? bastionAuthMethod : targetAuthMethod;
    const base: TargetServerConfig = {
      host: targetHost.trim(),
      port: targetPort,
      username: targetUsername.trim(),
      authMethod,
    };

    if (shouldReuse) {
      if (bastionAuthMethod === 'password') return { ...base, password: bastionPassword };
      if (bastionAuthMethod === 'private_key')
        return { ...base, privateKeyId: bastionKeyId || undefined };
      return base;
    }

    if (targetAuthMethod === 'password') return { ...base, password: targetPassword };
    if (targetAuthMethod === 'private_key') return { ...base, privateKeyId: targetKeyId || undefined };
    return base;
  };

  const buildBastionConfig = (): BastionConfig | undefined => {
    if (!useBastion || !bastionHost.trim()) return undefined;
    return {
      host: bastionHost.trim(),
      port: bastionPort,
      username: bastionUsername.trim(),
      authMethod: bastionAuthMethod,
      ...(bastionAuthMethod === 'password'
        ? { password: bastionPassword }
        : bastionAuthMethod === 'private_key'
          ? { privateKeyId: bastionKeyId || undefined }
          : {}),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = buildTargetConfig();
    const bastion = buildBastionConfig();

    // Sessions are always auto-saved at connect time (passwords excluded).
    // If the label was inherited from the selected session but the endpoints
    // were edited to a different server, drop it — the new entry should get
    // its own default (user@host) name, not the old session's label.
    const isLabelInherited = Boolean(selectedSession && sessionLabel.trim() === selectedSession.label);
    const endpointsChanged = Boolean(
      selectedSession &&
        (selectedSession.target.host !== target.host ||
          selectedSession.target.port !== target.port ||
          selectedSession.target.username !== target.username ||
          selectedSession.useBastion !== useBastion ||
          (useBastion &&
            (selectedSession.bastion?.host !== bastion?.host ||
              selectedSession.bastion?.port !== bastion?.port ||
              selectedSession.bastion?.username !== bastion?.username)))
    );
    const label =
      isLabelInherited && endpointsChanged ? buildDefaultLabel(target) : sessionLabel.trim() || buildDefaultLabel(target);

    onConnect({
      target,
      useBastion,
      bastion,
      reuseBastionAuth: useBastion ? reuseBastionAuth : false,
      saveSession: { label },
    });
  };

  const isTargetAuthValid = (() => {
    const shouldReuse = useBastion && reuseBastionAuth;
    if (shouldReuse) {
      if (bastionAuthMethod === 'private_key') return bastionKeyId !== '';
      return true;
    }
    if (targetAuthMethod === 'private_key') return targetKeyId !== '';
    return true;
  })();
  const isTargetFormValid =
    targetHost.trim() !== '' &&
    targetUsername.trim() !== '' &&
    isTargetAuthValid;
  const isBastionFormValid =
    !useBastion ||
    (bastionHost.trim() !== '' &&
      bastionUsername.trim() !== '' &&
      (bastionAuthMethod === 'private_key' ? bastionKeyId !== '' : true));
  const canSubmit = isTargetFormValid && isBastionFormValid && !isConnecting;

  const effectiveTargetKeyId = useBastion && reuseBastionAuth ? bastionKeyId : targetKeyId;
  const effectiveTargetAuth = useBastion && reuseBastionAuth ? bastionAuthMethod : targetAuthMethod;
  const canTest =
    Boolean(onTestConnection) &&
    isTargetFormValid &&
    isBastionFormValid &&
    !isConnecting &&
    !isTesting &&
    effectiveTargetAuth === 'private_key' &&
    effectiveTargetKeyId !== '' &&
    (!useBastion || (bastionAuthMethod === 'private_key' && bastionKeyId !== ''));

  const handleTestConnection = () => {
    if (!canTest || !onTestConnection) return;
    const target = buildTargetConfig();
    const bastion = buildBastionConfig();
    onTestConnection({ target, useBastion, bastion });
  };

  const fillLocalhostTest = async () => {
    setTargetHost('127.0.0.1');
    setTargetPort(22);
    setTargetAuthMethod('password');
    setUseBastion(false);
    setReuseBastionAuth(false);
    try {
      const username = await invoke<string>('get_os_username');
      if (username) setTargetUsername(username);
    } catch {
      // ignore; user can type username manually
    }
  };

  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  /**
   * Registers a key path in the Key Manager (dedup by path) and returns its id.
   * `cache` covers keys added earlier in the same import — the store state in
   * `registeredKeys` is stale until the next render.
   */
  const ensureRegisteredKey = (keyPath: string, cache: Map<string, string>): string => {
    const cached = cache.get(keyPath);
    if (cached) return cached;
    const existing = registeredKeys.find((k) => k.storageKey === keyPath);
    if (existing) {
      cache.set(keyPath, existing.id);
      return existing.id;
    }
    const id = createSessionId();
    const fileName = keyPath.split(/[\\/]/).pop() ?? keyPath;
    const dotIndex = fileName.lastIndexOf('.');
    addKey({
      id,
      label: dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName,
      storageKey: keyPath,
      keyType: dotIndex > 0 ? fileName.slice(dotIndex) : 'key',
      createdAt: new Date().toISOString(),
    });
    cache.set(keyPath, id);
    return id;
  };

  const onImportSshCommand = () => {
    const result = parseSshCommand(importText);
    if (!result.ok) {
      setImportError(result.reason);
      return;
    }
    setImportError(null);
    const { target, bastion } = result.value;
    const keyIdCache = new Map<string, string>();

    setTargetHost(target.host);
    setTargetPort(target.port);
    setTargetUsername(target.username);
    if (target.keyPath) {
      setTargetAuthMethod('private_key');
      setTargetKeyId(ensureRegisteredKey(target.keyPath, keyIdCache));
    } else {
      setTargetAuthMethod('password');
    }

    if (bastion) {
      const bastionKeyPath = bastion.keyPath ?? target.keyPath;
      setUseBastion(true);
      setBastionHost(bastion.host);
      setBastionPort(bastion.port);
      setBastionUsername(bastion.username);
      if (bastionKeyPath) {
        setBastionAuthMethod('private_key');
        setBastionKeyId(ensureRegisteredKey(bastionKeyPath, keyIdCache));
      } else {
        setBastionAuthMethod('password');
      }
      setReuseBastionAuth(Boolean(target.keyPath && bastionKeyPath === target.keyPath));
    } else {
      setUseBastion(false);
      setReuseBastionAuth(false);
    }

    const label = `${target.username ? `${target.username}@` : ''}${target.host}`;
    setSessionLabel(bastion ? `${label} (via bastion)` : label);
    setImportText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      {/* Paste an ssh command → keys auto-registered, form auto-filled */}
      <div className="flex min-w-0 flex-col gap-1.5 rounded border border-zinc-700 bg-zinc-800/40 p-2">
        <label
          htmlFor="ssh-command-import"
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
          SSH 명령어로 채우기
        </label>
        <textarea
          id="ssh-command-import"
          rows={3}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            if (importError) setImportError(null);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onImportSshCommand();
            }
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={'ssh -i key.pem -o ProxyCommand="ssh -i key.pem -W %h:%p user@bastion" user@target'}
          className="min-w-0 resize-y rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="Paste an ssh command to fill the form"
        />
        <div className="flex min-w-0 items-center justify-between gap-2">
          {importError ? (
            <p className="min-w-0 flex-1 text-xs text-red-300" role="alert">
              {importError}
            </p>
          ) : (
            <p className="min-w-0 flex-1 truncate text-xs text-zinc-500">
              키 파일은 Key Manager에 자동 등록됩니다. (⌘/Ctrl+Enter)
            </p>
          )}
          <button
            type="button"
            onClick={onImportSshCommand}
            disabled={!importText.trim()}
            className="shrink-0 rounded bg-zinc-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            가져오기
          </button>
        </div>
      </div>

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
      </p>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">Session</legend>
        <input
          type="text"
          placeholder="Label (e.g. Prod Bastion)"
          value={sessionLabel}
          onChange={(e) => setSessionLabel(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="Saved session label"
        />
        <p className="text-xs text-zinc-500">
          연결 시 세션이 자동 저장됩니다. (비밀번호는 저장되지 않음)
        </p>
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
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="Target server host"
        />
        <div className="flex min-w-0 gap-2">
          <input
            type="number"
            min={1}
            max={65535}
            placeholder="22"
            value={targetPort}
            onChange={(e) => setTargetPort(e.target.value ? Number(e.target.value) : DEFAULT_SSH_PORT)}
            className="w-16 min-w-0 shrink-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Target server port"
          />
          <input
            type="text"
            placeholder="Username"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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
        {useBastion && reuseBastionAuth && (
          <p className="text-xs text-zinc-500">
            Target will use the bastion key for this connection. Uncheck &quot;Reuse bastion auth for target&quot; to use the target key above instead.
          </p>
        )}
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Bastion server host"
          />
          <div className="flex min-w-0 gap-2">
            <input
              type="number"
              min={1}
              max={65535}
              placeholder="22"
              value={bastionPort}
              onChange={(e) => setBastionPort(e.target.value ? Number(e.target.value) : DEFAULT_SSH_PORT)}
              className="w-16 min-w-0 shrink-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              aria-label="Bastion server port"
            />
            <input
              type="text"
              placeholder="Bastion username"
              value={bastionUsername}
              onChange={(e) => setBastionUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
          <label className="flex min-w-0 cursor-pointer items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={reuseBastionAuth}
              onChange={(e) => setReuseBastionAuth(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-zinc-400 focus:ring-zinc-500"
              aria-label="Reuse bastion authentication for target server"
            />
            <span className="min-w-0 truncate text-sm text-zinc-300">
              Reuse bastion auth for target (ProxyJump-like)
            </span>
          </label>
        </fieldset>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {onTestConnection && (
          <button
            type="button"
            disabled={!canTest}
            onClick={handleTestConnection}
            className="flex min-w-0 items-center justify-center gap-2 rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            aria-label="Test connection using system SSH (private key only)"
          >
            <Key className="h-4 w-4" aria-hidden />
            {isTesting ? 'Testing…' : 'Test connection'}
          </button>
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
      </div>
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
  isDisabled = false,
}: {
  namePrefix: string;
  authMethod: AuthMethod;
  onAuthMethodChange: (m: AuthMethod) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  keyId: string;
  onKeyIdChange: (v: string) => void;
  registeredKeys: { id: string; label: string; keyType: string }[];
  isDisabled?: boolean;
}) {
  const radioName = `${namePrefix}-auth-method`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 gap-2">
        <label
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden rounded border border-zinc-600 bg-zinc-800 px-2 py-2 has-checked:border-zinc-500 has-checked:ring-1 has-checked:ring-zinc-500 ${
            isDisabled ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <input
            type="radio"
            name={radioName}
            checked={authMethod === 'password'}
            onChange={() => onAuthMethodChange('password')}
            className="sr-only"
            aria-label="Password authentication"
            disabled={isDisabled}
          />
          <Key className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <span className="truncate text-sm text-zinc-300">Password</span>
        </label>
        <label
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden rounded border border-zinc-600 bg-zinc-800 px-2 py-2 has-checked:border-zinc-500 has-checked:ring-1 has-checked:ring-zinc-500 ${
            isDisabled ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <input
            type="radio"
            name={radioName}
            checked={authMethod === 'private_key'}
            onChange={() => onAuthMethodChange('private_key')}
            className="sr-only"
            aria-label="Private key authentication"
            disabled={isDisabled}
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
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={isDisabled}
          className={`min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 ${
            isDisabled ? 'opacity-60' : ''
          }`}
          aria-label="SSH password"
        />
      ) : (
        <div className={`relative min-w-0 ${isDisabled ? 'pointer-events-none opacity-60' : ''}`}>
          <select
            value={keyId}
            onChange={(e) => onKeyIdChange(e.target.value)}
            disabled={isDisabled}
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
