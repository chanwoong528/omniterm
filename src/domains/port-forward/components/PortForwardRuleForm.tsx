import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { generateId } from '../../../utils/generateId';
import {
  ALL_INTERFACES_BIND_HOST,
  DEFAULT_LOCAL_BIND_HOST,
  type PortForwardRule,
} from '../types';

const MIN_PORT = 1;
const MAX_PORT = 65535;
/** 이 아래 포트는 macOS/Linux에서 관리자 권한이 필요하다. */
const PRIVILEGED_PORT_MAX = 1023;

const inputClassName =
  'w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';
const labelClassName = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500';

interface RuleDraft {
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
      label: '',
      localHost: DEFAULT_LOCAL_BIND_HOST,
      localPort: '',
      remoteHost: '',
      remotePort: '',
      autoStart: false,
    };
  }
  return {
    label: rule.label ?? '',
    localHost: rule.localHost,
    localPort: String(rule.localPort),
    remoteHost: rule.remoteHost,
    remotePort: String(rule.remotePort),
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
  const canSave = localPort !== null && remotePort !== null && remoteHost.length > 0;

  const isExposedToNetwork = draft.localHost === ALL_INTERFACES_BIND_HOST;
  const isPrivilegedPort = localPort !== null && localPort <= PRIVILEGED_PORT_MAX;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || localPort === null || remotePort === null) return;
    onSave({
      id: rule?.id ?? generateId('pf'),
      label: draft.label.trim() || undefined,
      localHost: draft.localHost,
      localPort,
      remoteHost,
      remotePort,
      autoStart: draft.autoStart,
    });
  };

  return (
    <form onSubmit={onSubmit} className="rounded border border-zinc-600 bg-zinc-900/60 p-3">
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
            Local port
          </label>
          <input
            id="pf-local-port"
            type="number"
            min={MIN_PORT}
            max={MAX_PORT}
            value={draft.localPort}
            onChange={(e) => setDraft({ ...draft, localPort: e.target.value })}
            placeholder="13306"
            className={inputClassName}
            required
          />
        </div>

        <div>
          <label className={labelClassName} htmlFor="pf-remote-host">
            Remote host
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
            Remote port
          </label>
          <input
            id="pf-remote-port"
            type="number"
            min={MIN_PORT}
            max={MAX_PORT}
            value={draft.remotePort}
            onChange={(e) => setDraft({ ...draft, remotePort: e.target.value })}
            placeholder="3306"
            className={inputClassName}
            required
          />
        </div>
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
          Binding to 0.0.0.0 exposes this remote service to everyone on your network.
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
