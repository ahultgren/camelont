import { z } from 'zod'
import { ApiError } from '@/shared/api'
import { SPOTIFY_TOKEN_URL, type TokenSet } from '../domain/pkce'

const TokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(''),
})

const TokenError = z.object({ error: z.string(), error_description: z.string().optional() })

export interface TokenEndpointOptions {
  clientId: string
  fetch?: typeof fetch
  now?: () => number
}

async function post(
  body: Record<string, string>,
  options: TokenEndpointOptions,
): Promise<z.output<typeof TokenResponse>> {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  let response: Response
  try {
    response = await doFetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...body, client_id: options.clientId }),
    })
  } catch (cause) {
    throw new ApiError('network', 'Could not reach Spotify', null, cause)
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = TokenError.safeParse(data)
    const message = error.success
      ? (error.data.error_description ?? error.data.error)
      : 'Token request failed'
    throw new ApiError(
      response.status === 400 ? 'unauthorized' : 'http',
      message,
      response.status,
      data,
    )
  }
  const parsed = TokenResponse.safeParse(data)
  if (!parsed.success) {
    throw new ApiError(
      'invalid-response',
      'Unexpected token response',
      response.status,
      parsed.error.issues,
    )
  }
  return parsed.data
}

const toTokenSet = (
  data: z.output<typeof TokenResponse>,
  now: number,
  previousRefreshToken: string | null,
): TokenSet => {
  const refreshToken = data.refresh_token ?? previousRefreshToken
  if (!refreshToken) throw new ApiError('invalid-response', 'No refresh token in token response')
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: now + data.expires_in * 1000,
    scope: data.scope,
  }
}

export async function exchangeCode(
  params: { code: string; redirectUri: string; verifier: string },
  options: TokenEndpointOptions,
): Promise<TokenSet> {
  const now = options.now ?? Date.now
  const data = await post(
    {
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.verifier,
    },
    options,
  )
  return toTokenSet(data, now(), null)
}

/** A refresh may or may not return a new refresh token; keep the old one if not. */
export async function refreshTokens(
  refreshToken: string,
  options: TokenEndpointOptions,
): Promise<TokenSet> {
  const now = options.now ?? Date.now
  const data = await post({ grant_type: 'refresh_token', refresh_token: refreshToken }, options)
  return toTokenSet(data, now(), refreshToken)
}
