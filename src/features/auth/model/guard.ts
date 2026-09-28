import type { NavigationGuardWithThis, RouteLocationRaw } from 'vue-router'
import { useAuthStore } from './auth-store'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

/** Sends logged-out users to the start page from routes that need a login. */
export const requireLogin: NavigationGuardWithThis<undefined> = (to): true | RouteLocationRaw => {
  if (!to.meta.requiresAuth) return true
  return useAuthStore().loggedIn ? true : { name: 'home' }
}
