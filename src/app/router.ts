import { createRouter, createWebHistory, type Router } from 'vue-router'
import { requireLogin } from '@/features/auth'
import CallbackPage from '@/pages/CallbackPage.vue'
import HomePage from '@/pages/HomePage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** The page lays out the whole window itself: no app header, no page width. */
    fullScreen?: boolean
  }
}

export function createAppRouter(base: string): Router {
  const router = createRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', name: 'home', component: HomePage },
      { path: '/callback', name: 'callback', component: CallbackPage },
      {
        path: '/sets/:id',
        name: 'set',
        component: () => import('@/pages/SetPage.vue'),
        // The workspace fills the window and scrolls inside its own areas (spec §9).
        meta: { requiresAuth: true, fullScreen: true },
        props: true,
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
    ],
  })
  router.beforeEach(requireLogin)
  return router
}
