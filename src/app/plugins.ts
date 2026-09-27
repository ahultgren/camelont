import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import type { App } from 'vue'
import { installAuth } from '@/features/auth'
import type { AppConfig } from './config'
import { createAppRouter } from './router'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  })
}

export function installPlugins(app: App, config: AppConfig): App {
  app.use(createPinia())
  app.use(VueQueryPlugin, { queryClient: createQueryClient() })
  installAuth(app, { clientId: config.spotifyClientId, redirectUri: config.redirectUri })
  app.use(createAppRouter(config.baseUrl))
  return app
}
