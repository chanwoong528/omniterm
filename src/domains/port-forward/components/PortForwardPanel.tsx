import { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Pencil,
  Play,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import { useSessionStore } from '../../../stores/sessionStore';
import { usePortForwardStore } from '../../../stores/portForwardStore';
import { useMissingKeyModalStore } from '../../../stores/missingKeyModalStore';
import { SessionPasswordForm } from '../../session/components/SessionPasswordForm';
import {
  needsPasswordPrompt,
  type SessionPasswords,
} from '../../session/utils/resolveSessionConnection';
import type { SavedSession } from '../../session/types';
import { usePortForward } from '../hooks/usePortForward';
import { usePortForwardLog } from '../hooks/usePortForwardLog';
import {
  copyableEndpoint,
  describePortForwardRule,
  FORWARD_KIND_LABEL,
  forwardRuleSummary,
  type PortForwardRule,
  type PortForwardStatus,
} from '../types';
import { suggestAlternativePort } from '../utils/parseForwardTarget';
import { PortForwardQuickAdd } from './PortForwardQuickAdd';
import { PortForwardRuleForm } from './PortForwardRuleForm';

const COPY_FEEDBACK_MS = 1500;

/** 로컬 포트가 이미 점유됐다는 백엔드 에러인지. */
function isPortConflict(status: PortForwardStatus | undefined): boolean {
  return status?.state === 'error' && /already in use/i.test(status.message ?? '');
}

/**
 * 한 세션의 포트 포워딩을 편집하고 실행하는 모달.
 * 규칙은 SavedSession에 저장되고, 실행 상태는 백엔드가 이벤트로 알려준다.
 */
export function PortForwardPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  // 스토어에서 직접 읽는다 — 패널 안에서 규칙을 고치면 즉시 반영되어야 한다.
  const session = useSessionStore((s) => s.savedSessions.find((item) => item.id === sessionId));
  // 포워딩 시작이 키 파일 재지정 모달을 띄울 수 있다. 그때의 Escape는 그 모달의
  // 것이므로 이 패널이 가로채면 안 된다.
  const missingKeyRequest = useMissingKeyModalStore((s) => s.request);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !missingKeyRequest) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, missingKeyRequest]);

  if (!session) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="port-forward-title"
        className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl"
      >
        <PanelContent session={session} onClose={onClose} />
      </div>
    </div>
  );
}

