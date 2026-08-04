import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

export const PORT_FORWARD_PROGRESS_EVENT = 'port-forward-progress';

/** 화면에 남길 최대 줄 수 — 오래 켜 둔 포워딩이 메모리를 계속 먹지 않도록 자른다. */
const MAX_LOG_LINES = 200;

interface PortForwardProgress {
  ruleId: string;
  line: string;
}

/**
 * 지정한 규칙들의 진행 로그를 모은다 (바인드 실패, 백엔드 접속 거부 등).
 * 다른 세션의 포워딩 로그가 섞이지 않도록 규칙 id로 걸러낸다.
 */
export function usePortForwardLog(ruleIds: string[]) {
  const [lines, setLines] = useState<string[]>([]);
  // 배열은 렌더마다 새 참조라 의존성으로 쓸 수 없다 — 내용으로 비교한다.
  const ruleIdsKey = ruleIds.join('|');

  useEffect(() => {
    const allowedRuleIds = new Set(ruleIdsKey ? ruleIdsKey.split('|') : []);
    const unlistenPromise = listen<PortForwardProgress>(PORT_FORWARD_PROGRESS_EVENT, (event) => {
      if (!allowedRuleIds.has(event.payload.ruleId)) return;
      setLines((prev) => [...prev, event.payload.line].slice(-MAX_LOG_LINES));
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [ruleIdsKey]);

  const clearLines = useCallback(() => setLines([]), []);

  return { lines, clearLines };
}
