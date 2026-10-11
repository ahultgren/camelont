import { http, HttpResponse } from 'msw'
import { SPOTIFY } from './spotify-mocks'

/**
 * A stand-in for the user's Spotify as far as saving goes: playlists that can be listed
 * and looked at, and every write recorded, so a test can say exactly which playlists
 * were written to.
 */

export interface FakePlaylist {
  name: string
  owner: string
  collaborative?: boolean
}
export interface SpotifyWrite {
  method: string
  path: string
  body: unknown
}

/**
 * `handlers` go to MSW. `fail` makes matching requests fail with a status: `create`,
 * `set items`, `add items`, `details`, or `GET <playlist id>`.
 */
export function fakeSpotify(initial: Record<string, FakePlaylist> = {}) {
  // Copies: a test may rename a playlist, and the next test starts from `initial` again.
  const playlists = new Map<string, FakePlaylist>(
    Object.entries(initial).map(([id, playlist]) => [id, { ...playlist }]),
  )
  const writes: SpotifyWrite[] = []
  const fail = new Map<string, number>()
  let created = 0
  let listFails = false
  const dto = (id: string, playlist: FakePlaylist) => ({
    id,
    name: playlist.name,
    images: [],
    collaborative: playlist.collaborative ?? false,
    owner: { id: playlist.owner, display_name: playlist.owner },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
    snapshot_id: 'snap-1',
  })
  const refused = (status: number) =>
    HttpResponse.json({ error: { status, message: `Spotify said ${String(status)}` } }, { status })
  const write = async (request: Request, kind: string): Promise<Response | null> => {
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname.replace('/v1', ''),
      body: await request.json(),
    })
    const status = fail.get(kind)
    return status === undefined ? null : refused(status)
  }
  const handlers = [
    http.get(`${SPOTIFY}/me`, () => HttpResponse.json({ id: 'me', display_name: 'Me' })),
    // Two pages, to be sure a name on the second one is seen.
    http.get(`${SPOTIFY}/me/playlists`, ({ request }) => {
      if (listFails) return refused(500)
      const all = [...playlists].map(([id, playlist]) => dto(id, playlist))
      const second = new URL(request.url).searchParams.get('offset') === '2'
      return HttpResponse.json(
        second
          ? { items: all.slice(2), next: null }
          : {
              items: all.slice(0, 2),
              next: all.length > 2 ? `${SPOTIFY}/me/playlists?limit=50&offset=2` : null,
            },
      )
    }),
    http.get(`${SPOTIFY}/playlists/:id`, ({ params }) => {
      const id = String(params.id)
      const status = fail.get(`GET ${id}`)
      if (status !== undefined) return refused(status)
      const playlist = playlists.get(id)
      return playlist ? HttpResponse.json(dto(id, playlist)) : refused(404)
    }),
    http.post(`${SPOTIFY}/me/playlists`, async ({ request }) => {
      const failed = await write(request, 'create')
      if (failed) return failed
      const id = `new-${String(++created)}`
      const { name } = writes.at(-1)?.body as { name: string }
      playlists.set(id, { name, owner: 'me' })
      return HttpResponse.json(
        { id, external_urls: { spotify: `https://open.spotify.com/playlist/${id}` } },
        { status: 201 },
      )
    }),
    http.put(`${SPOTIFY}/playlists/:id/items`, async ({ request }) => {
      return (await write(request, 'set items')) ?? HttpResponse.json({ snapshot_id: 's' })
    }),
    http.post(`${SPOTIFY}/playlists/:id/items`, async ({ request }) => {
      return (
        (await write(request, 'add items')) ??
        HttpResponse.json({ snapshot_id: 's' }, { status: 201 })
      )
    }),
    http.put(`${SPOTIFY}/playlists/:id`, async ({ request, params }) => {
      const failed = await write(request, 'details')
      if (failed) return failed
      const playlist = playlists.get(String(params.id))
      if (playlist) playlist.name = (writes.at(-1)?.body as { name: string }).name
      return new HttpResponse(null, { status: 200 })
    }),
  ]
  return {
    handlers,
    playlists,
    writes,
    fail,
    failList: () => {
      listFails = true
    },
    /** The playlists that were written to, each once. */
    written: () => [
      ...new Set(writes.map((entry) => /^\/playlists\/([^/]+)/.exec(entry.path)?.[1] ?? 'NEW')),
    ],
    calls: () => writes.map((entry) => `${entry.method} ${entry.path}`),
  }
}
