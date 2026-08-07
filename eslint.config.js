import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // website/.astro는 astro dev/build가 만드는 생성물이다. gitignore에는 있지만
  // eslint는 그걸 보지 않으므로, npm run astro:dev를 한 번 돌리면
  // npm run lint가 생성 파일의 any/{} 때문에 깨진다.
  globalIgnores(['dist', 'src-tauri/target', 'src-tauri/gen', 'website/.astro', 'website/dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
