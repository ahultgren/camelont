import { screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse, type RequestHandler } from 'msw'
import { defineComponent, h } from 'vue'
import { inlineSolverClient, type SolverClient } from '@/features/mixing'
import {
  addPlaylist,
  newSet,
  WorkspaceScreen,
  type MixSet,
  type PlaylistCopy,
} from '@/features/sets'
import { createMemoryStore, type KeyValueStore } from '@/shared/storage'
import wcs from './fixtures/wcs-set.json'
import { server } from './msw'
import { renderRoutes, route } from './render'
import { RECCOBEATS, SPOTIFY } from './spotify-mocks'
import { loggedInStorage } from './storage'
import { wcsId } from './wcs'

/**
 * Sets built from the WCS fixture's tracks, and a workspace opened on one of them: for
 * testing the workspace through the DOM. Everything external is mocked.
 */

const byId = new Map(wcs.tracks.map((track) => [track.id, track]))

/**
 * A made-up track, named by its BPM: "x100" (or "x100b" for another at that tempo). Its
 * ID has the shape of a Spotify track ID, and ReccoBeats knows it as 8A at that BPM.
 */
export const madeId = (name: string): string => `${name}n`.padEnd(22, 'A')
const MADE = /^x(\d+)[a-z]?n/

/** A stored playlist copy holding the WCS tracks with these titles (or made-up IDs). */
export function copyOf(playlistId: string, name: string, titles: readonly string[]): PlaylistCopy {
  return {
    playlistId,
    name,
    imageUrl: null,
    tracks: titles.map((title) => {
      const trackId = /^x\d+[a-z]?$/.test(title) ? madeId(title) : wcsId(title)
      const known = byId.get(trackId)
      return {
        trackId,
        uri: `spotify:track:${trackId}`,
        title: known?.title ?? `Track ${title}`,
        artists: known ? known.artist.split(', ') : ['Someone'],
        durationMs: 200_000,
        imageUrl: null,
      }
    }),
    snapshotId: 'snap-1',
    readAt: 1,
    skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
  }
}

/** A set as the store would have made it; `change` edits it before it is stored. */
export function setOf(
  playlists: readonly PlaylistCopy[],
  change: (set: MixSet) => MixSet = (set) => set,
): MixSet {
  const set = playlists.reduce(
    (soFar, copy, index) => addPlaylist(soFar, copy, index + 1),
    newSet({ id: 'friday', name: 'Friday social', now: 1 }),
  )
  return change(set)
}

/** The first eight tracks of the hand-tuned order: they mix, in several ways. */
export const CORE = [
  'Brother',
  'Love Is',
  'Girl on Fire',
  'Blank Space/Stand By Me',
  'Try',
  'I Want To Break Free',
  'Pompeii',
  'Counting Stars',
] as const

/** What ReccoBeats answers: the fixture's values, and for "x100" tracks 8A at that BPM. */
function reccoBeats(unknownTitles: readonly string[]) {
  return http.get(`${RECCOBEATS}/audio-features`, ({ request }) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? []
    const content = ids.flatMap((id) => {
      const known = byId.get(id)
      const made = MADE.exec(id)
      if (known && !unknownTitles.some((title) => known.title.startsWith(title))) {
        const n = Number(known.camelot.slice(0, -1)) % 12
        const mode = known.camelot.endsWith('B') ? 1 : 0
        const key = ((((n - (mode ? 8 : 5)) * 7) % 12) + 12) % 12
        return [
          {
            href: `https://open.spotify.com/track/${id}`,
            key,
            mode,
            tempo: known.bpm,
            energy: 0.5,
          },
        ]
      }
      // 8A is A minor: pitch class 9, mode 0.
      if (made) {
        return [
          {
            href: `https://open.spotify.com/track/${id}`,
            key: 9,
            mode: 0,
            tempo: Number(made[1]),
            energy: 0.5,
          },
        ]
      }
      return []
    })
    return HttpResponse.json({ content })
  })
}

export interface OpenWorkspaceOptions {
  /** Titles ReccoBeats has no data for. */
  unknown?: readonly string[]
  /** Where sets are stored; pass the same one again to "reload". */
  setsStore?: KeyValueStore
  overridesStore?: KeyValueStore
  solverClient?: SolverClient
  /** Which set to open; defaults to the first one given. */
  setId?: string
  /** Spotify as this test needs it; these win over the defaults. */
  handlers?: readonly RequestHandler[]
}

