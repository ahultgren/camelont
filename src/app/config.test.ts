import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('builds the redirect URI from origin and base', () => {
    const result = loadConfig(
      { VITE_SPOTIFY_CLIENT_ID: 'abc', BASE_URL: '/camelont/' },
      'http://127.0.0.1:5173',
    )
    expect(result).toEqual({
      ok: true,
      config: {
        spotifyClientId: 'abc',
        baseUrl: '/camelont/',
        redirectUri: 'http://127.0.0.1:5173/camelont/callback',
      },
    })
  })

  it('reports a missing client ID', () => {
    const result = loadConfig({ BASE_URL: '/camelont/' }, 'http://x')
    expect(result.ok).toBe(false)
  })
})
