/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

/**
 * Génère `sw.js` au build : liste des fichiers de l'application (y compris ceux de
 * `public/`) et version dérivée de leur contenu, insérées dans `src/pwa/sw.template.js`.
 */
function serviceWorker(): Plugin {
  return {
    name: 'simulife-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = [...Object.keys(bundle), ...readdirSync('public').filter((f) => f !== 'services.json')]
      const precache = ['./', ...files.filter((f) => !f.endsWith('.map'))]
      const hash = createHash('sha256')
      for (const [name, item] of Object.entries(bundle)) hash.update(name + (item.type === 'chunk' ? item.code : String(item.source)))
      const source = readFileSync('src/pwa/sw.template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Chemin de publication : « / » par défaut, « /SimuLife/ » pour GitHub Pages (voir README).
  base: process.env.SIMULIFE_BASE ?? '/',
  // Version affichée dans « À propos » : commit publié (GitHub Actions) ou « locale ».
  define: {
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'locale'),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
