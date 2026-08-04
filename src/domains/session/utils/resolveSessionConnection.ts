import type { BastionConfig, SavedSession, TargetServerConfig } from '../types';

export interface SessionPasswords {
  targetPassword?: string;
  bastionPassword?: string;
}

export interface ResolvedSessionConnection {
  target: TargetServerConfig;
  useBastion: boolean;
  bastion?: BastionConfig;
}

/** ProxyJump처럼 bastion 인증 정보를 target에도 그대로 쓰는 설정인지. */
export function shouldReuseBastionAuth(session: SavedSession): boolean {
  return Boolean(session.useBastion && session.reuseBastionAuth && session.bastion);
}

export function needsTargetPassword(session: SavedSession): boolean {
  return !shouldReuseBastionAuth(session) && session.target.authMethod === 'password';
}

export function needsBastionPassword(session: SavedSession): boolean {
  return Boolean(session.useBastion && session.bastion?.authMethod === 'password');
}

/** 연결(또는 포워딩 시작) 전에 비밀번호를 물어봐야 하는 세션인지. */
export function needsPasswordPrompt(session: SavedSession): boolean {
  return needsTargetPassword(session) || needsBastionPassword(session);
}

/**
 * 저장된 세션 + 방금 입력받은 비밀번호를 실제 연결 설정으로 합친다.
 * 비밀번호는 저장하지 않으므로(SavedSession에는 없다) 연결 시점에만 주입된다.
 * 터미널 연결과 포트 포워딩이 같은 규칙을 쓰도록 한곳에 모아 둔다.
 */
export function resolveSessionConnection(
  session: SavedSession,
  { targetPassword, bastionPassword }: SessionPasswords
): ResolvedSessionConnection {
  const reuseBastionAuth = shouldReuseBastionAuth(session);

  const bastion: BastionConfig | undefined =
    session.useBastion && session.bastion
      ? session.bastion.authMethod === 'password'
        ? { ...session.bastion, password: bastionPassword }
        : { ...session.bastion }
      : undefined;

  const target: TargetServerConfig = (() => {
    if (reuseBastionAuth && bastion) {
      if (bastion.authMethod === 'password') {
        return { ...session.target, authMethod: 'password', password: bastion.password };
      }
      return { ...session.target, authMethod: 'private_key', privateKeyId: bastion.privateKeyId };
    }
    if (session.target.authMethod === 'password') {
      return { ...session.target, password: targetPassword };
    }
    return { ...session.target };
  })();

  return { target, useBastion: session.useBastion, bastion };
}
