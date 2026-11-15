import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        help: fileURLToPath(new URL('./help/index.html', import.meta.url)),
        planetX: fileURLToPath(new URL('./planet-x/index.html', import.meta.url)),
        spherex: fileURLToPath(new URL('./spherex/index.html', import.meta.url)),
      },
    },
  },
})
