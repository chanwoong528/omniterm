import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePortForwardStore } from '../../../stores/portForwardStore';
import type { PortForwardStatus } from '../types';

export const PORT_FORWARD_STATUS_EVENT = 'port-forward-status';

/**
 * 백엔드 포워딩 상태를 스토어에 반영한다. 세션 목록의 배지는 모달이 닫혀 있어도
 * 살아 있어야 하므로 앱 루트에서 한 번만 마운트한다.
 */
export function usePortForwardStatusSync() {
  const setStatus = usePortForwardStore((s) => s.setStatus);
  const replaceAll = usePortForwardStore((s) => s.replaceAll);

  useEffect(() => {
    // 웹뷰가 리로드돼도 백엔드 스레드는 살아 있다 — 이벤트만 기다리면 이미
    // 실행 중인 포워딩을 놓치므로 현재 스냅샷을 먼저 가져온다.
    void invoke<PortForwardStatus[]>('list_port_forwards')
      .then(replaceAll)
      .catch(() => {
        // 백엔드가 아직 준비되지 않았을 뿐이므로 조용히 무시한다.
      });

    const unlistenPromise = listen<PortForwardStatus>(PORT_FORWARD_STATUS_EVENT, (event) => {
      setStatus(event.payload);
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setStatus, replaceAll]);
}
