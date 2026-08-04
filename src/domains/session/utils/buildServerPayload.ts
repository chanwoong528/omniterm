import type { BastionConfig, TargetServerConfig } from '../types';

/** Rust `ServerConfigPayload`와 1:1로 대응하는 직렬화 형태. */
export interface ServerPayload {
  host: string;
  port: number;
  username: string;
  authMethod: string;
  password?: string;
  privateKeyId?: string;
  privateKeyPath?: string;
}

/** Rust `EstablishSshConnectionPayload`와 1:1로 대응하는 직렬화 형태. */
export interface ConnectionPayload {
  target: ServerPayload;
  useBastion: boolean;
  bastion?: ServerPayload;
}

/**
 * 세션 설정을 백엔드 페이로드로 변환한다. 키 매니저에 등록된 키 id는 이 시점에
 * 실제 파일 경로로 바뀌며, 경로를 찾지 못하면 연결 전에 실패한다.
 */
export function buildServerPayload(
  config: TargetServerConfig | BastionConfig,
  resolveKeyPath: (id: string) => string | undefined
): ServerPayload {
  const authMethod = config.authMethod === 'private_key' ? 'privateKey' : 'password';
  const payload: ServerPayload = {
    host: config.host,
    port: config.port,
    username: config.username,
    authMethod,
  };
  if (config.authMethod === 'password') {
    payload.password = config.password;
    return payload;
  }
  if (config.privateKeyId) {
    const resolvedPath = resolveKeyPath(config.privateKeyId);
    if (!resolvedPath) {
      throw new Error('Selected key not found in Key Manager. Re-add the key or choose another.');
    }
    payload.privateKeyId = config.privateKeyId;
    payload.privateKeyPath = resolvedPath;
  }
  return payload;
}

/** target + bastion을 한 번에 변환한다. */
export function buildConnectionPayload(
  target: TargetServerConfig,
  useBastion: boolean,
  bastion: BastionConfig | undefined,
  resolveKeyPath: (id: string) => string | undefined
): ConnectionPayload {
  return {
    target: buildServerPayload(target, resolveKeyPath),
    useBastion,
    bastion: useBastion && bastion ? buildServerPayload(bastion, resolveKeyPath) : undefined,
  };
}
