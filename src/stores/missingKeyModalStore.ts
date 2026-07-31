import { create } from 'zustand';

export interface MissingKeyRequest {
  /** Key Manager에 등록된 키 라벨 (없으면 파일명) */
  keyLabel: string;
  /** 존재하지 않는 기존 경로 */
  oldPath: string;
}

interface MissingKeyModalState {
  request: MissingKeyRequest | null;
  resolver: ((newPath: string | null) => void) | null;
  /**
   * 모달을 열고 사용자의 선택을 기다린다.
   * 새 키 경로를 resolve하고, 취소하면 null을 resolve한다.
   */
  openMissingKeyModal: (request: MissingKeyRequest) => Promise<string | null>;
  submitNewPath: (newPath: string) => void;
  cancelModal: () => void;
}

export const useMissingKeyModalStore = create<MissingKeyModalState>((set, get) => ({
  request: null,
  resolver: null,
  openMissingKeyModal: (request) =>
    new Promise<string | null>((resolve) => {
      // 이미 열려 있으면 이전 요청은 취소 처리한다 (동시에 하나만).
      get().resolver?.(null);
      set({ request, resolver: resolve });
    }),
  submitNewPath: (newPath) => {
    get().resolver?.(newPath);
    set({ request: null, resolver: null });
  },
  cancelModal: () => {
    get().resolver?.(null);
    set({ request: null, resolver: null });
  },
}));
