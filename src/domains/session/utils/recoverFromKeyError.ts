import { askAndFixKeyPermissions, isKeyPermissionError } from './keyPermissionFix';
import { isKeyFileError, resolveMissingKeyFiles } from './missingKeyFix';
import type { ConnectionPayload, ServerPayload } from './buildServerPayload';

export interface KeyErrorRecovery {
  /** 재시도 사실을 로그에 남길 안내 문구. */
  note: string;
}

/**
 * 개인키 때문에 연결이 실패했을 때 사용자에게 물어 고치고, 재시도할 가치가
 * 있는지 알려준다. 재시도할 수 없으면 null.
 *
 * - 키 파일이 없으면(예: MobaXterm에서 가져온 Windows 경로) 모달로 새 경로를 받고
 *   Key Manager와 `payload`의 privateKeyPath를 **제자리에서** 갱신한다.
 *   따라서 호출 측은 같은 payload를 그대로 다시 invoke하면 된다.
 * - 퍼미션이 너무 열려 있으면 동의를 받아 chmod 600을 적용한다.
 *
 * 터미널 연결과 포트 포워딩 시작이 같은 복구 경험을 갖도록 한곳에 모아 둔다.
 */
export async function recoverFromKeyError(
  payload: ConnectionPayload,
  errorMessage: string
): Promise<KeyErrorRecovery | null> {
  const servers: ServerPayload[] = [payload.target, payload.bastion].filter(
    (server): server is ServerPayload => Boolean(server)
  );

  if (isKeyFileError(errorMessage)) {
    const resolved = await resolveMissingKeyFiles(servers);
    if (resolved) return { note: 'Key path updated. Retrying...' };
  }

  if (isKeyPermissionError(errorMessage)) {
    const shouldRetry = await askAndFixKeyPermissions(
      errorMessage,
      servers.map((server) => server.privateKeyPath)
    );
    if (shouldRetry) return { note: 'Key permissions fixed (chmod 600). Retrying...' };
  }

  return null;
}
