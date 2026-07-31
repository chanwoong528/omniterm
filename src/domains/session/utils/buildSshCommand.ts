import type { SavedSession } from '../types';

/**
 * 복사되는 명령어는 "지금 이 컴퓨터의 셸"에서 붙여넣어 실행하는 용도이므로,
 * 실행 시점의 OS를 감지해 따옴표 규칙을 맞춘다.
 * - posix(macOS/Linux, bash/zsh): ProxyCommand 내부 경로는 \" 이스케이프
 * - win32(PowerShell): 백슬래시 이스케이프가 없으므로, 내부에 큰따옴표가
 *   필요하면 바깥을 작은따옴표로 감싼다 (PowerShell은 '...'를 리터럴로 전달)
 */
type ShellPlatform = 'posix' | 'win32';

const detectShellPlatform = (): ShellPlatform =>
  navigator.userAgent.includes('Windows') ? 'win32' : 'posix';

const needsQuoting = (value: string): boolean => /\s/.test(value);

const quoteForShell = (value: string): string => (needsQuoting(value) ? `"${value}"` : value);

const DEFAULT_SSH_PORT = 22;

/**
 * 저장된 세션을 동등한 ssh CLI 명령어로 변환한다. (클립보드 복사용)
 * 앱의 "SSH 명령어로 채우기"가 읽는 형식과 같아 다시 붙여넣어도 인식된다.
 * 예: ssh -i key.pem -o ProxyCommand="ssh -i key.pem -W %h:%p user@bastion" user@target
 */
export function buildSshCommand(
  session: SavedSession,
  resolveKeyPath: (keyId: string) => string | undefined,
  platform: ShellPlatform = detectShellPlatform()
): string {
  const { target } = session;
  const bastion = session.useBastion ? session.bastion : undefined;

  const bastionKeyPath = bastion?.privateKeyId ? resolveKeyPath(bastion.privateKeyId) : undefined;
  const targetKeyPath =
    bastion && session.reuseBastionAuth
      ? bastionKeyPath
      : target.privateKeyId
        ? resolveKeyPath(target.privateKeyId)
        : undefined;

  const parts: string[] = ['ssh'];
  if (targetKeyPath) parts.push('-i', quoteForShell(targetKeyPath));
  if (target.port !== DEFAULT_SSH_PORT) parts.push('-p', String(target.port));

  if (bastion) {
    const innerKeyNeedsQuoting = Boolean(bastionKeyPath && needsQuoting(bastionKeyPath));

    const proxyParts: string[] = ['ssh'];
    if (bastionKeyPath) {
      const quotedInnerKey = innerKeyNeedsQuoting
        ? platform === 'win32'
          ? `"${bastionKeyPath}"`
          : `\\"${bastionKeyPath}\\"`
        : bastionKeyPath;
      proxyParts.push('-i', quotedInnerKey);
    }
    proxyParts.push('-W', '%h:%p');
    if (bastion.port !== DEFAULT_SSH_PORT) proxyParts.push('-p', String(bastion.port));
    proxyParts.push(bastion.username ? `${bastion.username}@${bastion.host}` : bastion.host);

    const proxyCommand = proxyParts.join(' ');
    const quotedProxyCommand =
      platform === 'win32' && innerKeyNeedsQuoting
        ? `'${proxyCommand}'`
        : `"${proxyCommand}"`;
    parts.push('-o', `ProxyCommand=${quotedProxyCommand}`);
  }

  parts.push(target.username ? `${target.username}@${target.host}` : target.host);
  return parts.join(' ');
}
