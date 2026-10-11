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

/**
 * A second playlist of the user's: two tracks the WCS set also has, two of its own,
 * and two items that can't be mixed (a local file and an episode).
 */
const slowItems = (wcsTracks: WcsTrack[]) => [
  ...wcsTracks.slice(0, 2).map(item),
  ...['Slow one', 'Slow two'].map((name, i) => ({
    is_local: false,
    item: {
      type: 'track',
      id: `slow${String(i + 1)}`,
      uri: `spotify:track:slow${String(i + 1)}`,
      name,
      duration_ms: 200_000,
      is_local: false,
      artists: [{ name: 'Someone' }],
      album: { images: [] },
    },
  })),
  { is_local: true, item: null },
  { is_local: false, item: { type: 'episode' } },
]

const playlist = (id: string, name: string, owner: string, total: number) => ({
  id,
  name,
  collaborative: false,
  images: [],
  owner: { id: owner, display_name: owner === 'me' ? 'Me' : 'Spotify' },
  items: { total },
  external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
})

/** The WCS playlist's items as Spotify lists them, for a test that changes the playlist. */
export const wcsPlaylistItems = () =>
  wcs.orders.original.ids.flatMap((id) => {
    const track = wcs.tracks.find((candidate) => candidate.id === id)
    return track ? [item(track)] : []
  })

export interface SpotifyLog {
  /** The body of every `POST /me/playlists`. */
  created: unknown[]
  /** The URIs of every `POST …/items` to a playlist a save created. */
  added: string[][]
  /** Every replace of a created playlist's tracks (`PUT …/items`). */
  replaced: { id: string; uris: string[] }[]
  /** Every change of a created playlist's name and description (`PUT /playlists/{id}`). */
  renamed: { id: string; name: string }[]
  /** Any write to a playlist no save created (must stay empty). */
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

/**
 * Mocks Spotify and ReccoBeats: the user's playlists are the WCS set and "Slow ones",
 * plus a followed one. Every other external request fails.
 */
export async function mockApis(page: Page): Promise<SpotifyLog> {
  const log: SpotifyLog = { created: [], added: [], replaced: [], renamed: [], sourceWrites: [] }
  /** Playlists that saves created, by ID: `new-mix`, then `new-mix-2`, … */
  const saved = new Map<string, { name: string }>()
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
        items: [
          playlist('wcs', 'WCS', 'me', 20),
          playlist('slow', 'Slow ones', 'me', 6),
          playlist('top', 'Top Hits', 'spotify', 50),
          ...[...saved].map(([id, { name }]) => playlist(id, name, 'me', 3)),
        ],
        next: null,
      })
    }
    // A playlist a save created: it can be looked at, replaced, renamed, and (should the
    // user add it to a set) read.
    const ofSaved = /^\/playlists\/([^/]+)(\/items)?$/.exec(path)
    const savedId = ofSaved?.[1] ?? ''
    const savedPlaylist = saved.get(savedId)
    if (savedPlaylist) {
      const items = ofSaved?.[2] !== undefined
      if (method === 'GET' && !items) {
        return json(route, {
          ...playlist(savedId, savedPlaylist.name, 'me', 3),
          snapshot_id: `${savedId}-1`,
        })
      }
      if (method === 'GET') return json(route, { items: tracks.slice(0, 3).map(item), next: null })
      const body = route.request().postDataJSON() as { uris?: string[]; name?: string }
      if (method === 'POST' && items) {
        log.added.push(body.uris ?? [])
        return json(route, { snapshot_id: 'snap' }, 201)
      }
      if (method === 'PUT' && items) {
        log.replaced.push({ id: savedId, uris: body.uris ?? [] })
        return json(route, { snapshot_id: 'snap' })
      }
      if (method === 'PUT') {
        savedPlaylist.name = body.name ?? savedPlaylist.name
        log.renamed.push({ id: savedId, name: savedPlaylist.name })
        return route.fulfill({ status: 200, body: '' })
      }
    }
    // A playlist as a set reads it: with the version Spotify has now.
    if (method === 'GET' && path === '/playlists/wcs') {
      return json(route, { ...playlist('wcs', 'WCS', 'me', 20), snapshot_id: 'wcs-1' })
    }
    if (method === 'GET' && path === '/playlists/slow') {
      return json(route, { ...playlist('slow', 'Slow ones', 'me', 6), snapshot_id: 'slow-1' })
    }
    if (method === 'GET' && path === '/playlists/wcs/items') {
      return json(route, { items: tracks.map(item), next: null })
    }
    if (method === 'GET' && path === '/playlists/slow/items') {
      return json(route, { items: slowItems(tracks), next: null })
    }
    if (method === 'POST' && path === '/me/playlists') {
      const body = route.request().postDataJSON() as { name: string }
      log.created.push(body)
      const id = saved.size === 0 ? 'new-mix' : `new-mix-${String(saved.size + 1)}`
      saved.set(id, { name: body.name })
      return json(
        route,
        { id, external_urls: { spotify: `https://open.spotify.com/playlist/${id}` } },
        201,
      )
    }
    if (path.startsWith('/playlists/') && method !== 'GET') {
      log.sourceWrites.push(`${method} ${path}`)
    }
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
