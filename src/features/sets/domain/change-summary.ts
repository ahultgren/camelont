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

/** One part of a change summary: a short text for the line and the whole of it. */
export interface SummaryPart {
  kind: 'tracks' | 'joined' | 'left' | 'picks' | 'cost'
  text: string
  /** Every name, where `text` stops after a few. */
  full: string
}

const few = (names: readonly string[], named: number): string => {
  const more = names.length - named
  return more > 0 ? `${names.slice(0, named).join(', ')} +${more} more` : names.join(', ')
}
const cost = (value: number) => value.toFixed(1)

/**
 * A change summary in words (spec W4): how many tracks, which joined and left, which
 * picks changed, and the cost before and after. A track that came or went through a
 * pick is named with its playlist's picks, not twice.
 */
export function describeSummary(
  summary: ChangeSummary,
  title: (trackId: string) => string,
  playlistName: (playlistId: string) => string,
  named = 2,
): SummaryPart[] {
  const parts: SummaryPart[] = []
  const { before, after } = summary.tracks
  if (before !== after) {
    const text = `${before} → ${after} tracks`
    parts.push({ kind: 'tracks', text, full: `${before} tracks in the set before, ${after} now` })
  }
  const picked = new Set(summary.picks.flatMap((change) => [...change.in, ...change.out]))
  const joined = summary.joined.filter((trackId) => !picked.has(trackId)).map(title)
  const left = summary.left.filter((trackId) => !picked.has(trackId)).map(title)
  if (joined.length > 0) {
    parts.push({
      kind: 'joined',
      text: `+ ${few(joined, named)}`,
      full: `Joined the set: ${joined.join(', ')}`,
    })
  }
  if (left.length > 0) {
    parts.push({
      kind: 'left',
      text: `− ${few(left, named)}`,
      full: `Left the set: ${left.join(', ')}`,
    })
  }
  for (const change of summary.picks) {
    const out = change.out.map(title)
    const into = change.in.map(title)
    const name = playlistName(change.playlistId)
    const sides = [
      ...(out.length > 0 ? [`− ${few(out, named)}`] : []),
      ...(into.length > 0 ? [`+ ${few(into, named)}`] : []),
    ]
    parts.push({
      kind: 'picks',
      text: `${name} picks: ${sides.join(' ')}`,
      full: [
        `Picks of ${name}`,
        ...(out.length > 0 ? [`out: ${out.join(', ')}`] : []),
        ...(into.length > 0 ? [`in: ${into.join(', ')}`] : []),
      ].join('; '),
    })
  }
  const was = summary.cost.before
  const is = summary.cost.after
  if (was !== null && is !== null) {
    const same = cost(was) === cost(is)
    if (!same) {
      parts.push({
        kind: 'cost',
        text: `cost ${cost(was)} → ${cost(is)}`,
        full: `The mix cost ${cost(was)} before and costs ${cost(is)} now`,
      })
    } else if (summary.reordered) {
      parts.push({
        kind: 'cost',
        text: `new order, cost ${cost(is)}`,
        full: `Another order at the same cost, ${cost(is)}`,
      })
    }
  } else if (is !== null) {
    parts.push({
      kind: 'cost',
      text: `mix found, cost ${cost(is)}`,
      full: `There is a mix again, at cost ${cost(is)}`,
    })
  } else if (was !== null) {
    parts.push({
      kind: 'cost',
      text: 'no mix',
      full: `There was a mix at cost ${cost(was)}; now there is none`,
    })
  }
  return parts
}
