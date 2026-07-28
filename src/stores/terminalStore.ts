import { create } from 'zustand';

export interface TerminalTab {
  id: string;
  sessionId: string;
  title: string;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  addTab: (sessionId: string, title: string) => string;
  setActiveTab: (id: string | null) => void;
  removeTab: (id: string) => void;
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (sessionId: string, title: string) => {
    const id = generateTabId();
    const tab: TerminalTab = { id, sessionId, title };
    // A newly opened tab always becomes active — connecting to a second
    // server must switch the view to it.
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  setActiveTab: (activeTabId) => set({ activeTabId }),

  removeTab: (id) =>
    set((state) => {
      const next = state.tabs.filter((t) => t.id !== id);
      const activeTabId =
        state.activeTabId === id
          ? next[0]?.id ?? null
          : state.activeTabId;
      return { tabs: next, activeTabId };
    }),
}));
