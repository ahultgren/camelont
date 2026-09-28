import { http, HttpResponse } from 'msw'
import wcs from './fixtures/wcs-set.json'

export const SPOTIFY = 'https://api.spotify.com/v1'
export const RECCOBEATS = 'https://api.reccobeats.com/v1'

export const playlistDto = (id: string, name: string, owner: string, total = 20) => ({
  id,
  name,
  collaborative: false,
  images: [],
  owner: { id: owner, display_name: owner },
  items: { total },
  external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
})

const toMs = (duration: string) => {
  const [m, s] = duration.split(':').map(Number)
  return ((m ?? 0) * 60 + (s ?? 0)) * 1000
}

/** The WCS set as Spotify playlist items, in its original order. */
export const wcsItems = () =>
  wcs.orders.original.ids.map((id) => {
    const t = wcs.tracks.find((x) => x.id === id)
    if (!t) throw new Error(id)
    return {
      is_local: false,
      item: {
        type: 'track',
        id: t.id,
        uri: `spotify:track:${t.id}`,
        name: t.title,
        duration_ms: toMs(t.duration),
        is_local: false,
        artists: t.artist.split(', ').map((name) => ({ name })),
        album: { images: [] },
      },
    }
  })

/** Handlers for a logged-in user "me" with the WCS playlist and a followed one. */
export const spotifyHandlers = () => [
  http.get(`${SPOTIFY}/me`, () => HttpResponse.json({ id: 'me', display_name: 'Me' })),
  http.get(`${SPOTIFY}/me/playlists`, () =>
    HttpResponse.json({
      items: [playlistDto('wcs', 'WCS', 'me'), playlistDto('top', 'Top Hits', 'spotify', 50)],
      next: null,
    }),
  ),
  http.get(`${SPOTIFY}/playlists/wcs/items`, () =>
    HttpResponse.json({ items: wcsItems(), next: null }),
  ),
]

/** ReccoBeats knowing every WCS track (corrected values) except the ones listed. */
export const reccoBeatsHandler = (unknownTitles: string[] = []) =>
  http.get(`${RECCOBEATS}/audio-features`, ({ request }) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? []
    const content = wcs.tracks
      .filter((t) => ids.includes(t.id) && !unknownTitles.some((u) => t.title.startsWith(u)))
      .map((t) => {
        const n = Number(t.camelot.slice(0, -1)) % 12
        const mode = t.camelot.endsWith('B') ? 1 : 0
        const key = ((((n - (mode ? 8 : 5)) * 7) % 12) + 12) % 12
        return {
          href: `https://open.spotify.com/track/${t.id}`,
          key,
          mode,
          tempo: t.bpm,
          energy: t.energy,
        }
      })
    return HttpResponse.json({ content })
  })
