import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedSession } from '../types/session';

interface SessionState {
  savedSessions: SavedSession[];
  activeSessionId: string | null;
  upsertSession: (session: SavedSession) => void;
  removeSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
  getSessionById: (id: string) => SavedSession | undefined;
  markConnected: (id: string) => void;
}

const STORAGE_KEY = 'omniterm:sessions:v1';

function upsert(list: SavedSession[], session: SavedSession): SavedSession[] {
  const idx = list.findIndex((s) => s.id === session.id);
  if (idx === -1) return [session, ...list];
  const next = [...list];
  next[idx] = session;
  return next;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      savedSessions: [],
      activeSessionId: null,
      upsertSession: (session) =>
        set((state) => ({
          savedSessions: upsert(state.savedSessions, session),
        })),
      removeSession: (id) =>
        set((state) => ({
          savedSessions: state.savedSessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        })),
      setActiveSessionId: (id) => set({ activeSessionId: id }),
      getSessionById: (id) => get().savedSessions.find((s) => s.id === id),
      markConnected: (id) =>
        set((state) => {
          const session = state.savedSessions.find((s) => s.id === id);
          if (!session) return state;
          const updated: SavedSession = { ...session, lastConnectedAt: new Date().toISOString() };
          return { savedSessions: upsert(state.savedSessions, updated) };
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        savedSessions: state.savedSessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
