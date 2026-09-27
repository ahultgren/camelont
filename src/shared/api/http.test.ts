import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { server } from '@/test/msw'
import { ApiError, buildUrl, createHttpClient, type TokenSource } from './http'
import { paginate } from './paginate'

const BASE = 'https://api.example.test/v1'
const Thing = z.object({ id: z.string() })

const noSleep = () => Promise.resolve()

function tokens(initial = 'tok-1', refreshed: string | null = 'tok-2'): TokenSource {
  return {
    getToken: vi.fn(() => Promise.resolve(initial)),
    refresh: vi.fn(() => Promise.resolve(refreshed)),
  }
}

describe('buildUrl', () => {
  it('joins base, path and query, skipping undefined', () => {
    expect(buildUrl(BASE, '/me/playlists', { limit: 50, offset: undefined })).toBe(
      `${BASE}/me/playlists?limit=50`,
    )
  })

  it('keeps absolute URLs', () => {
    expect(buildUrl(BASE, 'https://other.test/x?a=1')).toBe('https://other.test/x?a=1')
  })
})

describe('createHttpClient', () => {
  it('sends the bearer token and parses with zod', async () => {
    let auth: string | null = null
    server.use(
      http.get(`${BASE}/things/1`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return HttpResponse.json({ id: '1', extra: true })
      }),
    )
    const client = createHttpClient({ baseUrl: BASE, auth: tokens() })
    await expect(client.request('/things/1', Thing)).resolves.toEqual({ id: '1' })
    expect(auth).toBe('Bearer tok-1')
  })

  it('posts JSON bodies', async () => {
    let received: unknown = null
    server.use(
      http.post(`${BASE}/things`, async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ id: 'new' }, { status: 201 })
      }),
    )
    const client = createHttpClient({ baseUrl: BASE })
    await client.request('/things', Thing, { method: 'POST', body: { name: 'x' } })
    expect(received).toEqual({ name: 'x' })
  })

  it('rejects payloads that fail validation', async () => {
    server.use(http.get(`${BASE}/things/1`, () => HttpResponse.json({ id: 1 })))
    const client = createHttpClient({ baseUrl: BASE })
    await expect(client.request('/things/1', Thing)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it('waits for Retry-After on 429, then retries', async () => {
    let calls = 0
    server.use(
      http.get(`${BASE}/things/1`, () => {
        calls++
        return calls === 1
          ? new HttpResponse(null, { status: 429, headers: { 'Retry-After': '2' } })
          : HttpResponse.json({ id: '1' })
      }),
    )
    const sleep = vi.fn(noSleep)
    const client = createHttpClient({ baseUrl: BASE, sleep })
    await expect(client.request('/things/1', Thing)).resolves.toEqual({ id: '1' })
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('gives up after the retry budget', async () => {
    server.use(http.get(`${BASE}/things/1`, () => new HttpResponse(null, { status: 429 })))
    const client = createHttpClient({ baseUrl: BASE, sleep: noSleep, maxRateLimitRetries: 2 })
    await expect(client.request('/things/1', Thing)).rejects.toMatchObject({
      kind: 'http',
      status: 429,
    })
  })

  it('refreshes once after a 401 and retries with the new token', async () => {
    server.use(
      http.get(`${BASE}/things/1`, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer tok-2'
          ? HttpResponse.json({ id: '1' })
          : new HttpResponse(null, { status: 401 }),
      ),
    )
    const auth = tokens()
    const client = createHttpClient({ baseUrl: BASE, auth })
    await expect(client.request('/things/1', Thing)).resolves.toEqual({ id: '1' })
    expect(auth.refresh).toHaveBeenCalledTimes(1)
  })

  it('reports unauthorised when the refresh fails', async () => {
    server.use(http.get(`${BASE}/things/1`, () => new HttpResponse(null, { status: 401 })))
    const client = createHttpClient({ baseUrl: BASE, auth: tokens('t', null) })
    await expect(client.request('/things/1', Thing)).rejects.toMatchObject({
      kind: 'unauthorized',
    })
  })

  it('reports unauthorised when the refreshed token is rejected too', async () => {
    server.use(http.get(`${BASE}/things/1`, () => new HttpResponse(null, { status: 401 })))
    const auth = tokens()
    const client = createHttpClient({ baseUrl: BASE, auth })
    await expect(client.request('/things/1', Thing)).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(auth.refresh).toHaveBeenCalledTimes(1)
  })

  it('surfaces the Spotify error message', async () => {
    server.use(
      http.get(`${BASE}/things/1`, () =>
        HttpResponse.json({ error: { status: 403, message: 'Forbidden' } }, { status: 403 }),
      ),
    )
    const client = createHttpClient({ baseUrl: BASE })
    const error = await client.request('/things/1', Thing).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'http', status: 403, message: 'Forbidden' })
  })

  it('wraps network failures', async () => {
    server.use(http.get(`${BASE}/things/1`, () => HttpResponse.error()))
    const client = createHttpClient({ baseUrl: BASE })
    await expect(client.request('/things/1', Thing)).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('paginate', () => {
  it('follows next links', async () => {
    const pages: Record<string, { items: number[]; next: string | null }> = {
      '/a': { items: [1, 2], next: 'https://x.test/b' },
      'https://x.test/b': { items: [3], next: null },
    }
    const all = await paginate(
      (url) => Promise.resolve(pages[url] ?? { items: [], next: null }),
      '/a',
    )
    expect(all).toEqual([1, 2, 3])
  })
})
