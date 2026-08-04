import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { usePortForwardStore } from '../../../stores/portForwardStore';
import { buildConnectionPayload } from '../../session/utils/buildServerPayload';
import {
  resolveSessionConnection,
  type SessionPasswords,
} from '../../session/utils/resolveSessionConnection';
import { recoverFromKeyError } from '../../session/utils/recoverFromKeyError';
import type { SavedSession } from '../../session/types';
import type { PortForwardRule, PortForwardStatus } from '../types';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Failed to start port forward';
}

/** 규칙 시작에 실패했을 때 배지·목록이 보여줄 에러 상태를 만든다. */
function toErrorStatus(
  session: SavedSession,
  rule: PortForwardRule,
  message: string
): PortForwardStatus {
  return {
    ruleId: rule.id,
    savedSessionId: session.id,
    state: 'error',
    localHost: rule.localHost,
    localPort: rule.localPort,
    remoteHost: rule.remoteHost,
    remotePort: rule.remotePort,
    activeConnections: 0,
    totalConnections: 0,
    message,
  };
}

/**
 * 포워딩 규칙의 시작/중지. 포워딩은 터미널 탭과 수명이 분리되어 있어서
 * 연결된 터미널이 없어도 시작할 수 있고, 탭을 닫아도 계속 살아 있다.
 */
export function usePortForward() {
  const registeredKeys = useKeyManagerStore((s) => s.registeredKeys);
  const setStatus = usePortForwardStore((s) => s.setStatus);
  const setPending = usePortForwardStore((s) => s.setPending);

  const resolveKeyPath = useCallback(
    (keyId: string) => registeredKeys.find((k) => k.id === keyId)?.storageKey,
    [registeredKeys]
  );

  const startRule = useCallback(
    async (
      session: SavedSession,
      rule: PortForwardRule,
      passwords: SessionPasswords = {}
    ): Promise<boolean> => {
      setPending(rule.id, true);
      try {
        const { target, useBastion, bastion } = resolveSessionConnection(session, passwords);
        const payload = {
          savedSessionId: session.id,
          rule: {
            id: rule.id,
            localHost: rule.localHost,
            localPort: rule.localPort,
            remoteHost: rule.remoteHost,
            remotePort: rule.remotePort,
          },
          connection: buildConnectionPayload(target, useBastion, bastion, resolveKeyPath),
        };
        const runStart = () => invoke<PortForwardStatus>('start_port_forward', { payload });

        try {
          setStatus(await runStart());
          return true;
        } catch (err) {
          // 터미널 연결과 같은 복구 경로 — 키 경로/퍼미션을 고칠 기회를 주고
          // 한 번만 재시도한다. recoverFromKeyError가 payload의 키 경로를
          // 제자리에서 갱신하므로 같은 payload로 그대로 재시도한다.
          const message = getErrorMessage(err);
          const recovery = await recoverFromKeyError(payload.connection, message);
          if (!recovery) {
            setStatus(toErrorStatus(session, rule, message));
            return false;
          }
          setStatus(await runStart());
          return true;
        }
      } catch (err) {
        setStatus(toErrorStatus(session, rule, getErrorMessage(err)));
        return false;
      } finally {
        setPending(rule.id, false);
      }
    },
    [resolveKeyPath, setStatus, setPending]
  );

  const stopRule = useCallback(
    async (ruleId: string): Promise<void> => {
      setPending(ruleId, true);
      try {
        await invoke('stop_port_forward', { ruleId });
      } finally {
        setPending(ruleId, false);
      }
    },
    [setPending]
  );

  const stopAllForSession = useCallback(async (savedSessionId: string): Promise<void> => {
    await invoke('stop_port_forwards_for_session', { savedSessionId });
  }, []);

  return { startRule, stopRule, stopAllForSession };
}
