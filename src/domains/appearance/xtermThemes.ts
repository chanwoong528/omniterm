import type { ITheme } from '@xterm/xterm';

export type AppearanceMode = 'dark' | 'light';

/** The colors the settings preview paints with. Required so a new theme cannot
 *  ship with a hole that the preview would have to guess a fallback for. */
type PreviewColors = 'background' | 'foreground' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan';

export type XtermTheme = ITheme & Required<Pick<ITheme, PreviewColors>>;

export interface XtermThemeOption {
  id: string;
  label: string;
  theme: XtermTheme;
}

/** Three terminal themes per appearance mode. The first entry of each list is
 *  that mode's default, so the fallback in `resolveXtermTheme` is well defined
 *  even for an id persisted by an older build. */
export const XTERM_THEMES: Record<AppearanceMode, XtermThemeOption[]> = {
  dark: [
    {
      id: 'omniterm-dark',
      label: 'OmniTerm Dark',
      theme: {
        background: '#18181b',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#18181b',
        selectionBackground: 'rgba(255, 255, 255, 0.2)',
        black: '#3f3f46',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
    },
    {
      id: 'dracula',
      label: 'Dracula',
      theme: {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        cursorAccent: '#282a36',
        selectionBackground: 'rgba(68, 71, 90, 0.9)',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
    },
    {
      id: 'solarized-dark',
      label: 'Solarized Dark',
      theme: {
        background: '#002b36',
        foreground: '#93a1a1',
        cursor: '#93a1a1',
        cursorAccent: '#002b36',
        selectionBackground: 'rgba(7, 54, 66, 0.95)',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#586e75',
        brightRed: '#cb4b16',
        brightGreen: '#657b83',
        brightYellow: '#839496',
        brightBlue: '#6c71c4',
        brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3',
      },
    },
  ],
  light: [
    {
      id: 'omniterm-light',
      label: 'OmniTerm Light',
      theme: {
        background: '#ffffff',
        foreground: '#27272a',
        cursor: '#27272a',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(24, 24, 27, 0.16)',
        // Every slot clears WCAG AA (4.5:1) against the white background. Green,
        // yellow and cyan need the 700/800 shades to get there — the 500/600
        // ones a dark theme uses are only ~3:1 on white, which is what makes a
        // colored shell prompt look washed out.
        black: '#3f3f46',
        red: '#dc2626',
        green: '#15803d',
        yellow: '#a16207',
        blue: '#2563eb',
        magenta: '#9333ea',
        cyan: '#0e7490',
        white: '#52525b',
        brightBlack: '#71717a',
        brightRed: '#b91c1c',
        brightGreen: '#166534',
        brightYellow: '#854d0e',
        brightBlue: '#1d4ed8',
        brightMagenta: '#7e22ce',
        brightCyan: '#155e75',
        brightWhite: '#18181b',
      },
    },
    {
      id: 'solarized-light',
      label: 'Solarized Light',
      theme: {
        background: '#fdf6e3',
        foreground: '#586e75',
        cursor: '#586e75',
        cursorAccent: '#fdf6e3',
        selectionBackground: 'rgba(238, 232, 213, 0.95)',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#657b83',
        brightRed: '#cb4b16',
        brightGreen: '#586e75',
        brightYellow: '#93a1a1',
        brightBlue: '#6c71c4',
        brightMagenta: '#6c71c4',
        brightCyan: '#839496',
        brightWhite: '#002b36',
      },
    },
    {
      id: 'github-light',
      label: 'GitHub Light',
      theme: {
        background: '#ffffff',
        foreground: '#24292f',
        cursor: '#24292f',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(9, 105, 218, 0.2)',
        black: '#24292e',
        red: '#d73a49',
        green: '#28a745',
        yellow: '#b08800',
        blue: '#0366d6',
        magenta: '#5a32a3',
        cyan: '#0598bc',
        white: '#6a737d',
        brightBlack: '#959da5',
        brightRed: '#cb2431',
        brightGreen: '#22863a',
        brightYellow: '#a16207',
        brightBlue: '#005cc5',
        brightMagenta: '#5a32a3',
        brightCyan: '#3192aa',
        brightWhite: '#1b1f23',
      },
    },
  ],
};

export function getDefaultXtermThemeId(mode: AppearanceMode): string {
  return XTERM_THEMES[mode][0].id;
}

export function isKnownXtermThemeId(mode: AppearanceMode, id: string): boolean {
  return XTERM_THEMES[mode].some((option) => option.id === id);
}

/** Falls back to the mode's default theme, so a stale persisted id can never
 *  leave the terminal without a theme. */
export function resolveXtermTheme(mode: AppearanceMode, id: string): XtermTheme {
  const options = XTERM_THEMES[mode];
  const match = options.find((option) => option.id === id);
  return (match ?? options[0]).theme;
}