/** Stored sets as a page load finds them. */
export const storeOf = (...sets: MixSet[]): KeyValueStore =>
  createMemoryStore(Object.fromEntries(sets.map((set) => [set.id, { v: 1, data: set }])))

/**
 * Opens the workspace of a stored set, logged in. Spotify says every playlist is still
 * at its stored version unless a test adds its own handlers first.
 */
export async function openWorkspace(sets: MixSet | MixSet[], options: OpenWorkspaceOptions = {}) {
  const all = Array.isArray(sets) ? sets : [sets]
  server.use(
    http.get(`${SPOTIFY}/me`, () => HttpResponse.json({ id: 'me', display_name: 'Me' })),
    http.get(`${SPOTIFY}/playlists/:id`, ({ params }) =>
      HttpResponse.json({
        id: params.id,
        name: 'A playlist',
        images: [],
        owner: { id: 'me' },
        snapshot_id: 'snap-1',
      }),
    ),
    reccoBeats(options.unknown ?? []),
  )
  if (options.handlers?.length) server.use(...options.handlers)
  const setsStore = options.setsStore ?? storeOf(...all)
  const Home = () => h('h1', 'Your sets')
  const Page = defineComponent({
    props: { id: { type: String, required: true } },
    setup: (props) => () =>
      h(WorkspaceScreen, { key: props.id, setId: props.id, homeTo: { name: 'home' } }),
  })
  const page = await renderRoutes({
    routes: [
      route('/', Home, { name: 'home' }),
      route('/sets/:id', Page, { name: 'set', props: true }),
    ],
    path: `/sets/${options.setId ?? all[0]?.id ?? 'none'}`,
    storage: loggedInStorage(),
    setsStore,
    ...(options.overridesStore ? { overridesStore: options.overridesStore } : {}),
    solverClient: options.solverClient ?? inlineSolverClient,
  })
  /** The set as it is stored now (the store writes shortly after an edit). */
  const stored = async (id = all[0]?.id ?? ''): Promise<MixSet | undefined> =>
    ((await setsStore.get(id)) as { data: MixSet } | undefined)?.data
  return { ...page, setsStore, stored }
}

// ── What is on screen ──────────────────────────────────────────────────────────────

/** A playlist's section of the track list. */
export const playlist = (name: string) => within(screen.getByRole('region', { name }))

/** A track's row in a playlist's section. */
export function row(playlistName: string, title: string) {
  const found = playlist(playlistName)
    .getAllByRole('listitem')
    .find((item) => item.textContent.includes(title))
  if (!found) throw new Error(`No row for ${title} in ${playlistName}`)
  return found
}
export const inRow = (playlistName: string, title: string) => within(row(playlistName, title))

/** The titles of a playlist's rows, top to bottom. */
export const rowTitles = (playlistName: string): string[] =>
  playlist(playlistName)
    .getAllByRole('listitem')
    .map((item) => within(item).getByTestId('track-title').textContent.trim())

/** Spotify's answer for a playlist's items. */
export const itemsOf = (titles: readonly string[]) => ({
  items: copyOf('any', 'any', titles).tracks.map((track) => ({
    is_local: false,
    item: {
      type: 'track',
      id: track.trackId,
      uri: track.uri,
      name: track.title,
      duration_ms: track.durationMs,
      artists: track.artists.map((name) => ({ name })),
    },
  })),
  next: null,
})

/** Spotify's answer for a playlist of the user's own. */
export const playlistDto = (id: string, name: string, snapshotId: string) => ({
  id,
  name,
  images: [],
  owner: { id: 'me', display_name: 'Me' },
  snapshot_id: snapshotId,
})

export const mixRegion = () => screen.getByRole('region', { name: 'The mix' })
export const headline = () => within(mixRegion()).getByTestId('headline')

/** The mix (or the problems in its place) is settled: nothing newer is on its way. */
export async function settled() {
  await waitFor(
    () => {
      if (mixRegion().getAttribute('aria-busy') !== 'false') throw new Error('still working')
    },
    { timeout: 20_000 },
  )
}

/** The headline's number of tracks in the mix. */
export const tracksInMix = (): number => Number(/^(\d+)\s*tracks/.exec(headline().textContent)?.[1])
