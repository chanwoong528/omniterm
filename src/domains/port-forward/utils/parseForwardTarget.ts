import { DEFAULT_LOCAL_BIND_HOST, type ForwardKind, type PortForwardRule } from '../types';

/**
 * 붙여넣은 엔드포인트에서 host와 port를 뽑아낸다.
 *
 * DB 콘솔에서 복사하는 값의 형태가 제각각이라 (RDS 엔드포인트, JDBC URL,
 * 커넥션 문자열) 하나만 받도록 강제하면 매번 손으로 다듬어야 한다.
 *
 * 받아들이는 형태:
 *   db.internal:5432
 *   db.internal 5432
 *   postgres://user:pw@db.internal:5432/mydb
 *   jdbc:postgresql://db.internal:5432/mydb
 *   redis://db.internal          (스킴의 기본 포트 사용)
 *   [::1]:5432
 */

/** 포트를 안 적었을 때 스킴으로 추론한다. */
const DEFAULT_PORT_BY_SCHEME: Record<string, number> = {
  postgres: 5432,
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  redis: 6379,
  rediss: 6379,
  mongodb: 27017,
  http: 80,
  https: 443,
  ssh: 22,
  ftp: 21,
};

const MIN_PORT = 1;
const MAX_PORT = 65535;
/** 로컬 포트가 이미 쓰일 때 비켜 주는 폭. 흔한 관습이라 기억하기 쉽다. */
const PORT_OFFSET = 10000;

export interface ForwardTarget {
  host: string;
  port: number;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

/** `jdbc:postgresql://`, `postgres://` 등의 스킴을 떼고 어떤 스킴이었는지 알려준다. */
function stripScheme(input: string): { rest: string; scheme: string | null } {
  const withoutJdbc = input.replace(/^jdbc:/i, '');
  const match = withoutJdbc.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i);
  if (!match) return { rest: withoutJdbc, scheme: null };
  return { rest: match[2], scheme: match[1].toLowerCase() };
}

export function parseForwardTarget(input: string): ForwardTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const { rest, scheme } = stripScheme(trimmed);
  // user:password@ 자격증명, /dbname 경로, ?query, 공백 뒤 잔여물을 떼어낸다.
  const authority = rest
    .replace(/^[^/@]*@/, '')
    .split(/[/?#]/)[0]
    .trim();
  if (!authority) return null;

  // 공백으로 host와 port를 나눠 적은 경우 (`db.internal 5432`)
  const spaceSeparated = authority.match(/^(\S+)\s+(\d+)$/);
  if (spaceSeparated) {
    const port = Number(spaceSeparated[2]);
    return isValidPort(port) ? { host: spaceSeparated[1], port } : null;
  }
  if (/\s/.test(authority)) return null;

  // IPv6는 대괄호로 감싸므로 그 안의 콜론을 포트 구분자로 착각하면 안 된다.
  const ipv6 = authority.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (ipv6) {
    const port = ipv6[2] ? Number(ipv6[2]) : scheme ? DEFAULT_PORT_BY_SCHEME[scheme] : undefined;
    if (port === undefined || !isValidPort(port)) return null;
    return { host: ipv6[1], port };
  }

  const lastColon = authority.lastIndexOf(':');
  if (lastColon === -1) {
    // 포트 없이 숫자만 적었으면 그건 포트다 (`3000`).
    if (/^\d+$/.test(authority)) {
      const port = Number(authority);
      return isValidPort(port) ? { host: 'localhost', port } : null;
    }
    const port = scheme ? DEFAULT_PORT_BY_SCHEME[scheme] : undefined;
    if (port === undefined) return null;
    return { host: authority, port };
  }

  const host = authority.slice(0, lastColon);
  const port = Number(authority.slice(lastColon + 1));
  if (!host || !isValidPort(port)) return null;
  return { host, port };
}

/**
 * 이 세션 안에서 아직 쓰이지 않은 로컬 포트를 고른다.
 * 원격 포트와 같은 번호(1:1)를 우선하고, 이미 다른 규칙이 쓰고 있으면
 * 10000을 더해 비켜 준다.
 */
export function pickLocalPort(preferred: number, usedPorts: number[]): number {
  const used = new Set(usedPorts);
  let candidate = preferred;
  while (used.has(candidate) && candidate <= MAX_PORT) {
    candidate = candidate > MAX_PORT - PORT_OFFSET ? candidate + 1 : candidate + PORT_OFFSET;
  }
  return candidate <= MAX_PORT ? candidate : preferred;
}

/** 로컬 포트가 점유됐을 때 제안할 대안 포트. */
export function suggestAlternativePort(port: number): number {
  return port <= MAX_PORT - PORT_OFFSET ? port + PORT_OFFSET : port - PORT_OFFSET;
}

/** 한 줄 입력으로 만들 규칙의 주소 부분. id/label은 호출 측이 붙인다. */
export type QuickAddDraft = Omit<PortForwardRule, 'id' | 'label' | 'autoStart'>;

/**
 * 한 줄 입력을 규칙으로 바꾼다. 입력 한 칸의 의미는 종류마다 다르다:
 * - local:   접속하고 싶은 원격 엔드포인트. 로컬 포트는 같은 번호로 맞춘다.
 * - remote:  서버에 열어 줄 내 쪽 엔드포인트. 서버 포트도 같은 번호로 맞춘다.
 * - dynamic: SOCKS5 프록시를 열 로컬 포트 하나.
 */
export function parseQuickAddInput(
  kind: ForwardKind,
  input: string,
  usedLocalPorts: number[]
): QuickAddDraft | null {
  const target = parseForwardTarget(input);
  if (!target) return null;

  if (kind === 'dynamic') {
    return {
      kind,
      localHost: DEFAULT_LOCAL_BIND_HOST,
      localPort: target.port,
    };
  }

  if (kind === 'remote') {
    return {
      kind,
      // 서버가 받은 연결을 내 쪽 이 주소로 넘긴다.
      localHost: target.host,
      localPort: target.port,
      // 서버 바인드 주소는 비워 서버 정책(보통 loopback)을 따른다.
      remoteHost: '',
      remotePort: target.port,
    };
  }

  return {
    kind,
    localHost: DEFAULT_LOCAL_BIND_HOST,
    localPort: pickLocalPort(target.port, usedLocalPorts),
    remoteHost: target.host,
    remotePort: target.port,
  };
}

/** 종류별 입력창 placeholder. */
export const QUICK_ADD_PLACEHOLDER: Record<ForwardKind, string> = {
  local: 'Paste a remote endpoint — db.internal:5432',
  remote: 'A service on this machine — localhost:3000',
  dynamic: 'A local port for the SOCKS5 proxy — 1080',
};

/** 종류별 입력 도움말. */
export const QUICK_ADD_HINT: Record<ForwardKind, string> = {
  local: 'RDS endpoint, host:port, or a JDBC/connection URL. The local port matches the remote one.',
  remote: 'The server gets the same port number, so both sides match.',
  dynamic: 'Point a browser or tool at this SOCKS5 proxy to route its traffic through the server.',
};
