import type { Page, Route } from '@playwright/test'
import wcs from '../../src/test/fixtures/wcs-set.json' with { type: 'json' }

const SPOTIFY = 'https://api.spotify.com/v1'
const RECCOBEATS = 'https://api.reccobeats.com/v1'

type WcsTrack = (typeof wcs.tracks)[number]

/** Inverse of the Camelot formula: Camelot → pitch class + mode. */
function pitchClass(camelot: string): { key: number; mode: number } {
  const n = Number(camelot.slice(0, -1)) % 12
  const mode = camelot.endsWith('B') ? 1 : 0
  const offset = mode ? 8 : 5
  return { key: ((((n - offset) * 7) % 12) + 12) % 12, mode }
}

/**
 * What ReccoBeats knew about the WCS set before the user's corrections: the tracks
 * marked "reccobeats", plus the double-time and wrong-key answers from the notes.
 */
function reccoRow(t: WcsTrack) {
  const row = (camelot: string, tempo: number) => ({
    id: `recco-${t.id}`,
    href: `https://open.spotify.com/track/${t.id}`,
    ...pitchClass(camelot),
    tempo,
    energy: t.energy ?? 0.6,
  })
  if (t.source === 'reccobeats') return row(t.camelot, t.bpm)
  if (t.title === 'Price Tag') return row('7B', 175)
  if (t.title.startsWith('We Are Young')) return row('6B', 184.1)
  if (t.title.startsWith('Blank Space (Taylor')) return row('8B', 96)
  return null
}

const durationMs = (d: string) => {
  const [m, s] = d.split(':').map(Number)
  return ((m ?? 0) * 60 + (s ?? 0)) * 1000
}

const item = (t: WcsTrack) => ({
  is_local: false,
  item: {
    type: 'track',
    id: t.id,
    uri: `spotify:track:${t.id}`,
    name: t.title,
    duration_ms: durationMs(t.duration),
    is_local: false,
    artists: t.artist.split(', ').map((name) => ({ name })),
    album: { images: [] },
  },
})

const playlist = (id: string, name: string, owner: string, total: number) => ({
  id,
  name,
  collaborative: false,
  images: [],
  owner: { id: owner, display_name: owner === 'me' ? 'Me' : 'Spotify' },
  items: { total },
  external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
})

export interface SpotifyLog {
  created: unknown[]
  added: string[][]
  /** Any write to the source playlist (must stay empty). */
  sourceWrites: string[]
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Logged-in tokens, as the app stores them. */
export async function logIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'camelont.auth.tokens',
      JSON.stringify({
        accessToken: 'e2e-token',
        refreshToken: 'e2e-refresh',
        expiresAt: Date.now() + 3600_000,
        scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private',
      }),
    )
  })
}

/** Mocks Spotify and ReccoBeats with the WCS set; every other external request fails. */
export async function mockApis(page: Page): Promise<SpotifyLog> {
  const log: SpotifyLog = { created: [], added: [], sourceWrites: [] }
  const tracks = wcs.orders.original.ids.map((id) => {
    const t = wcs.tracks.find((x) => x.id === id)
    if (!t) throw new Error(id)
    return t
  })

  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
  await page.route(`${SPOTIFY}/**`, async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const path = url.pathname.replace('/v1', '')
    if (method === 'GET' && path === '/me') return json(route, { id: 'me', display_name: 'Me' })
    if (method === 'GET' && path === '/me/playlists') {
      return json(route, {
        items: [playlist('wcs', 'WCS', 'me', 20), playlist('top', 'Top Hits', 'spotify', 50)],
        next: null,
      })
    }
    if (method === 'GET' && path === '/playlists/wcs/items') {
      return json(route, { items: tracks.map(item), next: null })
    }
    if (method === 'POST' && path === '/me/playlists') {
      log.created.push(route.request().postDataJSON())
      return json(
        route,
        { id: 'new-mix', external_urls: { spotify: 'https://open.spotify.com/playlist/new-mix' } },
        201,
      )
    }
    if (method === 'POST' && path === '/playlists/new-mix/items') {
      log.added.push((route.request().postDataJSON() as { uris: string[] }).uris)
      return json(route, { snapshot_id: 'snap' }, 201)
    }
    if (path.startsWith('/playlists/wcs') && method !== 'GET')
      log.sourceWrites.push(`${method} ${path}`)
    return json(route, { error: { status: 404, message: 'Not mocked' } }, 404)
  })
  await page.route(`${RECCOBEATS}/**`, (route) => {
    const ids = new URL(route.request().url()).searchParams.get('ids')?.split(',') ?? []
    const rows = ids
      .map((id) => wcs.tracks.find((t) => t.id === id))
      .filter((t): t is WcsTrack => t !== undefined)
      .map(reccoRow)
      .filter((r) => r !== null)
      .reverse() // ReccoBeats reorders rows
    return json(route, { content: rows })
  })
  return log
}

/** The user's corrections for the WCS set, as an export file. */
export function wcsCorrectionsFile(): string {
  const overrides = wcs.tracks
    .filter((t) => t.source === 'manual')
    .map((t) => ({
      trackId: t.id,
      camelot: t.camelot,
      bpm: t.bpm,
      note: t.note ?? null,
      label: t.title,
      updatedAt: 1,
    }))
  return JSON.stringify({
    app: 'camelont',
    kind: 'track-overrides',
    version: 1,
    exportedAt: '2026-09-27T00:00:00.000Z',
    overrides,
  })
}
