import { sameOrder } from './set'
import type { Selection } from './select'

/**
 * What an update changed (spec §9, W4): the workspace keeps what it last showed, and
 * after each update says how the new state differs from it.
 */

/** What the workspace showed once it had settled. */
export interface SettledState {
  /** The tracks in the set, in pool order. */
  inSet: readonly string[]
  /** Per limited playlist, the tracks it picked. */
  picks: ReadonlyMap<string, readonly string[]>
  /** The shown mix; null while a problem was shown in its place. */
  mix: { order: readonly string[]; cost: number } | null
}

export interface PickChange {
  playlistId: string
  /** Picked before, and no longer in the set. */
  out: string[]
  /** Picked now, and not in the set before. */
  in: string[]
}

export interface ChangeSummary {
  /** Tracks now in the set that were not, in the new set's order. */
  joined: string[]
  /** Tracks no longer in the set, in the old set's order. */
  left: string[]
  /** Playlists whose picks changed (spec §8.4: "names what went out and what came in"). */
  picks: PickChange[]
  /** How many tracks were and are in the set. */
  tracks: { before: number; after: number }
  /** Total cost of the shown mix; null on a side that had no mix. */
  cost: { before: number | null; after: number | null }
  /** Both sides had a mix and its order is another one. */
  reordered: boolean
  /** False when the update changed nothing that is shown. */
  changed: boolean
}

/** A selection and the shown mix as a settled state. */
export function settledState(selection: Selection | null, mix: SettledState['mix']): SettledState {
  const picks = new Map<string, string[]>()
  for (const playlist of selection?.playlists ?? []) {
    const picked = playlist.tracks
      .filter((row) => row.status.reason === 'picked')
      .map((row) => row.trackId)
    if (picked.length > 0) picks.set(playlist.playlistId, picked)
  }
  return { inSet: selection?.inSet ?? [], picks, mix }
}

/**
 * A pick change is a track that came or went *through a pick*: a pick that left the set,
 * or a track that joined it by being picked. A pick the user locked is still in the set,
 * and a track that stays when a limit arrives was there already; neither is a change.
 */
export function summariseChange(before: SettledState, after: SettledState): ChangeSummary {
  const was = new Set(before.inSet)
  const is = new Set(after.inSet)
  const joined = after.inSet.filter((trackId) => !was.has(trackId))
  const left = before.inSet.filter((trackId) => !is.has(trackId))

  const picks = [...new Set([...after.picks.keys(), ...before.picks.keys()])]
    .map((playlistId) => ({
      playlistId,
      out: (before.picks.get(playlistId) ?? []).filter((trackId) => !is.has(trackId)),
      in: (after.picks.get(playlistId) ?? []).filter((trackId) => !was.has(trackId)),
    }))
    .filter((change) => change.out.length > 0 || change.in.length > 0)

  const cost = { before: before.mix?.cost ?? null, after: after.mix?.cost ?? null }
  const reordered =
    before.mix !== null && after.mix !== null && !sameOrder(before.mix.order, after.mix.order)
  return {
    joined,
    left,
    picks,
    tracks: { before: before.inSet.length, after: after.inSet.length },
    cost,
    reordered,
    changed: joined.length > 0 || left.length > 0 || reordered || cost.before !== cost.after,
  }
}
