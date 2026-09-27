import { createRouter, createWebHistory, type Router } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'

export function createAppRouter(base: string): Router {
  return createRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', name: 'home', component: HomePage },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
    ],
  })
}
