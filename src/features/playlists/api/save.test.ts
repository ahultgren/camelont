import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { createPlaylist, replacePlaylist } from './save'
import { createSpotifyApi, SPOTIFY_API } from './spotify-api'

const auth = { getToken: () => Promise.resolve('tok'), refresh: () => Promise.resolve(null) }
const api = () => createSpotifyApi(auth)

const uris = (count: number) =>
  Array.from({ length: count }, (_, i) => `spotify:track:${String(i)}`)
const request = (count: number) => ({ name: 'Friday mix', description: 'A mix', uris: uris(count) })
const refuse = (status: number, message: string) =>
  HttpResponse.json({ error: { status, message } }, { status })

/** Records every request Spotify gets, in order, and answers the writes. */
function spotify(answers: Partial<Record<string, () => Response>> = {}) {
  const calls: { call: string; body: unknown }[] = []
  const answer = async (call: string, req: Request, fallback: () => Response) => {
    calls.push({ call, body: await req.json() })
    return (answers[call] ?? fallback)()
  }
  server.use(
    http.post(`${SPOTIFY_API}/me/playlists`, ({ request: req }) =>
      answer('POST /me/playlists', req, () =>
        HttpResponse.json(
          { id: 'new', external_urls: { spotify: 'https://open.spotify.com/playlist/new' } },
          { status: 201 },
        ),
      ),
    ),
    http.put(`${SPOTIFY_API}/playlists/:id/items`, ({ request: req, params }) =>
      answer(`PUT /playlists/${String(params.id)}/items`, req, () =>
        HttpResponse.json({ snapshot_id: 's' }),
      ),
    ),
    http.post(`${SPOTIFY_API}/playlists/:id/items`, ({ request: req, params }) =>
      answer(`POST /playlists/${String(params.id)}/items`, req, () =>
        HttpResponse.json({ snapshot_id: 's' }, { status: 201 }),
      ),
    ),
    // Spotify answers a change of details with an empty body.
    http.put(`${SPOTIFY_API}/playlists/:id`, ({ request: req, params }) =>
      answer(
        `PUT /playlists/${String(params.id)}`,
        req,
        () => new HttpResponse(null, { status: 200 }),
      ),
    ),
  )
  return calls
}
const urisOf = (body: unknown) => (body as { uris: string[] }).uris

describe('creating a playlist for a save', () => {
  it('creates a private playlist and adds the tracks in order', async () => {
    const calls = spotify()
    await expect(createPlaylist(api(), request(3))).resolves.toEqual({
      ok: true,
      id: 'new',
      url: 'https://open.spotify.com/playlist/new',
    })
    expect(calls).toEqual([
      {
        call: 'POST /me/playlists',
        body: { name: 'Friday mix', description: 'A mix', public: false },
      },
      { call: 'POST /playlists/new/items', body: { uris: uris(3) } },
    ])
  })

  it('says nothing was written when the playlist couldn’t be created', async () => {
    const calls = spotify({ 'POST /me/playlists': () => refuse(500, 'Server error') })
    await expect(createPlaylist(api(), request(3))).resolves.toEqual({
      ok: false,
      kind: 'failed',
      reason: 'Server error',
      created: null,
    })
    expect(calls).toHaveLength(1)
  })

  it('says the new playlist is incomplete when its tracks couldn’t all be added', async () => {
    let batches = 0
    spotify({
      'POST /playlists/new/items': () =>
        ++batches === 1
          ? HttpResponse.json({ snapshot_id: 's' }, { status: 201 })
          : refuse(502, 'Bad gateway'),
    })
    await expect(createPlaylist(api(), request(150))).resolves.toEqual({
      ok: false,
      kind: 'incomplete',
      reason: 'Bad gateway',
      created: { id: 'new', url: 'https://open.spotify.com/playlist/new' },
    })
  })
})

