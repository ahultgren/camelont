import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { createSpotifyApi, SPOTIFY_API } from './spotify-api'

const auth = { getToken: () => Promise.resolve('tok'), refresh: () => Promise.resolve(null) }
const api = createSpotifyApi(auth)

const playlist = (id: string, owner: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `List ${id}`,
  collaborative: false,
  images: [{ url: `https://img/${id}` }],
  owner: { id: owner, display_name: owner.toUpperCase() },
  items: { total: 20 },
  external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
  ...extra,
})

const track = (id: string | null, name: string, extra: Record<string, unknown> = {}) => ({
  is_local: false,
  item: {
    type: 'track',
    id,
    uri: `spotify:track:${id ?? 'x'}`,
    name,
    duration_ms: 200_000,
    is_local: false,
    artists: [{ name: 'Artist' }, { name: 'Feat' }],
    album: { images: [{ url: 'big' }, { url: 'small' }] },
    ...extra,
  },
})

describe('listMyPlaylists', () => {
  it('follows pages and marks followed playlists as not mixable', async () => {
    let auth: string | null = null
    server.use(
      http.get(`${SPOTIFY_API}/me`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return HttpResponse.json({ id: 'me', display_name: 'Me' })
      }),
      http.get(`${SPOTIFY_API}/me/playlists`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get('offset')
        return offset === '50'
          ? HttpResponse.json({
              items: [playlist('c', 'friend', { collaborative: true }), null],
              next: null,
            })
          : HttpResponse.json({
              items: [
                playlist('a', 'me'),
                playlist('b', 'someone', { items: undefined, tracks: { total: 7 } }),
              ],
              next: `${SPOTIFY_API}/me/playlists?limit=50&offset=50`,
            })
      }),
    )
    const lists = await api.listMyPlaylists()
    expect(auth).toBe('Bearer tok')
    expect(lists.map((l) => [l.id, l.canMix, l.trackCount, l.ownerName])).toEqual([
      ['a', true, 20, 'ME'],
      ['b', false, 7, 'SOMEONE'],
      ['c', true, 20, 'FRIEND'],
    ])
    expect(lists[0]?.imageUrl).toBe('https://img/a')
  })
})

describe('getPlaylistContents', () => {
  it('maps tracks, numbers duplicates and reports what it skipped', async () => {
    server.use(
      http.get(`${SPOTIFY_API}/playlists/p1/items`, () =>
        HttpResponse.json({
          items: [
            track('t1', 'One'),
            track('t2', 'Two'),
            track('t1', 'One again'),
            { is_local: true, item: { ...track(null, 'Local').item, is_local: true } },
            { is_local: false, item: { type: 'episode', id: 'e1' } },
            { is_local: false, item: null },
            track(null, 'Gone'),
          ],
          next: null,
        }),
      ),
    )
    const contents = await api.getPlaylistContents('p1')
    expect(contents.entries.map((e) => [e.entryId, e.trackId, e.title])).toEqual([
      ['t1', 't1', 'One'],
      ['t2', 't2', 'Two'],
      ['t1#2', 't1', 'One again'],
    ])
    expect(contents.entries[0]).toMatchObject({
      uri: 'spotify:track:t1',
      artists: ['Artist', 'Feat'],
      durationMs: 200_000,
      imageUrl: 'small',
    })
    expect(contents.skipped).toEqual({ localFiles: 1, episodes: 1, unavailable: 2 })
  })

  it('rejects a malformed page', async () => {
    server.use(
      http.get(`${SPOTIFY_API}/playlists/p1/items`, () => HttpResponse.json({ items: 'nope' })),
    )
    await expect(api.getPlaylistContents('p1')).rejects.toMatchObject({ kind: 'invalid-response' })
  })
})

describe('saving', () => {
  it('creates a private playlist', async () => {
    let body: unknown = null
    server.use(
      http.post(`${SPOTIFY_API}/me/playlists`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          { id: 'new', external_urls: { spotify: 'https://open.spotify.com/playlist/new' } },
          { status: 201 },
        )
      }),
    )
    await expect(api.createPrivatePlaylist('Mix', 'desc')).resolves.toEqual({
      id: 'new',
      url: 'https://open.spotify.com/playlist/new',
    })
    expect(body).toEqual({ name: 'Mix', description: 'desc', public: false })
  })

  it('adds items in batches of 100, in order', async () => {
    const batches: string[][] = []
    server.use(
      http.post(`${SPOTIFY_API}/playlists/new/items`, async ({ request }) => {
        batches.push(((await request.json()) as { uris: string[] }).uris)
        return HttpResponse.json({ snapshot_id: 's' }, { status: 201 })
      }),
    )
    const uris = Array.from({ length: 250 }, (_, i) => `spotify:track:${String(i)}`)
    await api.addItems('new', uris)
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50])
    expect(batches.flat()).toEqual(uris)
  })
})
