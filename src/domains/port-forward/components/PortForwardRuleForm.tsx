import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { generateId } from '../../../utils/generateId';
import {
  ALL_INTERFACES_BIND_HOST,
  DEFAULT_LOCAL_BIND_HOST,
  FORWARD_KIND_HINT,
  FORWARD_KIND_LABEL,
  type ForwardKind,
  type PortForwardRule,
} from '../types';

const MIN_PORT = 1;
const MAX_PORT = 65535;
/** 이 아래 포트는 macOS/Linux에서 관리자 권한이 필요하다. */
const PRIVILEGED_PORT_MAX = 1023;

const KINDS: ForwardKind[] = ['local', 'remote', 'dynamic'];

const inputClassName =
  'w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';
const labelClassName = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500';

interface RuleDraft {
  kind: ForwardKind;
  label: string;
  localHost: string;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  autoStart: boolean;
}

function toDraft(rule: PortForwardRule | null): RuleDraft {
  if (!rule) {
    return {
      kind: 'local',
      label: '',
      localHost: DEFAULT_LOCAL_BIND_HOST,
      localPort: '',
      remoteHost: '',
      remotePort: '',
      autoStart: false,
    };
  }
  return {
    kind: rule.kind,
    label: rule.label ?? '',
    localHost: rule.localHost,
    localPort: String(rule.localPort),
    remoteHost: rule.remoteHost ?? '',
    remotePort: rule.remotePort === undefined ? '' : String(rule.remotePort),
    autoStart: rule.autoStart ?? false,
  };
}

function parsePort(value: string): number | null {
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;
  return port;
}