describe('replacing the playlist of an earlier save', () => {
  it('replaces the tracks with the first hundred, adds the rest, then renames', async () => {
    const calls = spotify()
    await expect(replacePlaylist(api(), 'mine', request(250))).resolves.toEqual({
      ok: true,
      detailsFailed: null,
    })
    expect(calls.map(({ call }) => call)).toEqual([
      'PUT /playlists/mine/items',
      'POST /playlists/mine/items',
      'POST /playlists/mine/items',
      'PUT /playlists/mine',
    ])
    expect(urisOf(calls[0]?.body)).toEqual(uris(250).slice(0, 100))
    expect(urisOf(calls[1]?.body)).toEqual(uris(250).slice(100, 200))
    expect(urisOf(calls[2]?.body)).toEqual(uris(250).slice(200))
    expect(calls[3]?.body).toEqual({ name: 'Friday mix', description: 'A mix' })
  })

  it('needs no second write for a hundred tracks or fewer', async () => {
    const calls = spotify()
    await replacePlaylist(api(), 'mine', request(100))
    expect(calls.map(({ call }) => call)).toEqual([
      'PUT /playlists/mine/items',
      'PUT /playlists/mine',
    ])
  })

  it.each([404, 405])(
    'says replacing isn’t available when Spotify answers %i, and writes nothing more',
    async (status) => {
      const calls = spotify({ 'PUT /playlists/mine/items': () => refuse(status, 'No such route') })
      await expect(replacePlaylist(api(), 'mine', request(150))).resolves.toEqual({
        ok: false,
        kind: 'unavailable',
        reason: 'No such route',
      })
      expect(calls).toHaveLength(1)
    },
  )

  it('says so when Spotify forbids the write', async () => {
    const calls = spotify({
      'PUT /playlists/mine/items': () => refuse(403, 'Insufficient client scope'),
    })
    await expect(replacePlaylist(api(), 'mine', request(5))).resolves.toEqual({
      ok: false,
      kind: 'forbidden',
      reason: 'Insufficient client scope',
    })
    expect(calls).toHaveLength(1)
  })

  it('says the playlist is incomplete when a later batch fails', async () => {
    const calls = spotify({ 'POST /playlists/mine/items': () => refuse(502, 'Bad gateway') })
    await expect(replacePlaylist(api(), 'mine', request(150))).resolves.toEqual({
      ok: false,
      kind: 'incomplete',
      reason: 'Bad gateway',
    })
    // The name is not touched once the tracks fell short.
    expect(calls.map(({ call }) => call)).toEqual([
      'PUT /playlists/mine/items',
      'POST /playlists/mine/items',
    ])
  })

  it('still counts as replaced when only the name wasn’t taken', async () => {
    spotify({ 'PUT /playlists/mine': () => refuse(404, 'Not found') })
    await expect(replacePlaylist(api(), 'mine', request(5))).resolves.toEqual({
      ok: true,
      detailsFailed: 'Not found',
    })
  })

  it('rejects an answer that isn’t the route’s', async () => {
    spotify({ 'PUT /playlists/mine/items': () => HttpResponse.json('<html>nope</html>') })
    await expect(replacePlaylist(api(), 'mine', request(5))).resolves.toMatchObject({
      ok: false,
      kind: 'failed',
    })
  })
})

describe('whose a playlist is', () => {
  const me = http.get(`${SPOTIFY_API}/me`, () => HttpResponse.json({ id: 'me' }))
  const playlist = (owner: string, extra: Record<string, unknown> = {}) => ({
    id: 'p1',
    name: 'Friday mix',
    images: [],
    owner: { id: owner },
    external_urls: { spotify: 'https://open.spotify.com/playlist/p1' },
    ...extra,
  })

  it('is mine when I own it, with its name and link as they are now', async () => {
    server.use(
      me,
      http.get(`${SPOTIFY_API}/playlists/p1`, () => HttpResponse.json(playlist('me'))),
    )
    await expect(api().playlistAccess('p1')).resolves.toEqual({
      kind: 'mine',
      name: 'Friday mix',
      url: 'https://open.spotify.com/playlist/p1',
    })
  })

  it('is not mine when someone else owns it, also when it is collaborative', async () => {
    server.use(
      me,
      http.get(`${SPOTIFY_API}/playlists/p1`, () =>
        HttpResponse.json(playlist('friend', { collaborative: true })),
      ),
    )
    await expect(api().playlistAccess('p1')).resolves.toEqual({ kind: 'notYours' })
  })

  it.each([404, 403])('is gone when Spotify answers %i', async (status) => {
    server.use(
      me,
      http.get(`${SPOTIFY_API}/playlists/p1`, () => refuse(status, 'Nope')),
    )
    await expect(api().playlistAccess('p1')).resolves.toEqual({ kind: 'gone' })
  })

  it('throws when Spotify can’t be reached, so that nobody takes silence for a yes', async () => {
    server.use(
      me,
      http.get(`${SPOTIFY_API}/playlists/p1`, () => refuse(500, 'Server error')),
    )
    await expect(api().playlistAccess('p1')).rejects.toThrow('Server error')
  })
})
