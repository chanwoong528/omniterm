// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages: https://chanwoong528.github.io/omniterm
export default defineConfig({
  site: 'https://chanwoong528.github.io',
  base: '/omniterm',
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko', 'en'],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
