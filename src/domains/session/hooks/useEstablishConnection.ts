import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { BastionConfig, TargetServerConfig } from '../types';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { askAndFixKeyPermissions, isKeyPermissionError } from '../utils/keyPermissionFix';
import { isKeyFileError, resolveMissingKeyFiles } from '../utils/missingKeyFix';

function getConnectionErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    const keys = Object.keys(obj);
    if (keys.length === 1 && typeof obj[keys[0]] === 'string') return obj[keys[0]] as string;
    const str = JSON.stringify(err);
    if (str !== '{}') return str;
  }
  return 'Connection failed';
}

interface EstablishConnectionPayload {
  target: {
    host: string;
    port: number;
    username: string;
    authMethod: string;
    password?: string;
    privateKeyId?: string;
    privateKeyPath?: string;
  };
  useBastion: boolean;
  bastion?: {
    host: string;
    port: number;
    username: string;
    authMethod: string;
    password?: string;
    privateKeyId?: string;
    privateKeyPath?: string;
  };
}

function buildServerPayload(
  config: TargetServerConfig | BastionConfig,
  resolveKeyPath: (id: string) => string | undefined
): EstablishConnectionPayload['target'] {
  const authMethod =
    config.authMethod === 'private_key'
      ? 'privateKey'
      : 'password';
  const payload: EstablishConnectionPayload['target'] = {
    host: config.host,
    port: config.port,
    username: config.username,
    authMethod,
  };
  if (config.authMethod === 'password') {
    payload.password = config.password;
  } else if (config.authMethod === 'private_key' && config.privateKeyId) {
    const resolvedPath = resolveKeyPath(config.privateKeyId);
    if (!resolvedPath) {
      throw new Error(
        'Selected key not found in Key Manager. Re-add the key or choose another.'
      );
    }
    payload.privateKeyId = config.privateKeyId;
    payload.privateKeyPath = resolvedPath;
  }
  return payload;
}

