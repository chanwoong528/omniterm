/** 로컬 포트 포워딩 규칙 (`ssh -L`). SavedSession에 함께 저장된다. */
export interface PortForwardRule {
  id: string;
  /** 목록 표시용 이름. 비어 있으면 `localPort → remoteHost:remotePort`로 표시. */
  label?: string;
  /** 로컬 바인드 주소. 기본 127.0.0.1 — 0.0.0.0은 LAN 전체에 노출되므로 명시적 선택. */
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  /** 세션에 연결할 때 이 규칙을 자동으로 시작한다. */
  autoStart?: boolean;
}

export type PortForwardState = 'running' | 'stopped' | 'error';

/** 백엔드가 알려주는 규칙의 실행 상태 (영속화하지 않음). */
export interface PortForwardStatus {
  ruleId: string;
  savedSessionId: string;
  state: PortForwardState;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  activeConnections: number;
  totalConnections: number;
  message?: string | null;
}

export const DEFAULT_LOCAL_BIND_HOST = '127.0.0.1';
export const ALL_INTERFACES_BIND_HOST = '0.0.0.0';

/** 규칙 표시 이름: 라벨이 없으면 포워딩 경로 자체를 이름으로 쓴다. */
export function describePortForwardRule(rule: PortForwardRule): string {
  return rule.label?.trim() || `${rule.localPort} → ${rule.remoteHost}:${rule.remotePort}`;
}
