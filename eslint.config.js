import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    // Le moteur de simulation, le dossier de vie et l'arbre des destins restent indépendants de l'interface :
    // aucun import de React, du dossier ui/ ni du stockage.
    files: ['src/engine/**/*.ts', 'src/dossier/**/*.ts', 'src/destiny/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'Le moteur et le dossier ne doivent pas dépendre de React.' },
            { group: ['**/ui/**', '**/storage/**'], message: 'Le moteur et le dossier ne doivent pas dépendre de l’interface ni du stockage.' },
          ],
        },
      ],
    },
  },
])
