/** 포워딩 종류. OpenSSH의 -L / -R / -D에 각각 대응한다. */
export type ForwardKind = 'local' | 'remote' | 'dynamic';

/**
 * 포워딩 규칙. SavedSession에 함께 저장된다.
 *
 * 주소 필드는 종류마다 의미가 다르다 — 세 종류가 한 모양을 공유하기 때문이다:
 *
 * |             | local              | remote                  | dynamic     |
 * |-------------|--------------------|-------------------------|-------------|
 * | localHost   | 내가 바인드할 주소 | 내 쪽에서 접속할 호스트 | 바인드 주소 |
 * | localPort   | 내가 여는 포트     | 내 쪽에서 접속할 포트   | SOCKS 포트  |
 * | remoteHost  | 목적지 호스트      | 서버가 바인드할 주소    | 사용 안 함  |
 * | remotePort  | 목적지 포트        | 서버가 여는 포트        | 사용 안 함  |
 */
export interface PortForwardRule {
  id: string;
  kind: ForwardKind;
  /** 목록 표시용 이름. 없으면 포워딩 경로를 그대로 이름으로 쓴다. */
  label?: string;
  /** 기본 127.0.0.1 — 0.0.0.0은 LAN 전체에 노출되므로 명시적 선택. */
  localHost: string;
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  /** 세션에 연결할 때 이 규칙을 자동으로 시작한다. */
  autoStart?: boolean;
}

export type PortForwardState = 'running' | 'stopped' | 'error';

/** 백엔드가 알려주는 규칙의 실행 상태 (영속화하지 않음). */
export interface PortForwardStatus {
  ruleId: string;
  savedSessionId: string;
  kind: ForwardKind;
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

export const FORWARD_KIND_LABEL: Record<ForwardKind, string> = {
  local: 'Local',
  remote: 'Remote',
  dynamic: 'Dynamic',
};

/** 종류별 한 줄 설명. UI에서 선택지 밑에 붙인다. */
export const FORWARD_KIND_HINT: Record<ForwardKind, string> = {
  local: 'Reach a remote service as if it ran on this machine. (ssh -L)',
  remote: 'Let the server reach a service running on this machine. (ssh -R)',
  dynamic: 'A SOCKS5 proxy on this machine that routes through the server. (ssh -D)',
};

function bindLabel(host: string): string {
  return host === ALL_INTERFACES_BIND_HOST ? ALL_INTERFACES_BIND_HOST : 'localhost';
}

/** 규칙이 실제로 무엇을 하는지 한 줄로. 라벨과 무관하게 항상 경로를 보여준다. */
export function forwardRuleSummary(rule: PortForwardRule): string {
  switch (rule.kind) {
    case 'local':
      return `${bindLabel(rule.localHost)}:${rule.localPort} → ${rule.remoteHost}:${rule.remotePort}`;
    case 'remote':
      return `server:${rule.remotePort || '(auto)'} → ${rule.localHost}:${rule.localPort}`;
    case 'dynamic':
      return `SOCKS5 on ${bindLabel(rule.localHost)}:${rule.localPort}`;
  }
}

/** 규칙 표시 이름: 라벨이 없으면 목적지(또는 경로)를 이름으로 쓴다. */
export function describePortForwardRule(rule: PortForwardRule): string {
  const label = rule.label?.trim();
  if (label) return label;
  if (rule.kind === 'local') return `${rule.remoteHost}:${rule.remotePort}`;
  return forwardRuleSummary(rule);
}

/**
 * DB 툴이나 브라우저 프록시 설정에 그대로 붙여넣을 주소.
 * remote 포워딩은 서버 쪽에서 접속하는 것이라 내 컴퓨터에 붙여넣을 주소가 없다.
 */
export function copyableEndpoint(rule: PortForwardRule): string | null {
  if (rule.kind === 'remote') return null;
  return `${bindLabel(rule.localHost)}:${rule.localPort}`;
}
