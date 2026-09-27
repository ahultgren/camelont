import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw'
import { MemoryStorage } from '@/test/storage'
import { SPOTIFY_TOKEN_URL } from '../domain/pkce'
import { createAuthSession, type AuthSessionOptions } from './session'

const REDIRECT = 'http://127.0.0.1:5173/camelont/callback'
let storage: MemoryStorage
let flowStorage: MemoryStorage
let clock: number
let redirected: string | null

const make = (extra: Partial<AuthSessionOptions> = {}) =>
  createAuthSession({
    clientId: 'cid',
    redirectUri: REDIRECT,
    storage,
    flowStorage,
    now: () => clock,
    redirect: (url) => {
      redirected = url
    },
    ...extra,
  })

function tokenEndpoint(respond: (form: URLSearchParams) => Response | Promise<Response>) {
  const forms: URLSearchParams[] = []
  server.use(
    http.post(SPOTIFY_TOKEN_URL, async ({ request }) => {
      const form = new URLSearchParams(await request.text())
      forms.push(form)
      return respond(form)
    }),
  )
  return forms
}

const tokenJson = (access: string, refresh?: string) =>
  HttpResponse.json({
    access_token: access,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'playlist-read-private',
    ...(refresh ? { refresh_token: refresh } : {}),
  })

async function loggedIn() {
  const session = make()
  await session.login()
  const state = new URL(redirected ?? '').searchParams.get('state') ?? ''
  tokenEndpoint(() => tokenJson('access-1', 'refresh-1'))
  await session.handleCallback(new URLSearchParams({ code: 'the-code', state }))
  server.resetHandlers()
  return session
}

beforeEach(() => {
  storage = new MemoryStorage()
  flowStorage = new MemoryStorage()
  clock = 1_000_000
  redirected = null
})

describe('auth session', () => {
  it('redirects to Spotify with a challenge for the stored verifier', async () => {
    await make().login()
    const url = new URL(redirected ?? '')
    const verifier = flowStorage.getItem('camelont.auth.verifier') ?? ''
    expect(verifier.length).toBe(64)
    expect(url.searchParams.get('state')).toBe(flowStorage.getItem('camelont.auth.state'))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(url.searchParams.get('code_challenge')).toBe(expected)
  })

  it('exchanges the code on callback and stays logged in across reloads', async () => {
    const session = make()
    const listener = vi.fn()
    session.subscribe(listener)
    await session.login()
    const state = new URL(redirected ?? '').searchParams.get('state') ?? ''
    const forms = tokenEndpoint(() => tokenJson('access-1', 'refresh-1'))
    await expect(
      session.handleCallback(new URLSearchParams({ code: 'c', state })),
    ).resolves.toEqual({
      ok: true,
    })
    expect(Object.fromEntries(forms[0] ?? [])).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c',
      redirect_uri: REDIRECT,
      client_id: 'cid',
      code_verifier: expect.any(String) as unknown,
    })
    expect(session.isLoggedIn()).toBe(true)
    expect(listener).toHaveBeenCalledWith(true)
    expect(flowStorage.length).toBe(0)
    expect(make().isLoggedIn()).toBe(true)
  })

  it('rejects a callback whose state does not match, without calling Spotify', async () => {
    const session = make()
    await session.login()
    const result = await session.handleCallback(new URLSearchParams({ code: 'c', state: 'forged' }))
    expect(result).toMatchObject({ ok: false, reason: 'state-mismatch' })
    expect(session.isLoggedIn()).toBe(false)
  })

  it('reports a cancelled login', async () => {
    const session = make()
    await session.login()
    const result = await session.handleCallback(new URLSearchParams({ error: 'access_denied' }))
    expect(result).toMatchObject({ ok: false, reason: 'denied' })
  })

  it('reports a failed exchange', async () => {
    const session = make()
    await session.login()
    const state = new URL(redirected ?? '').searchParams.get('state') ?? ''
    tokenEndpoint(() => HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }))
    const result = await session.handleCallback(new URLSearchParams({ code: 'c', state }))
    expect(result).toMatchObject({ ok: false, reason: 'exchange-failed', message: 'invalid_grant' })
  })

  it('returns the stored token while fresh', async () => {
    const session = await loggedIn()
    await expect(session.getToken()).resolves.toBe('access-1')
  })

  it('refreshes once for concurrent callers when about to expire, keeping the refresh token', async () => {
    const session = await loggedIn()
    clock += 3600_000 - 30_000
    const forms = tokenEndpoint(() => tokenJson('access-2'))
    const [a, b] = await Promise.all([session.getToken(), session.getToken()])
    expect([a, b]).toEqual(['access-2', 'access-2'])
    expect(forms).toHaveLength(1)
    expect(Object.fromEntries(forms[0] ?? [])).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    })
    // no new refresh token returned: the old one is kept
    clock += 3600_000
    const again = tokenEndpoint(() => tokenJson('access-3'))
    await session.getToken()
    expect(again[0]?.get('refresh_token')).toBe('refresh-1')
  })

  it('logs out when the refresh fails', async () => {
    const session = await loggedIn()
    const listener = vi.fn()
    session.subscribe(listener)
    tokenEndpoint(() => HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }))
    await expect(session.refresh()).resolves.toBeNull()
    expect(session.isLoggedIn()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
    await expect(session.getToken()).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('clears tokens on logout and ignores corrupt storage', async () => {
    const session = await loggedIn()
    session.logout()
    expect(session.isLoggedIn()).toBe(false)
    expect(storage.length).toBe(0)
    storage.setItem('camelont.auth.tokens', '{"accessToken":1}')
    expect(make().isLoggedIn()).toBe(false)
    storage.setItem('camelont.auth.tokens', 'not json')
    expect(make().isLoggedIn()).toBe(false)
  })
})
