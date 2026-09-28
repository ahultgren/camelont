import type { z } from 'zod'

export type ApiErrorKind = 'http' | 'network' | 'invalid-response' | 'unauthorized'

/** The one error type thrown by HTTP clients built on `createHttpClient`. */
export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly details: unknown = null,
  ) {
    super(message)
  }
}

export interface TokenSource {
  /** A valid access token (refreshing if it is about to expire). */
  getToken: () => Promise<string>
  /** Called after a 401: force a refresh. `null` means the session is gone. */
  refresh: () => Promise<string | null>
}

export interface HttpClientOptions {
  baseUrl: string
  auth?: TokenSource
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** Retries after 429 before giving up. */
  maxRateLimitRetries?: number
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export interface HttpClient {
  /** `path` is relative to `baseUrl`, or an absolute URL (e.g. a `next` page link). */
  request<S extends z.ZodType>(
    path: string,
    schema: S,
    options?: RequestOptions,
  ): Promise<z.output<S>>
}

const DEFAULT_RETRY_AFTER_S = 1
const MAX_RETRY_AFTER_S = 30

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const url = /^https?:\/\//.test(path)
    ? new URL(path)
    : new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function retryAfterMs(response: Response): number {
  const header = Number(response.headers.get('Retry-After'))
  const seconds = Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER_S
  return Math.min(seconds, MAX_RETRY_AFTER_S) * 1000
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = body.error
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message)
    }
    if (typeof error === 'string') return error
  }
  return `Request failed with status ${status}`
}

/**
 * A thin fetch wrapper: auth header, one retry after a 401 (via `auth.refresh`),
 * honouring `429 Retry-After`, zod validation of every response, typed errors.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const sleep = options.sleep ?? defaultSleep
  const maxRetries = options.maxRateLimitRetries ?? 3

  async function send(url: string, init: RequestInit, token: string | null): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    try {
      return await doFetch(url, { ...init, headers })
    } catch (cause) {
      throw new ApiError('network', 'Network request failed', null, cause)
    }
  }

  return {
    async request(path, schema, { method = 'GET', query, body } = {}) {
      const url = buildUrl(options.baseUrl, path, query)
      const init: RequestInit = { method }
      if (body !== undefined) {
        init.body = JSON.stringify(body)
        init.headers = { 'Content-Type': 'application/json' }
      }

      let token = options.auth ? await options.auth.getToken() : null
      let refreshed = false
      let rateLimited = 0

      for (;;) {
        const response = await send(url, init, token)

        if (response.status === 429 && rateLimited < maxRetries) {
          rateLimited++
          await sleep(retryAfterMs(response))
          continue
        }
        if (response.status === 401 && options.auth) {
          if (refreshed) throw new ApiError('unauthorized', 'Not authorised', 401)
          token = await options.auth.refresh()
          if (!token) throw new ApiError('unauthorized', 'Session expired', 401)
          refreshed = true
          continue
        }

        const data = await readBody(response)
        if (!response.ok) {
          throw new ApiError('http', errorMessage(data, response.status), response.status, data)
        }
        const parsed = schema.safeParse(data)
        if (!parsed.success) {
          throw new ApiError(
            'invalid-response',
            `Unexpected response from ${new URL(url).pathname}`,
            response.status,
            parsed.error.issues,
          )
        }
        return parsed.data
      }
    },
  }
}
