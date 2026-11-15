import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { onRequestGet as searchSky } from './functions/api/sky-observations.js'
import { onRequestGet as getCutout } from './functions/api/sky-cutout.js'

const localArchiveApi = {
  name: 'local-spherex-api',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url, 'http://localhost')
      const handler = { '/api/sky-observations': searchSky, '/api/sky-cutout': getCutout }[url.pathname]
      if (!handler || request.method !== 'GET') return next()
      try {
        const result = await handler({ request: new Request(url), waitUntil: task => task.catch(() => {}) })
        response.writeHead(result.status, Object.fromEntries(result.headers))
        if (result.body) {
          for await (const chunk of result.body) response.write(chunk)
        }
        response.end()
      } catch {
        if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'The archive connection failed. Please retry.' }))
      }
    })
  },
}

export default defineConfig({
  plugins: [localArchiveApi],
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
