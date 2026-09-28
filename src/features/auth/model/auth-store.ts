import { defineStore } from 'pinia'
import { inject, markRaw, readonly, ref, type App, type InjectionKey } from 'vue'
import type { TokenSource } from '@/shared/api'
import { createAuthSession, type AuthSession, type AuthSessionOptions } from './session'

export const AUTH_SESSION: InjectionKey<AuthSession> = Symbol('camelont.auth-session')

/** Creates the session from app config and makes it available to `useAuthStore`. */
export function installAuth(app: App, options: AuthSessionOptions): AuthSession {
  const session = createAuthSession(options)
  app.provide(AUTH_SESSION, session)
  return session
}

export const useAuthStore = defineStore('auth', () => {
  const session = inject(AUTH_SESSION)
  if (!session) throw new Error('installAuth() was not called')
  const loggedIn = ref(session.isLoggedIn())
  session.subscribe((value) => {
    loggedIn.value = value
  })
  const tokenSource: TokenSource = markRaw({
    getToken: () => session.getToken(),
    refresh: () => session.refresh(),
  })
  return {
    loggedIn: readonly(loggedIn),
    /** For API clients: a valid token, refreshed as needed. */
    tokenSource,
    login: () => session.login(),
    logout: () => {
      session.logout()
    },
    handleCallback: (params: URLSearchParams) => session.handleCallback(params),
  }
})
