/** Spotify OAuth (Authorization Code + PKCE). See docs/research.md §2. */

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'

/** Only what the app needs (spec §6). */
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
] as const

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/** Random string from the PKCE unreserved alphabet (43–128 chars for a verifier). */
export function randomString(
  length: number,
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>,
): string {
  const bytes = random(new Uint8Array(length))
  return Array.from(bytes, (b) => UNRESERVED[b % UNRESERVED.length]).join('')
}

export function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** S256 code challenge: base64url(SHA-256(verifier)). */
export async function codeChallenge(
  verifier: string,
  sha256: (data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>,
): Promise<string> {
  return base64Url(await sha256(new TextEncoder().encode(verifier)))
}

export function authorizeUrl(params: {
  clientId: string
  redirectUri: string
  challenge: string
  state: string
}): string {
  const url = new URL(SPOTIFY_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: params.challenge,
    state: params.state,
    scope: SPOTIFY_SCOPES.join(' '),
  }).toString()
  return url.toString()
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  /** Epoch ms. */
  expiresAt: number
  scope: string
}

/** Refresh when less than this is left. */
export const REFRESH_MARGIN_MS = 60_000

export const isExpiring = (token: TokenSet, now: number): boolean =>
  token.expiresAt - now < REFRESH_MARGIN_MS
