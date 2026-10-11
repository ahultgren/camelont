import { shallowRef } from 'vue'
import {
  useSpotifyApi,
  type PlaylistContents,
  type PlaylistSummary,
  type SkippedItems,
} from '@/features/playlists'
import type { PlaylistCopy } from '../domain/set'
import type { MixSet } from '../domain/types'
import { useSetsStore } from '../model/sets-store'

/** A playlist that had items which can't be mixed, and what they were. */
export interface SkippedInPlaylist {
  name: string
  skipped: SkippedItems
}

export interface CreatedSet {
  set: MixSet
  skipped: SkippedInPlaylist[]
}

export type CreateState =
  | { status: 'idle' }
  /** `done` playlists are read; `playlist` is the one being read now. */
  | { status: 'reading'; done: number; total: number; playlist: string }
  | { status: 'failed'; playlist: string; message: string }
  | ({ status: 'created' } & CreatedSet)

const count = (n: number, noun: string) => `${String(n)} ${noun}${n === 1 ? '' : 's'}`

/** "2 local files, 1 episode", or '' when nothing was skipped. */
export function describeSkipped(skipped: SkippedItems): string {
  return [
    skipped.localFiles ? count(skipped.localFiles, 'local file') : '',
    skipped.episodes ? count(skipped.episodes, 'episode') : '',
    skipped.unavailable ? count(skipped.unavailable, 'unavailable track') : '',
  ]
    .filter(Boolean)
    .join(', ')
}

/** The set's own copy of a playlist as it was just read from Spotify (spec §8.2). */
function toCopy(playlist: PlaylistSummary, contents: PlaylistContents): PlaylistCopy {
  return {
    playlistId: playlist.id,
    name: playlist.name,
    imageUrl: playlist.imageUrl,
    tracks: contents.entries.map((entry) => ({
      trackId: entry.trackId,
      uri: entry.uri,
      title: entry.title,
      artists: entry.artists,
      durationMs: entry.durationMs,
      imageUrl: entry.imageUrl,
    })),
    // The items route doesn't give one; the change check reads it when the set is opened.
    snapshotId: null,
    readAt: Date.now(),
  }
}

/**
 * Creates a set from playlists: reads each one's tracks, one at a time, and only then
 * creates the set, so a failed read leaves nothing half-made. Playlists already read
 * are kept for a retry.
 */
export function useCreateSet() {
  const api = useSpotifyApi()
  const sets = useSetsStore()
  const state = shallowRef<CreateState>({ status: 'idle' })
  const read = new Map<string, { copy: PlaylistCopy; skipped: SkippedItems }>()
  let run = 0

  /** Resolves to null when a read failed (see `state`) or the run was cancelled. */
  async function create(
    name: string,
    playlists: readonly PlaylistSummary[],
  ): Promise<CreatedSet | null> {
    const first = playlists[0]
    if (!first) return null
    const mine = ++run
    for (const [done, playlist] of playlists.entries()) {
      if (read.has(playlist.id)) continue
      state.value = { status: 'reading', done, total: playlists.length, playlist: playlist.name }
      try {
        const contents = await api.getPlaylistContents(playlist.id)
        if (mine !== run) return null
        read.set(playlist.id, { copy: toCopy(playlist, contents), skipped: contents.skipped })
      } catch (error) {
        if (mine !== run) return null
        const message = error instanceof Error ? error.message : String(error)
        state.value = { status: 'failed', playlist: playlist.name, message }
        return null
      }
    }
    const results = playlists.flatMap((playlist) => read.get(playlist.id) ?? [])
    const set = sets.create({
      name: name.trim() || first.name,
      playlists: results.map((result) => result.copy),
    })
    const skipped = results
      .map((result) => ({ name: result.copy.name, skipped: result.skipped }))
      .filter((playlist) => describeSkipped(playlist.skipped) !== '')
    read.clear()
    state.value = { status: 'created', set, skipped }
    return { set, skipped }
  }

  /** Forgets what was read and abandons a run in flight: it creates nothing. */
  function reset(): void {
    run++
    read.clear()
    state.value = { status: 'idle' }
  }

  return { state, create, reset }
}
