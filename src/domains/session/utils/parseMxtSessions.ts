/**
 * MobaXterm .mxtsessions 파서.
 *
 * 파일 구조 (INI 유사):
 *   [Bookmarks]
 *   SubRep=폴더명
 *   ImgNum=41
 *   세션명=#109#0%host%port%username%...%bastionHost%bastionPort%bastionUser%...%keyPath%bastionKeyPath%...
 *
 * 값은 '#'로 큰 구획이 나뉘고(두 번째 구획 "109"가 SSH 세션 타입),
 * 세 번째 구획이 '%'로 구분된 SSH 설정 필드다. 관찰된 필드 인덱스:
 *   [1] host  [2] port  [3] username
 *   [8] bastion host  [9] bastion port  [10] bastion username
 *   [14] private key path  [15] bastion private key path
 */

const MOBAXTERM_SSH_SESSION_TYPE = '109';

const TARGET_HOST_INDEX = 1;
const TARGET_PORT_INDEX = 2;
const TARGET_USERNAME_INDEX = 3;
const BASTION_HOST_INDEX = 8;
const BASTION_PORT_INDEX = 9;
const BASTION_USERNAME_INDEX = 10;
const TARGET_KEY_PATH_INDEX = 14;
const BASTION_KEY_PATH_INDEX = 15;

const DEFAULT_SSH_PORT = 22;

export interface ParsedMxtServer {
  host: string;
  port: number;
  username: string;
}

export interface ParsedMxtSession {
  label: string;
  folder: string | null;
  target: ParsedMxtServer;
  bastion: ParsedMxtServer | null;
  targetKeyPath: string | null;
  bastionKeyPath: string | null;
}

export type ParseMxtSessionsResult =
  | { ok: true; sessions: ParsedMxtSession[]; skippedCount: number }
  | { ok: false; reason: string };

const parsePort = (raw: string | undefined): number => {
  const port = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return DEFAULT_SSH_PORT;
  return port;
};

const fieldAt = (fields: string[], index: number): string => (fields[index] ?? '').trim();

export function parseMxtSessions(content: string): ParseMxtSessionsResult {
  const sessions: ParsedMxtSession[] = [];
  let skippedCount = 0;
  let currentFolder: string | null = null;
  let sawBookmarksSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^\[.+\]$/.test(line)) {
      // 새 섹션 시작: 폴더는 섹션마다 SubRep로 다시 지정된다.
      sawBookmarksSection = sawBookmarksSection || /^\[Bookmarks/i.test(line);
      currentFolder = null;
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (name === 'SubRep') {
      currentFolder = value || null;
      continue;
    }
    if (name === 'ImgNum') continue;
    if (!value.startsWith('#')) continue;

    // "#109#0%host%port%..." → ['', '109', '0%host%port%...', ...]
    const segments = value.split('#');
    if (segments[1] !== MOBAXTERM_SSH_SESSION_TYPE) {
      // RDP/SFTP 등 SSH가 아닌 세션은 건너뛴다.
      skippedCount += 1;
      continue;
    }

    const fields = (segments[2] ?? '').split('%');
    const host = fieldAt(fields, TARGET_HOST_INDEX);
    if (!host) {
      skippedCount += 1;
      continue;
    }

    const bastionHost = fieldAt(fields, BASTION_HOST_INDEX);
    const targetKeyPath = fieldAt(fields, TARGET_KEY_PATH_INDEX) || null;
    const bastionKeyPath = fieldAt(fields, BASTION_KEY_PATH_INDEX) || null;

    sessions.push({
      label: name,
      folder: currentFolder,
      target: {
        host,
        port: parsePort(fields[TARGET_PORT_INDEX]),
        username: fieldAt(fields, TARGET_USERNAME_INDEX),
      },
      bastion: bastionHost
        ? {
            host: bastionHost,
            port: parsePort(fields[BASTION_PORT_INDEX]),
            username: fieldAt(fields, BASTION_USERNAME_INDEX),
          }
        : null,
      targetKeyPath,
      bastionKeyPath: bastionKeyPath ?? (bastionHost ? targetKeyPath : null),
    });
  }

  if (!sawBookmarksSection && sessions.length === 0) {
    return { ok: false, reason: 'Not a MobaXterm sessions file ([Bookmarks] section not found).' };
  }
  if (sessions.length === 0) {
    return { ok: false, reason: 'No SSH sessions found in this file.' };
  }
  return { ok: true, sessions, skippedCount };
}
