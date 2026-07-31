import { invoke } from '@tauri-apps/api/core';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { useMissingKeyModalStore } from '../../../stores/missingKeyModalStore';

/**
 * 키 파일을 열지 못했을 때의 에러 패턴.
 * libssh2: "[Session(-16)] Unable to extract public key from private key file:
 *          Unable to open private key file"
 * OpenSSH: "Warning: Identity file ... not accessible: No such file or directory."
 */
const KEY_FILE_ERROR_PATTERN =
  /Unable to open private key file|Unable to extract public key|not accessible|No such file or directory/i;

export const isKeyFileError = (message: string): boolean =>
  KEY_FILE_ERROR_PATTERN.test(message);

interface ServerKeyRef {
  privateKeyId?: string;
  privateKeyPath?: string;
}

/**
 * 연결에 쓰인 키 경로 중 이 컴퓨터에 없는 파일을 찾아, 모달로 새 경로를
 * 지정받는다. (예: MobaXterm에서 가져온 세션의 Windows 경로)
 * - 새 경로는 Key Manager(storageKey)와 payload 양쪽에 반영된다.
 * - 하나라도 교체되면 true(재시도 가치 있음), 사용자가 취소하면 false.
 */
export const resolveMissingKeyFiles = async (servers: ServerKeyRef[]): Promise<boolean> => {
  let replacedAny = false;

  for (const server of servers) {
    const oldPath = server.privateKeyPath;
    if (!oldPath) continue;

    const exists = await invoke<boolean>('key_file_exists', { path: oldPath });
    if (exists) continue;

    const { registeredKeys, updateKeyPath } = useKeyManagerStore.getState();
    const registeredKey = server.privateKeyId
      ? registeredKeys.find((k) => k.id === server.privateKeyId)
      : registeredKeys.find((k) => k.storageKey === oldPath);
    const keyLabel = registeredKey?.label ?? (oldPath.split(/[\\/]/).pop() ?? oldPath);

    const newPath = await useMissingKeyModalStore
      .getState()
      .openMissingKeyModal({ keyLabel, oldPath });
    if (!newPath) return false;

    if (registeredKey) updateKeyPath(registeredKey.id, newPath);
    // 같은 키를 쓰는 다른 서버(예: bastion과 target이 동일 키)도 함께 갱신한다.
    for (const other of servers) {
      if (other.privateKeyPath === oldPath) other.privateKeyPath = newPath;
    }
    replacedAny = true;
  }

  return replacedAny;
};
