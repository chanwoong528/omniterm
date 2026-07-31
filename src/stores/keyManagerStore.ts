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
  /** 키 파일 경로(storageKey)만 교체한다. 없는 파일을 새 경로로 재지정할 때 사용. */
  updateKeyPath: (id: string, newPath: string) => void;
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
      updateKeyPath: (id, newPath) =>
        set((state) => ({
          registeredKeys: state.registeredKeys.map((k) =>
            k.id === id ? { ...k, storageKey: newPath } : k
          ),
        })),
    }),
    {
      name: KEY_MANAGER_STORAGE_KEY,
      partialize: (state) => ({ registeredKeys: state.registeredKeys }),
    }
  )
);
