import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { BastionConfig, TargetServerConfig } from '../types';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { buildConnectionPayload, type ConnectionPayload } from '../utils/buildServerPayload';
import { recoverFromKeyError } from '../utils/recoverFromKeyError';

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

type EstablishConnectionPayload = ConnectionPayload;

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
        payload = buildConnectionPayload(target, useBastion, bastion, resolveKeyPath);
        return await runEstablish(payload);
      } catch (err) {
        const errorMsg = getConnectionErrorMessage(err);

        // 키 파일이 없거나(예: MobaXterm에서 가져온 Windows 경로) 퍼미션이
        // 너무 열려 있으면 고칠 기회를 준 뒤 한 번만 재시도한다.
        if (payload) {
          const recovery = await recoverFromKeyError(payload, errorMsg);
          if (recovery) return retryEstablish(payload, recovery.note);
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
        const payload = buildConnectionPayload(target, useBastion, bastion, resolveKeyPath);
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

        // 연결과 같은 복구 경로: 키 경로/퍼미션을 고칠 기회를 준 뒤 한 번만 재시도.
        if (!result.ok) {
          const recovery = await recoverFromKeyError(payload, result.stderr);
          if (recovery) {
            setConnectionLog((prev) => [...prev, recovery.note]);
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
