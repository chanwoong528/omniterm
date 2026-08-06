import { useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { ThemeSettings } from '../../appearance/components/ThemeSettings';

interface SettingsModalProps {
  onClose: () => void;
}

/** App settings. Only Theme for now — sections are laid out so more can be
 *  appended without restructuring. */
export function SettingsModal({ onClose }: SettingsModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Settings className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
            <h2 id="settings-modal-title" className="truncate text-sm font-semibold text-zinc-100">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Close settings"
            tabIndex={0}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-w-0 overflow-y-auto p-4">
          <ThemeSettings />
        </div>
      </div>
    </div>
  );
}
