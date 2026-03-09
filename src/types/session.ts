/** SSH 인증 방식 */
export type AuthMethod = 'password' | 'private_key' | 'agent';

/** Bastion(Jump Host) 서버 설정 */
export interface BastionConfig {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKeyId?: string;
}

/** 대상 서버 연결 설정 */
export interface TargetServerConfig {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKeyId?: string;
}

/** 저장된 SSH 세션 (메타데이터) */
export interface SavedSession {
  id: string;
  label: string;
  target: TargetServerConfig;
  useBastion: boolean;
  bastion?: BastionConfig;
  /** When true, reuse the bastion auth settings for the target (ProxyJump-like). */
  reuseBastionAuth?: boolean;
  lastConnectedAt?: string;
}
