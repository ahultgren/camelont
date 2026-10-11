import { createRouter, createWebHistory, type Router } from 'vue-router'
import { requireLogin } from '@/features/auth'
import CallbackPage from '@/pages/CallbackPage.vue'
import HomePage from '@/pages/HomePage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'

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
        meta: { requiresAuth: true },
        props: true,
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
    ],
  })
  router.beforeEach(requireLogin)
  return router
}
