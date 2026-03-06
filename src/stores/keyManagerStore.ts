import { create } from 'zustand';
import type { RegisteredKeyMeta } from '../types/key-manager';

interface KeyManagerState {
  /** 등록된 키 목록 (메타데이터만, 평문 키는 Rust Store에만 보관) */
  registeredKeys: RegisteredKeyMeta[];
  setRegisteredKeys: (keys: RegisteredKeyMeta[]) => void;
  addKey: (key: RegisteredKeyMeta) => void;
  removeKey: (id: string) => void;
}

export const useKeyManagerStore = create<KeyManagerState>((set) => ({
  registeredKeys: [],
  setRegisteredKeys: (keys) => set({ registeredKeys: keys }),
  addKey: (key) =>
    set((state) => ({
      registeredKeys: [...state.registeredKeys, key],
    })),
  removeKey: (id) =>
    set((state) => ({
      registeredKeys: state.registeredKeys.filter((k) => k.id !== id),
    })),
}));
