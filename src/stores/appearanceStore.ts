import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getDefaultXtermThemeId,
  isKnownXtermThemeId,
  type AppearanceMode,
} from '../domains/appearance/xtermThemes';

const STORAGE_KEY = 'omniterm:appearance:v1';

const APPEARANCE_MODES: AppearanceMode[] = ['dark', 'light'];

interface AppearanceState {
  mode: AppearanceMode;
  /** Each mode keeps its own terminal theme: switching the shell back and forth
   *  must not lose the Dracula/Solarized choice made for the other mode. */
  terminalThemeIdByMode: Record<AppearanceMode, string>;
  setMode: (mode: AppearanceMode) => void;
  toggleMode: () => void;
  setTerminalThemeId: (mode: AppearanceMode, themeId: string) => void;
}

interface PersistedAppearanceState {
  mode: AppearanceMode;
  terminalThemeIdByMode: Record<AppearanceMode, string>;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      mode: 'dark',
      terminalThemeIdByMode: {
        dark: getDefaultXtermThemeId('dark'),
        light: getDefaultXtermThemeId('light'),
      },
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((state) => ({ mode: state.mode === 'dark' ? 'light' : 'dark' })),
      setTerminalThemeId: (mode, themeId) =>
        set((state) => ({
          terminalThemeIdByMode: { ...state.terminalThemeIdByMode, [mode]: themeId },
        })),
    }),
    {
      name: STORAGE_KEY,
      // Validate on rehydrate rather than trusting localStorage: a theme id
      // dropped in a later build would otherwise leave the picker blank.
      merge: (persisted, current) => {
        const saved = persisted as Partial<PersistedAppearanceState> | undefined;
        const terminalThemeIdByMode = { ...current.terminalThemeIdByMode };
        for (const mode of APPEARANCE_MODES) {
          const savedId = saved?.terminalThemeIdByMode?.[mode];
          if (savedId && isKnownXtermThemeId(mode, savedId)) {
            terminalThemeIdByMode[mode] = savedId;
          }
        }
        return {
          ...current,
          mode: saved?.mode === 'light' ? 'light' : 'dark',
          terminalThemeIdByMode,
        };
      },
      partialize: (state): PersistedAppearanceState => ({
        mode: state.mode,
        terminalThemeIdByMode: state.terminalThemeIdByMode,
      }),
    }
  )
);