export function useEstablishConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const { registeredKeys } = useKeyManagerStore();
  const connectRequestIdRef = useRef<number | null>(null);
  const abortedRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<string>('ssh-connection-progress', (event) => {
      setConnectionLog((prev) => [...prev, event.payload]);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const resolveKeyPath = useCallback(
    (keyId: string): string | undefined => {
      return registeredKeys.find((k) => k.id === keyId)?.storageKey;
    },
    [registeredKeys]
  );

  const clearLog = useCallback(() => {
    setConnectionLog([]);
  }, []);

  const establishConnection = useCallback(
    async (
      target: TargetServerConfig,
      useBastion: boolean,
      bastion?: BastionConfig
    ): Promise<string | null> => {
      const requestId = Date.now();
      connectRequestIdRef.current = requestId;
      abortedRequestIdRef.current = null;
      setIsConnecting(true);
      setConnectionError(null);
      setConnectionLog([]);
      let payload: EstablishConnectionPayload | null = null;

      const runEstablish = async (p: EstablishConnectionPayload): Promise<string | null> => {
        const sessionId = await invoke<string>('establish_ssh_connection', { payload: p });
        if (abortedRequestIdRef.current === requestId) {
          // The backend kept connecting after the user aborted; close the
          // now-orphaned session instead of leaking it with no UI handle.
          void invoke('close_ssh_session', { sessionId }).catch(() => {});
          return null;
        }
        return sessionId;
      };

      const retryEstablish = async (
        p: EstablishConnectionPayload,
        retryLogLine: string
      ): Promise<string | null> => {
        setConnectionLog((prev) => [...prev, retryLogLine]);
        try {
          return await runEstablish(p);
        } catch (retryErr) {
          const retryErrorMsg = getConnectionErrorMessage(retryErr);
          setConnectionError(retryErrorMsg);
          setConnectionLog((prev) => [...prev, `ERROR: ${retryErrorMsg}`]);
          return null;
        }
      };

      try {
        const targetPayload = buildServerPayload(target, resolveKeyPath);
        payload = {
          target: targetPayload,
          useBastion,
          bastion: useBastion && bastion
            ? buildServerPayload(bastion, resolveKeyPath)
            : undefined,
        };
        return await runEstablish(payload);
      } catch (err) {
        const errorMsg = getConnectionErrorMessage(err);

        // 키 파일이 존재하지 않으면(예: MobaXterm에서 가져온 Windows 경로)
        // 모달로 새 경로를 지정받고 한 번만 재시도한다.
        if (payload && isKeyFileError(errorMsg)) {
          const resolved = await resolveMissingKeyFiles(
            [payload.target, payload.bastion].filter(Boolean) as EstablishConnectionPayload['target'][]
          );
          if (resolved) {
            return retryEstablish(payload, 'Key path updated. Retrying connection...');
          }
        }

        // 키 퍼미션 문제라면 사용자에게 chmod 600 적용 여부를 물어보고,
        // 동의 시 고친 뒤 한 번만 재시도한다.
        if (payload && isKeyPermissionError(errorMsg)) {
          const shouldRetry = await askAndFixKeyPermissions(errorMsg, [
            payload.target.privateKeyPath,
            payload.bastion?.privateKeyPath,
          ]);
          if (shouldRetry) {
            return retryEstablish(
              payload,
              'Key permissions fixed (chmod 600). Retrying connection...'
            );
          }
        }

        setConnectionError(errorMsg);
        setConnectionLog((prev) => [...prev, `ERROR: ${errorMsg}`]);
        return null;
      } finally {
        if (connectRequestIdRef.current === requestId) {
          setIsConnecting(false);
          connectRequestIdRef.current = null;
        }
      }
    },
    [resolveKeyPath]
  );

  const [isTesting, setIsTesting] = useState(false);

  const testConnection = useCallback(
    async (
      target: TargetServerConfig,
      useBastion: boolean,
      bastion?: BastionConfig
    ): Promise<{ ok: boolean; stdout: string; stderr: string }> => {
      setIsTesting(true);
      setConnectionError(null);
      try {
        const targetPayload = buildServerPayload(target, resolveKeyPath);
        const payload: EstablishConnectionPayload = {
          target: targetPayload,
          useBastion,
          bastion: useBastion && bastion
            ? buildServerPayload(bastion, resolveKeyPath)
            : undefined,
        };
        const runTest = async () => {
          const result = await invoke<{ ok: boolean; stdout: string; stderr: string }>(
            'test_ssh_connection',
            { payload }
          );
          setConnectionLog((prev) => [
            ...prev,
            '── Test connection (system ssh) ──',
            result.stdout.trim() || '(no stdout)',
            result.stderr.trim() || '(no stderr)',
            result.ok ? 'OK: Connection test passed.' : 'FAILED: Connection test failed.',
          ]);
          return result;
        };

        let result = await runTest();

        // 키 파일이 존재하지 않으면 모달로 새 경로를 지정받고 한 번만 재시도한다.
        if (!result.ok && isKeyFileError(result.stderr)) {
          const resolved = await resolveMissingKeyFiles(
            [payload.target, payload.bastion].filter(Boolean) as EstablishConnectionPayload['target'][]
          );
          if (resolved) {
            setConnectionLog((prev) => [...prev, 'Key path updated. Retrying test...']);
            result = await runTest();
          }
        }

        // 키 퍼미션 문제라면 사용자에게 chmod 600 적용 여부를 물어보고,
        // 동의 시 고친 뒤 한 번만 재시도한다.
        if (!result.ok && isKeyPermissionError(result.stderr)) {
          const shouldRetry = await askAndFixKeyPermissions(result.stderr, [
            payload.target.privateKeyPath,
            payload.bastion?.privateKeyPath,
          ]);
          if (shouldRetry) {
            setConnectionLog((prev) => [
              ...prev,
              'Key permissions fixed (chmod 600). Retrying test...',
            ]);
            result = await runTest();
          }
        }

        if (!result.ok) {
          setConnectionError(result.stderr.trim() || result.stdout.trim() || 'Test failed.');
        }
        return result;
      } catch (err) {
        const errorMsg = getConnectionErrorMessage(err);
        setConnectionError(errorMsg);
        setConnectionLog((prev) => [
          ...prev,
          '── Test connection (system ssh) ──',
          `ERROR: ${errorMsg}`,
        ]);
        return { ok: false, stdout: '', stderr: errorMsg };
      } finally {
        setIsTesting(false);
      }
    },
    [resolveKeyPath]
  );

  const abortConnection = useCallback(() => {
    const currentRequestId = connectRequestIdRef.current;
    if (!currentRequestId) {
      return;
    }
    abortedRequestIdRef.current = currentRequestId;
    connectRequestIdRef.current = null;
    setIsConnecting(false);
    setConnectionError('Connection aborted by user.');
    setConnectionLog((prev) => [...prev, 'ERROR: Connection aborted by user.']);
  }, []);

  return {
    establishConnection,
    testConnection,
    isConnecting,
    isTesting,
    connectionError,
    connectionLog,
    clearLog,
    abortConnection,
  };
}
