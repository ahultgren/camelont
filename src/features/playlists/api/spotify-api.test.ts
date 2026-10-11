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
    // Mine to write to is narrower than mine to mix: a friend's collaborative playlist isn't.
    expect(lists.map((l) => l.owned)).toEqual([true, false, false])
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

describe('readPlaylist', () => {
  const me = () => http.get(`${SPOTIFY_API}/me`, () => HttpResponse.json({ id: 'me' }))
  const items = (id: string, onRead: () => void = () => undefined) =>
    http.get(`${SPOTIFY_API}/playlists/${id}/items`, () => {
      onRead()
      return HttpResponse.json({ items: [track('t1', 'One'), track('t2', 'Two')], next: null })
    })

  it('reads the name, image, snapshot and tracks of a playlist of mine', async () => {
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () =>
        HttpResponse.json(playlist('p1', 'me', { snapshot_id: 'snap-2' })),
      ),
      items('p1'),
    )
    const reading = await createSpotifyApi(auth).readPlaylist('p1', 'snap-1')
    expect(reading).toMatchObject({
      kind: 'read',
      name: 'List p1',
      imageUrl: 'https://img/p1',
      snapshotId: 'snap-2',
      skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
    })
    expect(reading.kind === 'read' && reading.entries.map((e) => e.trackId)).toEqual(['t1', 't2'])
  })

  it('does not read the tracks again while the snapshot is the one it knows', async () => {
    let reads = 0
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () =>
        HttpResponse.json(playlist('p1', 'me', { snapshot_id: 'snap-1' })),
      ),
      items('p1', () => reads++),
    )
    await expect(createSpotifyApi(auth).readPlaylist('p1', 'snap-1')).resolves.toEqual({
      kind: 'unchanged',
    })
    expect(reads).toBe(0)
  })

  it('reads the tracks when Spotify gives no snapshot', async () => {
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () => HttpResponse.json(playlist('p1', 'me'))),
      items('p1'),
    )
    const reading = await createSpotifyApi(auth).readPlaylist('p1', null)
    expect(reading).toMatchObject({ kind: 'read', snapshotId: null })
  })

  it('reads a collaborative playlist someone else owns', async () => {
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () =>
        HttpResponse.json(playlist('p1', 'friend', { collaborative: true, snapshot_id: 's' })),
      ),
      items('p1'),
    )
    await expect(createSpotifyApi(auth).readPlaylist('p1', null)).resolves.toMatchObject({
      kind: 'read',
    })
  })

  it('says a playlist I only follow is not mine, without asking for its tracks', async () => {
    let reads = 0
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () => HttpResponse.json(playlist('p1', 'someone'))),
      items('p1', () => reads++),
    )
    await expect(createSpotifyApi(auth).readPlaylist('p1', 'snap-1')).resolves.toEqual({
      kind: 'unreadable',
      reason: 'notYours',
    })
    expect(reads).toBe(0)
  })

  it.each([404, 403])('says a playlist answered with %i is gone', async (status) => {
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () =>
        HttpResponse.json({ error: { status, message: 'Nope' } }, { status }),
      ),
    )
    await expect(createSpotifyApi(auth).readPlaylist('p1', 'snap-1')).resolves.toEqual({
      kind: 'unreadable',
      reason: 'gone',
    })
  })

  it('throws when Spotify fails for another reason', async () => {
    server.use(
      me(),
      http.get(`${SPOTIFY_API}/playlists/p1`, () => HttpResponse.json({}, { status: 500 })),
    )
    await expect(createSpotifyApi(auth).readPlaylist('p1', null)).rejects.toMatchObject({
      kind: 'http',
      status: 500,
    })
  })

  it('asks who I am once for several playlists', async () => {
    let asked = 0
    server.use(
      http.get(`${SPOTIFY_API}/me`, () => {
        asked++
        return HttpResponse.json({ id: 'me' })
      }),
      http.get(`${SPOTIFY_API}/playlists/:id`, ({ params }) =>
        HttpResponse.json(playlist(String(params.id), 'me', { snapshot_id: 'same' })),
      ),
    )
    const client = createSpotifyApi(auth)
    await Promise.all([client.readPlaylist('p1', 'same'), client.readPlaylist('p2', 'same')])
    expect(asked).toBe(1)
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
