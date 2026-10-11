import { shallowRef } from 'vue'
import { usePlaylistReader } from '@/features/playlists'
import type { PlaylistCopy } from '../domain/set'
import { useSetsDeps } from './deps'
import { toPlaylistCopy } from './usePlaylistChanges'

export type ReadState =
  | { status: 'idle' }
  /** `done` playlists are read; `playlist` is the one being read now. */
  | { status: 'reading'; done: number; total: number; playlist: string }
  | { status: 'failed'; playlist: string; message: string }

const UNREADABLE = {
  gone: 'Spotify no longer has it, or won’t show it to you',
  notYours:
    'it isn’t yours, and Spotify only shares the tracks of playlists you own or collaborate on',
}

/**
 * Reads playlists for a set's stored copies (spec §8.2), one at a time, as they are in
 * Spotify now and with their `snapshot_id`. A failed read stops there; what was read
 * is kept, so trying again reads only what is still missing.
 */
export function useReadPlaylists() {
  const read = usePlaylistReader()
  const deps = useSetsDeps()
  const state = shallowRef<ReadState>({ status: 'idle' })
  const copies = new Map<string, PlaylistCopy>()
  let run = 0

  /** The copies in the order asked for; null when a read failed (see `state`) or was abandoned. */
  async function readAll(
    playlists: readonly { id: string; name: string }[],
  ): Promise<PlaylistCopy[] | null> {
    const mine = ++run
    const fail = (playlist: string, message: string) => {
      state.value = { status: 'failed', playlist, message }
      return null
    }
    for (const [done, playlist] of playlists.entries()) {
      if (copies.has(playlist.id)) continue
      state.value = { status: 'reading', done, total: playlists.length, playlist: playlist.name }
      try {
        const reading = await read(playlist.id)
        if (mine !== run) return null
        if (reading.kind === 'unreadable') return fail(playlist.name, UNREADABLE[reading.reason])
        // Without a known snapshot a playlist is always read.
        if (reading.kind !== 'read') return fail(playlist.name, 'Spotify gave no tracks')
        copies.set(playlist.id, toPlaylistCopy(playlist.id, reading, deps.now()))
      } catch (error) {
        if (mine !== run) return null
        return fail(playlist.name, error instanceof Error ? error.message : String(error))
      }
    }
    const all = playlists.flatMap((playlist) => copies.get(playlist.id) ?? [])
    copies.clear()
    state.value = { status: 'idle' }
    return all
  }

  /** Forgets what was read and abandons a run in flight. */
  function reset(): void {
    run++
    copies.clear()
    state.value = { status: 'idle' }
  }

  return { state, readAll, reset }
}
