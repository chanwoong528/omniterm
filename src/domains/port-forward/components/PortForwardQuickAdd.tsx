import { useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { generateId } from '../../../utils/generateId';
import {
  FORWARD_KIND_HINT,
  FORWARD_KIND_LABEL,
  forwardRuleSummary,
  type ForwardKind,
  type PortForwardRule,
} from '../types';
import {
  parseQuickAddInput,
  QUICK_ADD_HINT,
  QUICK_ADD_PLACEHOLDER,
} from '../utils/parseForwardTarget';

const KINDS: ForwardKind[] = ['local', 'remote', 'dynamic'];

/**
 * 포워딩을 시작하는 기본 경로: 종류를 고르고 한 줄 붙여넣고 Enter.
 * 로컬 포워딩이면 로컬 포트를 원격 포트와 같은 번호로 맞춘다 — DB 툴에는
 * 호스트만 localhost로 바꿔 넣으면 되므로 외울 것이 없다.
 */
export function PortForwardQuickAdd({
  existingRules,
  onCreate,
}: {
  existingRules: PortForwardRule[];
  onCreate: (rule: PortForwardRule) => void;
}) {
  const [kind, setKind] = useState<ForwardKind>('local');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const usedLocalPorts = existingRules.map((rule) => rule.localPort);
  const draft = parseQuickAddInput(kind, input, usedLocalPorts);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) {
      setError(`Could not read that. ${QUICK_ADD_PLACEHOLDER[kind].split('— ')[1] ?? ''}`.trim());
      return;
    }

    // 같은 규칙이 이미 있으면 늘리지 않고 그것을 다시 쓴다.
    const existing = existingRules.find(
      (rule) =>
        rule.kind === draft.kind &&
        rule.remoteHost === draft.remoteHost &&
        rule.remotePort === draft.remotePort &&
        rule.localPort === draft.localPort
    );
    setInput('');
    setError(null);
    onCreate(existing ?? { id: generateId('pf'), ...draft });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Forwarding type">
        {KINDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => {
              setKind(option);
              setError(null);
            }}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              kind === option
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300'
            }`}
            title={FORWARD_KIND_HINT[option]}
            tabIndex={0}
          >
            {FORWARD_KIND_LABEL[option]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder={QUICK_ADD_PLACEHOLDER[kind]}
          aria-label={`Endpoint for ${FORWARD_KIND_LABEL[kind]} forwarding`}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        <button
          type="submit"
          disabled={!draft}
          className="flex shrink-0 items-center gap-1.5 rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label="Start forwarding"
          tabIndex={0}
        >
          <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
          Forward
        </button>
      </div>

      <p className="mt-1.5 min-h-4 text-[11px]" aria-live="polite">
        {error ? (
          <span className="text-red-400">{error}</span>
        ) : draft ? (
          <span className="font-mono text-emerald-400">
            {forwardRuleSummary({ id: 'preview', ...draft })}
          </span>
        ) : (
          <span className="text-zinc-500">{QUICK_ADD_HINT[kind]}</span>
        )}
      </p>
    </form>
  );
}
