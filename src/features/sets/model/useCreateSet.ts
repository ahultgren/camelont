import { computed, shallowRef } from 'vue'
import { skippedCount } from '../domain/skipped'
import type { MixSet, SetPlaylist } from '../domain/types'
import { useSetsStore } from './sets-store'
import { useReadPlaylists } from './useReadPlaylists'

export type CreateState =
  | { status: 'idle' }
  /** `done` playlists are read; `playlist` is the one being read now. */
  | { status: 'reading'; done: number; total: number; playlist: string }
  | { status: 'failed'; playlist: string; message: string }
  /** `skipped`: the set's playlists that had items which can't be mixed. */
  | { status: 'created'; set: MixSet; skipped: SetPlaylist[] }

/**
 * Creates a set from playlists: reads each one's tracks, one at a time, and only then
 * creates the set, so a failed read leaves nothing half-made. Playlists already read
 * are kept for a retry.
 */
export function useCreateSet() {
  const sets = useSetsStore()
  const reads = useReadPlaylists()
  const created = shallowRef<Extract<CreateState, { status: 'created' }> | null>(null)
  const state = computed<CreateState>(() => created.value ?? reads.state.value)

  /** Resolves to null when a read failed (see `state`) or the run was cancelled. */
  async function create(name: string, playlists: readonly { id: string; name: string }[]) {
    const first = playlists[0]
    if (!first) return null
    const copies = await reads.readAll(playlists)
    if (!copies) return null
    const set = sets.create({ name: name.trim() || first.name, playlists: copies })
    const skipped = set.playlists.filter((playlist) => skippedCount(playlist.skipped) > 0)
    created.value = { status: 'created', set, skipped }
    return created.value
  }

  /** Forgets what was read and abandons a run in flight: it creates nothing. */
  function reset(): void {
    reads.reset()
    created.value = null
  }

  return { state, create, reset }
}
