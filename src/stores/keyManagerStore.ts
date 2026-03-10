import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RegisteredKeyMeta } from '../types/key-manager';

const KEY_MANAGER_STORAGE_KEY = 'omniterm:key-manager:v1';

interface KeyManagerState {
  /** 등록된 키 목록 (메타데이터만, 평문 키는 저장하지 않음). 앱 종료 후에도 유지됨. */
  registeredKeys: RegisteredKeyMeta[];
  setRegisteredKeys: (keys: RegisteredKeyMeta[]) => void;
  addKey: (key: RegisteredKeyMeta) => void;
  removeKey: (id: string) => void;
}

export const useKeyManagerStore = create<KeyManagerState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: KEY_MANAGER_STORAGE_KEY,
      partialize: (state) => ({ registeredKeys: state.registeredKeys }),
    }
  )
);
