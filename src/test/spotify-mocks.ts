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

const track = (id: string, name: string) => ({
  is_local: false,
  item: {
    type: 'track',
    id,
    uri: `spotify:track:${id}`,
    name,
    duration_ms: 200_000,
    is_local: false,
    artists: [{ name: 'Someone' }],
    album: { images: [] },
  },
})

/**
 * A second playlist of the user's: two tracks the WCS set also has, two of its own,
 * and two items that can't be mixed (a local file and an episode).
 */
export const slowItems = () => [
  ...wcsItems().slice(0, 2),
  track('slow1', 'Slow one'),
  track('slow2', 'Slow two'),
  { is_local: true, item: null },
  { is_local: false, item: { type: 'episode' } },
]

/**
 * Handlers for a logged-in user "me" with two playlists of their own (WCS, Slow ones)
 * and a followed one.
 */
export const spotifyHandlers = () => [
  http.get(`${SPOTIFY}/me`, () => HttpResponse.json({ id: 'me', display_name: 'Me' })),
  http.get(`${SPOTIFY}/me/playlists`, () =>
    HttpResponse.json({
      items: [
        playlistDto('wcs', 'WCS', 'me'),
        playlistDto('slow', 'Slow ones', 'me', 6),
        playlistDto('top', 'Top Hits', 'spotify', 50),
      ],
      next: null,
    }),
  ),
  // The playlists themselves, as a set reads them: with the version Spotify has now.
  http.get(`${SPOTIFY}/playlists/wcs`, () =>
    HttpResponse.json({ ...playlistDto('wcs', 'WCS', 'me'), snapshot_id: 'wcs-1' }),
  ),
  http.get(`${SPOTIFY}/playlists/slow`, () =>
    HttpResponse.json({ ...playlistDto('slow', 'Slow ones', 'me', 6), snapshot_id: 'slow-1' }),
  ),
  http.get(`${SPOTIFY}/playlists/wcs/items`, () =>
    HttpResponse.json({ items: wcsItems(), next: null }),
  ),
  http.get(`${SPOTIFY}/playlists/slow/items`, () =>
    HttpResponse.json({ items: slowItems(), next: null }),
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