function PanelContent({ session, onClose }: { session: SavedSession; onClose: () => void }) {
  const rules = session.portForwards ?? [];
  const upsertRule = useSessionStore((s) => s.upsertPortForwardRule);
  const removeRule = useSessionStore((s) => s.removePortForwardRule);
  const statusByRuleId = usePortForwardStore((s) => s.statusByRuleId);
  const pendingRuleIds = usePortForwardStore((s) => s.pendingRuleIds);
  const { startRule, stopRule, stopAllForSession } = usePortForward();
  const { lines, clearLines } = usePortForwardLog(rules.map((rule) => rule.id));

  /** null이면 폼이 닫힌 상태, 'new'면 추가, 규칙이면 수정. */
  const [editing, setEditing] = useState<PortForwardRule | 'new' | null>(null);
  /** 비밀번호를 받아야 시작할 수 있는 규칙. */
  const [awaitingPasswordRule, setAwaitingPasswordRule] = useState<PortForwardRule | null>(null);

  const runningCount = rules.filter((rule) => statusByRuleId[rule.id]?.state === 'running').length;

  const onRequestStart = (rule: PortForwardRule) => {
    if (needsPasswordPrompt(session)) {
      setAwaitingPasswordRule(rule);
      return;
    }
    void startRule(session, rule);
  };

  /** 한 줄 입력으로 만든 규칙은 저장하고 바로 시작한다 — 그게 유일한 목적이다. */
  const onQuickCreate = (rule: PortForwardRule) => {
    upsertRule(session.id, rule);
    onRequestStart(rule);
  };

  const onSubmitPassword = async (passwords: SessionPasswords) => {
    const rule = awaitingPasswordRule;
    if (!rule) return;
    const started = await startRule(session, rule, passwords);
    // 실패하면 폼을 열어 둔다 — 오타 하나에 다시 처음부터 입력하지 않도록.
    if (started) setAwaitingPasswordRule(null);
  };

  const onRemoveWithConfirm = async (rule: PortForwardRule) => {
    const confirmed = await ask(`Delete this port forward?\n${forwardRuleSummary(rule)}`, {
      title: 'Delete rule',
      kind: 'warning',
    });
    if (!confirmed) return;
    await stopRule(rule.id);
    removeRule(session.id, rule.id);
  };

  /** 로컬 포트가 점유됐을 때 다른 포트로 바꿔 바로 재시도한다. */
  const onUseAlternativePort = (rule: PortForwardRule) => {
    const moved: PortForwardRule = {
      ...rule,
      localPort: suggestAlternativePort(rule.localPort),
    };
    upsertRule(session.id, moved);
    onRequestStart(moved);
  };

  const onSaveRule = (rule: PortForwardRule) => {
    upsertRule(session.id, rule);
    setEditing(null);
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-700 px-4 py-3">
        <ArrowRightLeft className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="port-forward-title" className="truncate text-sm font-semibold text-zinc-100">
            Port Forwarding — {session.label}
          </h2>
          <p className="truncate text-[11px] text-zinc-500">
            through {session.target.username}@{session.target.host}:{session.target.port}
            {session.useBastion && session.bastion ? ` via ${session.bastion.host}` : ''}
          </p>
        </div>
        {runningCount > 0 && (
          <button
            type="button"
            onClick={() => void stopAllForSession(session.id)}
            className="shrink-0 rounded px-2 py-1 text-xs text-red-400 hover:bg-zinc-700 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Stop all port forwards for this session"
            tabIndex={0}
          >
            Stop all
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label="Close port forwarding panel"
          tabIndex={0}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <PortForwardQuickAdd existingRules={rules} onCreate={onQuickCreate} />

        {rules.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="Port forward rules">
            {rules.map((rule) => (
              <li key={rule.id}>
                <RuleRow
                  rule={rule}
                  status={statusByRuleId[rule.id]}
                  isPending={pendingRuleIds.includes(rule.id)}
                  onStart={() => onRequestStart(rule)}
                  onStop={() => void stopRule(rule.id)}
                  onEdit={() => setEditing(rule)}
                  onRemove={() => void onRemoveWithConfirm(rule)}
                  onUseAlternativePort={() => onUseAlternativePort(rule)}
                />
              </li>
            ))}
          </ul>
        )}

        {awaitingPasswordRule && (
          <SessionPasswordForm
            key={awaitingPasswordRule.id}
            session={session}
            submitLabel={`Start ${describePortForwardRule(awaitingPasswordRule)}`}
            busyLabel="Starting…"
            isBusy={pendingRuleIds.includes(awaitingPasswordRule.id)}
            onSubmit={(passwords) => void onSubmitPassword(passwords)}
            onCancel={() => setAwaitingPasswordRule(null)}
          />
        )}

        <AdvancedSection
          isOpen={editing !== null}
          onOpen={() => setEditing('new')}
          onClose={() => setEditing(null)}
        >
          {editing !== null && (
            <PortForwardRuleForm
              key={editing === 'new' ? 'new' : editing.id}
              rule={editing === 'new' ? null : editing}
              onSave={onSaveRule}
              onCancel={() => setEditing(null)}
            />
          )}
        </AdvancedSection>

        {lines.length > 0 && <ActivityLog lines={lines} onClear={clearLines} />}
      </div>
    </>
  );
}

/** 세부 설정이 필요할 때만 펼치는 영역. 기본 경로는 위의 한 줄 입력이다. */
function AdvancedSection({
  isOpen,
  onOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ToggleIcon = isOpen ? ChevronDown : ChevronRight;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={isOpen ? onClose : onOpen}
        aria-expanded={isOpen}
        className="flex items-center gap-1 self-start text-[11px] text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        tabIndex={0}
      >
        <ToggleIcon className="h-3 w-3" aria-hidden />
        Advanced — custom ports, bind address, auto-start
      </button>
      {children}
    </div>
  );
}

function RuleRow({
  rule,
  status,
  isPending,
  onStart,
  onStop,
  onEdit,
  onRemove,
  onUseAlternativePort,
}: {
  rule: PortForwardRule;
  status: PortForwardStatus | undefined;
  isPending: boolean;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onUseAlternativePort: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const isRunning = status?.state === 'running';
  const endpoint = copyableEndpoint(rule);

  const dotClassName = (() => {
    if (isRunning) return 'bg-emerald-400';
    if (status?.state === 'error') return 'bg-red-400';
    return 'bg-zinc-600';
  })();

  const detail = (() => {
    if (isPending) return isRunning ? 'Stopping…' : 'Starting…';
    if (isRunning) {
      const active = status?.activeConnections ?? 0;
      return `${forwardRuleSummary(rule)} · ${active} active`;
    }
    if (status?.state === 'error' && status.message) return status.message;
    return forwardRuleSummary(rule);
  })();

  const onCopyEndpoint = async () => {
    if (!endpoint) return;
    try {
      await navigator.clipboard.writeText(endpoint);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // 클립보드 접근 실패 시 조용히 무시 — 버튼 피드백만 생략된다.
    }
  };

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-200">
            <span className="truncate">{describePortForwardRule(rule)}</span>
            <span className="shrink-0 rounded bg-zinc-700/60 px-1 py-px text-[10px] uppercase tracking-wide text-zinc-400">
              {FORWARD_KIND_LABEL[rule.kind]}
            </span>
          </p>
          <p
            className={`truncate text-[11px] ${
              status?.state === 'error' && !isRunning ? 'text-red-400' : 'text-zinc-500'
            }`}
            title={detail}
          >
            {detail}
          </p>
        </div>

        {isRunning && endpoint && (
          <button
            type="button"
            onClick={() => void onCopyEndpoint()}
            className="flex shrink-0 items-center gap-1 rounded bg-zinc-800 px-2 py-1 font-mono text-[11px] text-emerald-300 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label={`Copy ${endpoint}`}
            title="Copy for your DB client / proxy settings"
            tabIndex={0}
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-emerald-400" aria-hidden />
            ) : (
              <ClipboardCopy className="h-3 w-3" aria-hidden />
            )}
            {endpoint}
          </button>
        )}

        <button
          type="button"
          onClick={isRunning ? onStop : onStart}
          disabled={isPending}
          className={`shrink-0 rounded p-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
            isRunning
              ? 'text-red-400 hover:bg-zinc-700 hover:text-red-300'
              : 'text-emerald-400 hover:bg-zinc-700 hover:text-emerald-300'
          }`}
          aria-label={`${isRunning ? 'Stop' : 'Start'} ${describePortForwardRule(rule)}`}
          title={isRunning ? 'Stop' : 'Start'}
          tabIndex={0}
        >
          {isRunning ? (
            <Square className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={isRunning}
          className="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={`Edit ${describePortForwardRule(rule)}`}
          title={isRunning ? 'Stop the forward before editing' : 'Edit'}
          tabIndex={0}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={`Delete ${describePortForwardRule(rule)}`}
          title="Delete"
          tabIndex={0}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {isPortConflict(status) && !isPending && (
        <button
          type="button"
          onClick={onUseAlternativePort}
          className="mt-1.5 ml-4 rounded bg-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          tabIndex={0}
        >
          Use port {suggestAlternativePort(rule.localPort)} instead
        </button>
      )}
    </div>
  );
}

function ActivityLog({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  return (
    <div className="overflow-hidden rounded border border-zinc-700 bg-zinc-950/80">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Activity
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 focus:outline-none"
          aria-label="Clear port forward activity log"
          tabIndex={0}
        >
          Clear
        </button>
      </div>
      <div className="max-h-32 space-y-px overflow-y-auto p-2 font-mono text-[11px] leading-5 text-zinc-400">
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
