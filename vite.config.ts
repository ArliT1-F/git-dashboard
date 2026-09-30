import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { statSync } from 'node:fs'
import path from 'path'
import { viteSourceLocator } from '@metagptx/vite-plugin-source-locator'

const API_ROUTES = new Set(['/api/github'])
const API_ENTRY = '/api/github.ts'
const API_FILE = path.resolve(__dirname, 'api/github.ts')

type ApiHandler = (request: Request) => Promise<Response>

/**
 * Serves `api/*.ts` serverless functions during `vite dev`.
 *
 * Without this, `/api/github` only exists on Vercel, so the dashboard could not
 * be developed or previewed locally.
 */
const devApiPlugin = (env: Record<string, string>): Plugin => ({
  name: 'git-dashboard-dev-api',
  apply: 'serve',
  configureServer(server) {
    // Vite's SSR module cache does not invalidate for files outside the client
    // graph, so re-load the handler whenever api/github.ts changes on disk.
    let cached: { mtimeMs: number; handler: Promise<ApiHandler> } | null = null

    const getHandler = () => {
      const mtimeMs = statSync(API_FILE).mtimeMs
      if (cached && cached.mtimeMs === mtimeMs) return cached.handler

      const handler = server.ssrLoadModule(API_ENTRY).then((module) => {
        const value = module.default
        if (typeof value !== 'function') {
          throw new Error('api/github.ts does not export a default request handler')
        }
        return value as ApiHandler
      })

      cached = { mtimeMs, handler }
      return handler
    }

    server.middlewares.use((req, res, next) => {
      const originalUrl = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/'
      const url = new URL(originalUrl, `http://${req.headers.host ?? 'localhost'}`)

      if (!API_ROUTES.has(url.pathname)) {
        next()
        return
      }

      // Mirror Vercel: server-side env vars (e.g. GITHUB_TOKEN) are available to
      // the function but are never sent to the browser.
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }

      getHandler()
        .then((handler) =>
          handler(
            new Request(url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
            })
          )
        )
        .then(async (response) => {
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          res.end(Buffer.from(await response.arrayBuffer()))
        })
        .catch((error) => {
          // Drop the cached module so a broken edit can be fixed without a restart.
          cached = null
          next(error)
        })
    })
  },
})

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const extraAllowedHosts = env.VITE_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    plugins: [
      devApiPlugin(env),
      viteSourceLocator({
        prefix: 'mgx',
      }),
      react(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Reachable from the sandbox preview proxy (and any LAN host).
      host: true,
      // `host: true` binds every interface, so keep the dev-host allowlist
      // scoped to local + preview domains instead of accepting anything.
      allowedHosts: extraAllowedHosts?.length
        ? extraAllowedHosts
        : ['.localhost', 'localhost', '.e2b.app', '.arena.ai'],
    },
    preview: {
      host: true,
      allowedHosts: true,
    },
  }
})
