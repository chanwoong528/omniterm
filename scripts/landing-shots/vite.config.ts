import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Dev server used only by the screenshot driver (capture.mjs). */
export const SHOTS_DEV_PORT = 5199;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** macOS ships SF Mono here, under a hidden family name Chrome won't match. */
const SYSTEM_SF_MONO_PATH = '/System/Library/Fonts/SFNSMono.ttf';
const SF_MONO_URL = '/__landing-shots/sf-mono.ttf';

/**
 * The packaged app runs in WKWebView, where the terminal's `ui-monospace`
 * resolves to SF Mono. Chrome does not support `ui-monospace`, so map the next
 * name in the app's font stack (`SFMono-Regular`) to the same system font.
 * Off macOS the font is absent and xterm falls back to Menlo/Consolas.
 */
function systemSfMono(): Plugin {
  const isAvailable = existsSync(SYSTEM_SF_MONO_PATH);
  return {
    name: 'landing-shots:system-sf-mono',
    configureServer(server) {
      if (!isAvailable) return;
      server.middlewares.use(SF_MONO_URL, (_req, res) => {
        res.setHeader('Content-Type', 'font/ttf');
        res.end(readFileSync(SYSTEM_SF_MONO_PATH));
      });
    },
    transformIndexHtml() {
      if (!isAvailable) return [];
      return [
        {
          tag: 'style',
          injectTo: 'head',
          children: `@font-face { font-family: 'SFMono-Regular'; src: url('${SF_MONO_URL}') format('truetype'); font-weight: 300 900; }`,
        },
      ];
    },
  };
}

// Root is the repo root (not this folder) so Tailwind scans `src/` exactly as
// the app's own Vite config does; the capture page is served from
// /scripts/landing-shots/capture.html.
export default defineConfig({
  root: REPO_ROOT,
  plugins: [react(), tailwindcss(), systemSfMono()],
  logLevel: 'warn',
  clearScreen: false,
  server: {
    port: SHOTS_DEV_PORT,
    strictPort: true,
    host: '127.0.0.1',
  },
});
