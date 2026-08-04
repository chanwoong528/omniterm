import { ArrowRightLeft } from 'lucide-react';
import { usePortForwardStore } from '../../../stores/portForwardStore';
import type { PortForwardRule } from '../types';

/**
 * 세션 목록 항목에 붙는 포워딩 표시. 버튼이 아니라 상태 표시이므로 클릭 대상이
 * 아니다 — 시작/중지는 포워딩 패널 안에서만 한다.
 */
export function PortForwardBadge({ rules }: { rules: PortForwardRule[] }) {
  const statusByRuleId = usePortForwardStore((s) => s.statusByRuleId);
  if (rules.length === 0) return null;

  const statuses = rules.map((rule) => statusByRuleId[rule.id]).filter(Boolean);
  const runningCount = statuses.filter((s) => s.state === 'running').length;
  const hasError = statuses.some((s) => s.state === 'error');

  const { className, text, label } = (() => {
    if (runningCount > 0) {
      return {
        className: 'bg-emerald-900/50 text-emerald-300',
        text: String(runningCount),
        label: `${runningCount} port forward(s) running`,
      };
    }
    if (hasError) {
      return {
        className: 'bg-red-900/50 text-red-300',
        text: '!',
        label: 'Port forward failed',
      };
    }
    return {
      className: 'bg-zinc-700/60 text-zinc-400',
      text: String(rules.length),
      label: `${rules.length} port forward rule(s), none running`,
    };
  })();

  return (
    <span
      className={`ml-2 inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium ${className}`}
      aria-label={label}
      title={label}
    >
      <ArrowRightLeft className="h-2.5 w-2.5" aria-hidden />
      {text}
    </span>
  );
}
