import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { BastionConfig, TargetServerConfig } from '../types';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';

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
  } else if (config.authMethod === 'private_key') {
    payload.privateKeyId = config.privateKeyId;
    if (config.privateKeyId) {
      payload.privateKeyPath = resolveKeyPath(config.privateKeyId);
    }
  }
  return payload;
}

export function useEstablishConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const [lastConnectedSessionId, setLastConnectedSessionId] = useState<string | null>(null);
  const { registeredKeys } = useKeyManagerStore();

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
      setIsConnecting(true);
      setConnectionError(null);
      setConnectionLog([]);
      setLastConnectedSessionId(null);
      try {
        const targetPayload = buildServerPayload(target, resolveKeyPath);
        const payload: EstablishConnectionPayload = {
          target: targetPayload,
          useBastion,
          bastion: useBastion && bastion
            ? buildServerPayload(bastion, resolveKeyPath)
            : undefined,
        };
        const sessionId = await invoke<string>('establish_ssh_connection', { payload });
        setLastConnectedSessionId(sessionId);
        return sessionId;
      } catch (err) {
        const errorMsg = getConnectionErrorMessage(err);
        setConnectionError(errorMsg);
        setConnectionLog((prev) => [...prev, `ERROR: ${errorMsg}`]);
        return null;
      } finally {
        setIsConnecting(false);
      }
    },
    [resolveKeyPath]
  );

  return {
    establishConnection,
    isConnecting,
    connectionError,
    connectionLog,
    clearLog,
    lastConnectedSessionId,
  };
}