/** 규칙 추가/수정 폼. `rule`이 있으면 수정, 없으면 새 규칙. */
export function PortForwardRuleForm({
  rule,
  onSave,
  onCancel,
}: {
  rule: PortForwardRule | null;
  onSave: (rule: PortForwardRule) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(() => toDraft(rule));

  const localPort = parsePort(draft.localPort);
  const remotePort = parsePort(draft.remotePort);
  const remoteHost = draft.remoteHost.trim();
  const localHost = draft.localHost.trim();

  const canSave = (() => {
    if (localPort === null) return false;
    if (draft.kind === 'dynamic') return true;
    if (draft.kind === 'remote') {
      // 서버 포트를 비우면 서버가 골라 준다. 내 쪽 목적지 호스트는 필요하다.
      return localHost.length > 0 && (draft.remotePort.trim() === '' || remotePort !== null);
    }
    return remoteHost.length > 0 && remotePort !== null;
  })();

  // 로컬 리스너를 여는 종류에만 바인드 주소·특권 포트 경고가 의미 있다.
  const bindsLocally = draft.kind !== 'remote';
  const isExposedToNetwork = bindsLocally && draft.localHost === ALL_INTERFACES_BIND_HOST;
  const isPrivilegedPort =
    bindsLocally && localPort !== null && localPort <= PRIVILEGED_PORT_MAX;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || localPort === null) return;
    const base = {
      id: rule?.id ?? generateId('pf'),
      kind: draft.kind,
      label: draft.label.trim() || undefined,
      localHost: draft.kind === 'remote' ? localHost : draft.localHost,
      localPort,
      autoStart: draft.autoStart,
    };
    if (draft.kind === 'dynamic') {
      onSave(base);
      return;
    }
    onSave({
      ...base,
      remoteHost: draft.kind === 'remote' ? remoteHost : remoteHost,
      remotePort: draft.kind === 'remote' ? (remotePort ?? 0) : (remotePort as number),
    });
  };

  return (
    <form onSubmit={onSubmit} className="rounded border border-zinc-600 bg-zinc-900/60 p-3">
      <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Forwarding type">
        {KINDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={draft.kind === option}
            onClick={() => setDraft({ ...draft, kind: option })}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              draft.kind === option
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300'
            }`}
            tabIndex={0}
          >
            {FORWARD_KIND_LABEL[option]}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">{FORWARD_KIND_HINT[draft.kind]}</p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className={labelClassName} htmlFor="pf-label">
            Name (optional)
          </label>
          <input
            id="pf-label"
            type="text"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="e.g. prod DB"
            className={inputClassName}
          />
        </div>

        {draft.kind === 'remote' ? (
          <>
            <div>
              <label className={labelClassName} htmlFor="pf-remote-port">
                Server port
              </label>
              <input
                id="pf-remote-port"
                type="number"
                min={MIN_PORT}
                max={MAX_PORT}
                value={draft.remotePort}
                onChange={(e) => setDraft({ ...draft, remotePort: e.target.value })}
                placeholder="auto"
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName} htmlFor="pf-remote-host">
                Server bind address
              </label>
              <input
                id="pf-remote-host"
                type="text"
                value={draft.remoteHost}
                onChange={(e) => setDraft({ ...draft, remoteHost: e.target.value })}
                placeholder="server default (loopback)"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName} htmlFor="pf-local-host">
                Destination host (here)
              </label>
              <input
                id="pf-local-host"
                type="text"
                value={draft.localHost}
                onChange={(e) => setDraft({ ...draft, localHost: e.target.value })}
                placeholder="localhost"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputClassName}
                required
              />
            </div>
            <div>
              <label className={labelClassName} htmlFor="pf-local-port">
                Destination port (here)
              </label>
              <input
                id="pf-local-port"
                type="number"
                min={MIN_PORT}
                max={MAX_PORT}
                value={draft.localPort}
                onChange={(e) => setDraft({ ...draft, localPort: e.target.value })}
                placeholder="3000"
                className={inputClassName}
                required
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelClassName} htmlFor="pf-local-host">
                Local bind
              </label>
              <select
                id="pf-local-host"
                value={draft.localHost}
                onChange={(e) => setDraft({ ...draft, localHost: e.target.value })}
                className={inputClassName}
              >
                <option value={DEFAULT_LOCAL_BIND_HOST}>127.0.0.1 (this machine)</option>
                <option value={ALL_INTERFACES_BIND_HOST}>0.0.0.0 (all interfaces)</option>
              </select>
            </div>
            <div>
              <label className={labelClassName} htmlFor="pf-local-port">
                {draft.kind === 'dynamic' ? 'SOCKS port' : 'Local port'}
              </label>
              <input
                id="pf-local-port"
                type="number"
                min={MIN_PORT}
                max={MAX_PORT}
                value={draft.localPort}
                onChange={(e) => setDraft({ ...draft, localPort: e.target.value })}
                placeholder={draft.kind === 'dynamic' ? '1080' : '5432'}
                className={inputClassName}
                required
              />
            </div>

            {draft.kind === 'local' && (
              <>
                <div>
                  <label className={labelClassName} htmlFor="pf-remote-host">
                    Destination host
                  </label>
                  <input
                    id="pf-remote-host"
                    type="text"
                    value={draft.remoteHost}
                    onChange={(e) => setDraft({ ...draft, remoteHost: e.target.value })}
                    placeholder="db.internal"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={inputClassName}
                    required
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="pf-remote-port">
                    Destination port
                  </label>
                  <input
                    id="pf-remote-port"
                    type="number"
                    min={MIN_PORT}
                    max={MAX_PORT}
                    value={draft.remotePort}
                    onChange={(e) => setDraft({ ...draft, remotePort: e.target.value })}
                    placeholder="5432"
                    className={inputClassName}
                    required
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <label className="mb-3 flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={draft.autoStart}
          onChange={(e) => setDraft({ ...draft, autoStart: e.target.checked })}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        Start automatically when connecting this session
      </label>

      {isExposedToNetwork && (
        <p className="mb-2 flex items-start gap-1.5 rounded bg-amber-900/30 px-2 py-1.5 text-[11px] text-amber-300">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Binding to 0.0.0.0 exposes this to everyone on your network.
        </p>
      )}
      {isPrivilegedPort && (
        <p className="mb-2 flex items-start gap-1.5 rounded bg-amber-900/30 px-2 py-1.5 text-[11px] text-amber-300">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Ports below 1024 usually require administrator privileges to bind.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          tabIndex={0}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          tabIndex={0}
        >
          {rule ? 'Save rule' : 'Add rule'}
        </button>
      </div>
    </form>
  );
}
