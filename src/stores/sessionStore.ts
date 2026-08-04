import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedSession } from '../types/session';
import type { PortForwardRule } from '../types/port-forward';

interface SessionState {
  savedSessions: SavedSession[];
  activeSessionId: string | null;
  upsertSession: (session: SavedSession) => void;
  removeSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
  getSessionById: (id: string) => SavedSession | undefined;
  markConnected: (id: string) => void;
  upsertPortForwardRule: (sessionId: string, rule: PortForwardRule) => void;
  removePortForwardRule: (sessionId: string, ruleId: string) => void;
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
      upsertPortForwardRule: (sessionId, rule) =>
        set((state) => {
          const session = state.savedSessions.find((s) => s.id === sessionId);
          if (!session) return state;
          const rules = session.portForwards ?? [];
          const isExisting = rules.some((r) => r.id === rule.id);
          const nextRules = isExisting
            ? rules.map((r) => (r.id === rule.id ? rule : r))
            : [...rules, rule];
          return {
            savedSessions: upsert(state.savedSessions, { ...session, portForwards: nextRules }),
          };
        }),
      removePortForwardRule: (sessionId, ruleId) =>
        set((state) => {
          const session = state.savedSessions.find((s) => s.id === sessionId);
          if (!session?.portForwards) return state;
          const nextRules = session.portForwards.filter((r) => r.id !== ruleId);
          return {
            savedSessions: upsert(state.savedSessions, { ...session, portForwards: nextRules }),
          };
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
