import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BastionConfig, TargetServerConfig } from '../types';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';

/** Rust SshConnectionError is serialized as { kind, message }. Tauri may pass that or wrap it. */
function getConnectionErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    // Single-variant shape e.g. { TargetConnectionFailed: "Connection refused..." }
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
      : config.authMethod === 'agent'
        ? 'agent'
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
  const [lastConnectedSessionId, setLastConnectedSessionId] = useState<string | null>(null);
  const { registeredKeys } = useKeyManagerStore();

  const resolveKeyPath = useCallback(
    (keyId: string): string | undefined => {
      return registeredKeys.find((k) => k.id === keyId)?.storageKey;
    },
    [registeredKeys]
  );

  const establishConnection = useCallback(
    async (
      target: TargetServerConfig,
      useBastion: boolean,
      bastion?: BastionConfig
    ): Promise<string | null> => {
      setIsConnecting(true);
      setConnectionError(null);
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
        setConnectionError(getConnectionErrorMessage(err));
        return null;
      } finally {
        setIsConnecting(false);
      }
    },
    [resolveKeyPath]
  );

  return { establishConnection, isConnecting, connectionError, lastConnectedSessionId };
}
