import { Check, Moon, Sun } from 'lucide-react';
import { useAppearanceStore } from '../../../stores/appearanceStore';
import { XTERM_THEMES, type AppearanceMode, type XtermThemeOption } from '../xtermThemes';

const MODE_OPTIONS: { mode: AppearanceMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeSettings() {
  const mode = useAppearanceStore((s) => s.mode);
  const setMode = useAppearanceStore((s) => s.setMode);
  const terminalThemeId = useAppearanceStore((s) => s.terminalThemeIdByMode[s.mode]);
  const setTerminalThemeId = useAppearanceStore((s) => s.setTerminalThemeId);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Appearance
        </h3>
        <p className="mb-2 text-xs text-zinc-500">Applies to the app window and panels.</p>
        <div
          className="flex gap-1 rounded bg-zinc-900/60 p-1"
          role="radiogroup"
          aria-label="Appearance mode"
        >
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setMode(option.mode)}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                  isSelected ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                tabIndex={0}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Terminal
        </h3>
        <p className="mb-2 text-xs text-zinc-500">
          Each appearance keeps its own terminal theme, so switching back restores this choice.
        </p>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={`Terminal theme for ${mode} mode`}
        >
          {XTERM_THEMES[mode].map((option) => (
            <TerminalThemeCard
              key={option.id}
              option={option}
              isSelected={option.id === terminalThemeId}
              onSelect={() => setTerminalThemeId(mode, option.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Paints a miniature terminal in the theme's own colors — the picker has to be
 *  usable with no session open, which is exactly when nothing else on screen
 *  shows what a terminal theme looks like. */
function TerminalThemeCard({
  option,
  isSelected,
  onSelect,
}: {
  option: XtermThemeOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { theme, label } = option;
  const swatches = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className="group flex min-w-0 flex-col gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      tabIndex={0}
    >
      <div
        className={`overflow-hidden rounded border px-2 py-1.5 text-left font-mono text-[9px] leading-[1.5] ${
          isSelected ? 'border-zinc-400' : 'border-zinc-700 group-hover:border-zinc-500'
        }`}
        style={{ backgroundColor: theme.background }}
        aria-hidden
      >
        <div className="truncate">
          <span style={{ color: theme.green }}>~</span>{' '}
          <span style={{ color: theme.blue }}>$</span>{' '}
          <span style={{ color: theme.foreground }}>tail -f log</span>
        </div>
        <div className="truncate" style={{ color: theme.foreground }}>
          <span style={{ color: theme.yellow }}>warn</span> retrying
        </div>
        <div className="mt-1 flex gap-1">
          {swatches.map((color) => (
            <span
              key={color}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      <span
        className={`flex min-w-0 items-center justify-center gap-1 text-[11px] ${
          isSelected ? 'font-medium text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300'
        }`}
      >
        {isSelected && <Check className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
    </button>
  );
}
