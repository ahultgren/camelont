import { z } from 'zod'
import { ApiError, type TokenSource } from '@/shared/api'
import { exchangeCode, refreshTokens } from '../api/token-endpoint'
import {
  authorizeUrl,
  codeChallenge,
  isExpiring,
  randomString,
  type TokenSet,
} from '../domain/pkce'

const TOKENS_KEY = 'camelont.auth.tokens'
const VERIFIER_KEY = 'camelont.auth.verifier'
const STATE_KEY = 'camelont.auth.state'

const StoredTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  scope: z.string(),
})

export interface AuthSessionOptions {
  clientId: string
  redirectUri: string
  /** Tokens (survive reloads). */
  storage?: Storage
  /** Verifier + state during the redirect. */
  flowStorage?: Storage
  fetch?: typeof fetch
  now?: () => number
  redirect?: (url: string) => void
  random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>
  sha256?: (data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>
}

export type CallbackResult =
  | { ok: true }
  | {
      ok: false
      reason: 'denied' | 'state-mismatch' | 'missing-code' | 'exchange-failed'
      message: string
    }

export interface AuthSession extends TokenSource {
  isLoggedIn(): boolean
  login(): Promise<void>
  handleCallback(params: URLSearchParams): Promise<CallbackResult>
  logout(): void
  /** Called whenever the logged-in state changes. */
  subscribe(listener: (loggedIn: boolean) => void): () => void
}

/**
 * Spotify PKCE session. Tokens live in localStorage; the verifier and state live in
 * sessionStorage only for the redirect. Refreshes are single-flight; a failed refresh
 * logs out.
 */
export function createAuthSession(options: AuthSessionOptions): AuthSession {
  const storage = options.storage ?? localStorage
  const flowStorage = options.flowStorage ?? sessionStorage
  const now = options.now ?? Date.now
  const redirect =
    options.redirect ??
    ((url: string) => {
      window.location.assign(url)
    })
  const random =
    options.random ?? ((bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes))
  const sha256 = options.sha256 ?? ((data) => crypto.subtle.digest('SHA-256', data))
  const endpoint = {
    clientId: options.clientId,
    now,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  }
  const listeners = new Set<(loggedIn: boolean) => void>()
  let refreshing: Promise<string | null> | null = null

  const read = (): TokenSet | null => {
    try {
      const parsed = StoredTokens.safeParse(JSON.parse(storage.getItem(TOKENS_KEY) ?? 'null'))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
  let tokens = read()

  const notify = () => {
    for (const listener of listeners) listener(tokens !== null)
  }
  const save = (next: TokenSet | null) => {
    const was = tokens !== null
    tokens = next
    if (next) storage.setItem(TOKENS_KEY, JSON.stringify(next))
    else storage.removeItem(TOKENS_KEY)
    if (was !== (next !== null)) notify()
  }

  const refresh = (): Promise<string | null> => {
    refreshing ??= (async () => {
      const current = tokens
      if (!current) return null
      try {
        const next = await refreshTokens(current.refreshToken, endpoint)
        save(next)
        return next.accessToken
      } catch {
        save(null)
        return null
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  return {
    isLoggedIn: () => tokens !== null,

    async getToken() {
      const current = tokens
      if (!current) throw new ApiError('unauthorized', 'Not logged in', 401)
      if (!isExpiring(current, now())) return current.accessToken
      const token = await refresh()
      if (!token) throw new ApiError('unauthorized', 'Session expired', 401)
      return token
    },

    refresh,

    async login() {
      const verifier = randomString(64, random)
      const state = randomString(32, random)
      flowStorage.setItem(VERIFIER_KEY, verifier)
      flowStorage.setItem(STATE_KEY, state)
      const challenge = await codeChallenge(verifier, sha256)
      redirect(
        authorizeUrl({
          clientId: options.clientId,
          redirectUri: options.redirectUri,
          challenge,
          state,
        }),
      )
    },

    async handleCallback(params) {
      const expectedState = flowStorage.getItem(STATE_KEY)
      const verifier = flowStorage.getItem(VERIFIER_KEY)
      flowStorage.removeItem(STATE_KEY)
      flowStorage.removeItem(VERIFIER_KEY)
      const error = params.get('error')
      if (error) {
        return {
          ok: false,
          reason: 'denied',
          message:
            error === 'access_denied' ? 'Spotify login was cancelled.' : `Spotify said: ${error}`,
        }
      }
      if (!expectedState || params.get('state') !== expectedState) {
        return {
          ok: false,
          reason: 'state-mismatch',
          message: 'The login response didn’t match this browser’s request. Try again.',
        }
      }
      const code = params.get('code')
      if (!code || !verifier) {
        return {
          ok: false,
          reason: 'missing-code',
          message: 'Spotify didn’t return a login code. Try again.',
        }
      }
      try {
        save(await exchangeCode({ code, redirectUri: options.redirectUri, verifier }, endpoint))
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          reason: 'exchange-failed',
          message: e instanceof Error ? e.message : 'Login failed.',
        }
      }
    },

    logout() {
      save(null)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
