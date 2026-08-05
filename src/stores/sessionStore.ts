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

/** 포워딩 규칙에 `kind`가 도입된 버전. 그 이전 규칙은 전부 로컬 포워딩이었다. */
const SESSION_SCHEMA_VERSION = 1;

/** localStorage에 실제로 남는 부분 (partialize와 같은 모양). */
interface PersistedSessionState {
  savedSessions: SavedSession[];
  activeSessionId: string | null;
}

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
      version: SESSION_SCHEMA_VERSION,
      // 이전 버전에는 로컬 포워딩만 있었으므로 kind가 없는 규칙은 local로 본다.
      // 안 채워 넣으면 백엔드가 kind를 필수로 받아 시작이 실패한다.
      migrate: (persisted, version): PersistedSessionState => {
        const state = (persisted ?? {}) as Partial<PersistedSessionState>;
        const savedSessions = state.savedSessions ?? [];
        const activeSessionId = state.activeSessionId ?? null;
        if (version >= SESSION_SCHEMA_VERSION) return { savedSessions, activeSessionId };
        return {
          activeSessionId,
          savedSessions: savedSessions.map((session) => ({
            ...session,
            portForwards: session.portForwards?.map((rule) => ({
              ...rule,
              kind: rule.kind ?? 'local',
            })),
          })),
        };
      },
      partialize: (state) => ({
        savedSessions: state.savedSessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
