import { create } from 'zustand';
import type { PortForwardStatus } from '../types/port-forward';

/**
 * 포워딩 규칙의 실행 상태. 규칙 자체는 sessionStore(SavedSession.portForwards)에
 * 영속화되고, 여기에는 백엔드가 알려주는 런타임 상태만 담는다 — 앱을 껐다 켜면
 * 실행 중인 포워딩은 없으므로 영속화할 이유가 없다.
 */
interface PortForwardState {
  /** ruleId → 상태 */
  statusByRuleId: Record<string, PortForwardStatus>;
  /** 규칙별 진행 중 여부 (start/stop 요청이 왕복하는 동안 버튼을 잠근다). */
  pendingRuleIds: string[];
  setStatus: (status: PortForwardStatus) => void;
  replaceAll: (statuses: PortForwardStatus[]) => void;
  clearStatus: (ruleId: string) => void;
  setPending: (ruleId: string, isPending: boolean) => void;
}

export const usePortForwardStore = create<PortForwardState>()((set) => ({
  statusByRuleId: {},
  pendingRuleIds: [],
  setStatus: (status) =>
    set((state) => ({
      statusByRuleId: { ...state.statusByRuleId, [status.ruleId]: status },
    })),
  replaceAll: (statuses) =>
    set((state) => {
      // 'stopped'/'error'는 백엔드 목록에 남지 않으므로, 사용자가 아직 보고 있는
      // 마지막 실패 메시지는 유지하고 'running'만 서버 스냅샷으로 교체한다.
      const next: Record<string, PortForwardStatus> = {};
      for (const [ruleId, status] of Object.entries(state.statusByRuleId)) {
        if (status.state !== 'running') next[ruleId] = status;
      }
      for (const status of statuses) {
        next[status.ruleId] = status;
      }
      return { statusByRuleId: next };
    }),
  clearStatus: (ruleId) =>
    set((state) => {
      const next = { ...state.statusByRuleId };
      delete next[ruleId];
      return { statusByRuleId: next };
    }),
  setPending: (ruleId, isPending) =>
    set((state) => ({
      pendingRuleIds: isPending
        ? [...new Set([...state.pendingRuleIds, ruleId])]
        : state.pendingRuleIds.filter((id) => id !== ruleId),
    })),
}));
