import { copyFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

// GitHub Pages serves 404.html for unknown paths; a copy of index.html lets
// history-mode deep links (e.g. /camelont/callback) boot the SPA.
function pagesFallback(): Plugin {
  let outDir = 'dist'
  return {
    name: 'camelont:pages-404',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      await copyFile(`${outDir}/index.html`, `${outDir}/404.html`)
    },
  }
}

export default defineConfig({
  base: '/camelont/',
  plugins: [vue(), tailwindcss(), pagesFallback()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  worker: { format: 'es' },
})
