import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

/**
 * OpenSSH가 group/other 읽기 권한이 있는 키를 거부할 때 내는 에러 패턴.
 * 예: "UNPROTECTED PRIVATE KEY FILE", "Permissions 0644 for '...' are too open",
 *     'Load key "...": bad permissions'
 */
const KEY_PERMISSION_ERROR_PATTERN =
  /UNPROTECTED PRIVATE KEY FILE|bad permissions|are too open/i;

export const isKeyPermissionError = (message: string): boolean =>
  KEY_PERMISSION_ERROR_PATTERN.test(message);

/** ssh stderr에서 문제가 된 키 파일 경로를 추출한다. */
const extractKeyPathsFromError = (message: string): string[] => {
  const paths = new Set<string>();
  for (const match of message.matchAll(/Permissions \d+ for '([^']+)'/g)) {
    paths.add(match[1]);
  }
  for (const match of message.matchAll(/Load key "([^"]+)"/g)) {
    paths.add(match[1]);
  }
  return [...paths];
};

/**
 * 키 퍼미션 문제로 연결이 실패했을 때 사용자에게 수정 여부를 물어보고,
 * 동의하면 chmod 600을 적용한다. 재시도해야 하면 true를 반환한다.
 * 에러 메시지에서 경로를 못 찾으면 연결에 사용된 키 경로(fallback)를 쓴다.
 */
export const askAndFixKeyPermissions = async (
  errorMessage: string,
  fallbackKeyPaths: (string | undefined)[]
): Promise<boolean> => {
  const parsedPaths = extractKeyPathsFromError(errorMessage);
  const keyPaths = parsedPaths.length
    ? parsedPaths
    : fallbackKeyPaths.filter((path): path is string => Boolean(path));
  if (keyPaths.length === 0) return false;

  const confirmed = await ask(
    `SSH rejected your private key because its file permissions are too open:\n\n${keyPaths.join('\n')}\n\nFix permissions to owner-only (chmod 600) and retry the connection?`,
    {
      title: 'Unprotected Private Key',
      kind: 'warning',
      okLabel: 'Fix & Retry',
      cancelLabel: 'Cancel',
    }
  );
  if (!confirmed) return false;

  try {
    await Promise.all(
      keyPaths.map((path) => invoke<boolean>('secure_key_permissions', { path }))
    );
    return true;
  } catch (err) {
    console.warn('Failed to fix key permissions:', err);
    return false;
  }
};
