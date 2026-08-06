import type { AppearanceMode } from '../xtermThemes';

/** Publishes the mode to `<html data-theme>`, which is what the light-mode
 *  token overrides in `index.css` hang off. Idempotent — safe to call on every
 *  render pass or store change. */
export function applyAppearanceMode(mode: AppearanceMode) {
  document.documentElement.dataset.theme = mode;
}
