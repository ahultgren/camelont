import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { defineComponent, h, type Component } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type RouteRecordRaw } from 'vue-router'
import { installAuth, requireLogin } from '@/features/auth'
import { MemoryStorage } from './storage'

export interface RenderPageOptions {
  path?: string
  routes: RouteRecordRaw[]
  /** Token storage; defaults to logged out. */
  storage?: Storage
  redirect?: (url: string) => void
}

/** Renders routes inside the app's plugins (Pinia, Vue Query, auth, router). */
export async function renderRoutes(options: RenderPageOptions) {
  const router = createRouter({
    history: createMemoryHistory('/camelont/'),
    routes: options.routes,
  })
  router.beforeEach(requireLogin)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Shell = defineComponent({ render: () => h(RouterView) })
  const result = render(Shell, {
    global: {
      plugins: [
        createPinia(),
        [VueQueryPlugin, { queryClient }],
        {
          install(app) {
            installAuth(app, {
              clientId: 'test-client',
              redirectUri: 'http://127.0.0.1:5173/camelont/callback',
              storage: options.storage ?? new MemoryStorage(),
              flowStorage: new MemoryStorage(),
              redirect: options.redirect ?? (() => undefined),
            })
          },
        },
        router,
      ],
    },
  })
  await router.push(options.path ?? '/')
  await router.isReady()
  return { ...result, router, queryClient }
}

export const route = (path: string, component: Component, extra: Partial<RouteRecordRaw> = {}) =>
  ({ path, component, ...extra }) as RouteRecordRaw
