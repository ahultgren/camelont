import { describe, expect, it } from 'vitest'
import {
  authorizeUrl,
  base64Url,
  codeChallenge,
  isExpiring,
  randomString,
  SPOTIFY_SCOPES,
} from './pkce'

const sha256 = (data: Uint8Array<ArrayBuffer>) => crypto.subtle.digest('SHA-256', data)

describe('PKCE', () => {
  it('computes the RFC 7636 example challenge', async () => {
    // RFC 7636 appendix B
    await expect(
      codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', sha256),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('makes random strings from the unreserved alphabet', () => {
    const s = randomString(64, (b) => b.map((_, i) => i * 7))
    expect(s).toHaveLength(64)
    expect(s).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('base64url-encodes without padding', () => {
    expect(base64Url(new Uint8Array([251, 255]).buffer)).toBe('-_8')
  })

  it('builds the authorize URL with S256, state and only the needed scopes', () => {
    const url = new URL(
      authorizeUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:5173/camelont/callback',
        challenge: 'ch',
        state: 'st',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'http://127.0.0.1:5173/camelont/callback',
      code_challenge_method: 'S256',
      code_challenge: 'ch',
      state: 'st',
      scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private',
    })
    expect(SPOTIFY_SCOPES).toHaveLength(3)
  })

  it('treats tokens with under a minute left as expiring', () => {
    const token = { accessToken: 'a', refreshToken: 'r', scope: '', expiresAt: 100_000 }
    expect(isExpiring(token, 30_000)).toBe(false)
    expect(isExpiring(token, 50_000)).toBe(true)
  })
})
