import type { CamelotKey } from '@/shared/music'
import { moveBetween, predecessorKeys, successorKeys } from './chart'
import { describeTrack, type MixConstraints, type TrackNamer } from './constraints'
import { DEFAULT_PROFILE } from './profile'
import { buildProblem, includedTracks, NO_BLOCK, type Problem } from './solver/problem'
import type { MixTrack } from './types'

/**
 * Why no clash-free order exists (decision #7: explain, let the user fix it).
 * Track IDs refer to the entry at the relevant end of its follow-chain.
 */
export type Diagnostic =
  | {
      kind: 'isolated'
      id: string
      /** Excluded tracks that could neighbour it. */
      excludedOptions: string[]
    }
  | {
      kind: 'no-predecessor'
      id: string
      /** Keys that may come before it on the chart. */
      keys: CamelotKey[]
      excludedOptions: string[]
    }
  | { kind: 'no-successor'; id: string; keys: CamelotKey[]; excludedOptions: string[] }
  | { kind: 'too-many-openers'; ids: string[] }
  | { kind: 'too-many-closers'; ids: string[] }
  | { kind: 'shared-predecessor'; ids: string[]; predecessor: string }
  | { kind: 'shared-successor'; ids: string[]; successor: string }
  | {
      kind: 'no-order-found'
      /** The tracks with the fewest possible neighbours: likely exclusion candidates. */
      tightest: { id: string; predecessors: string[]; successors: string[] }[]
    }

const firstTrack = (p: Problem, b: number) => p.tracks[p.blocks[b]?.[0] ?? -1]
const lastTrack = (p: Problem, b: number) => {
  const block = p.blocks[b] ?? []
  return p.tracks[block[block.length - 1] ?? -1]
}

/** Legal predecessors/successors of each block, respecting start and end. */
function effectiveNeighbours(p: Problem) {
  const B = p.blocks.length
  const preds: number[][] = []
  const succs: number[][] = []
  for (let b = 0; b < B; b++) {
    preds.push(b === p.startBlock ? [] : (p.pred[b] ?? []).filter((x) => x !== p.endBlock))
    succs.push(b === p.endBlock ? [] : (p.succ[b] ?? []).filter((x) => x !== p.startBlock))
  }
  return { preds, succs }
}

/**
 * Cheap structural checks first (tracks nothing can precede or follow, bottlenecks
 * that compete for the same neighbour); otherwise a generic message listing the
 * tightest tracks. Call when the solver found no order.
 */
export function diagnose(tracks: readonly MixTrack[], constraints: MixConstraints): Diagnostic[] {
  const included = includedTracks(tracks, constraints)
  const excluded = tracks.filter((t) => constraints.excluded.includes(t.id))
  const p = buildProblem(included, constraints, DEFAULT_PROFILE)
  const B = p.blocks.length
  if (B <= 1) return []
  const { preds, succs } = effectiveNeighbours(p)
  const hasStart = p.startBlock !== NO_BLOCK
  const hasEnd = p.endBlock !== NO_BLOCK
  const out: Diagnostic[] = []

  const excludedBefore = (to: MixTrack) =>
    excluded.filter((t) => moveBetween(t.camelot, to.camelot) !== null).map((t) => t.id)
  const excludedAfter = (from: MixTrack) =>
    excluded.filter((t) => moveBetween(from.camelot, t.camelot) !== null).map((t) => t.id)

  const sources: number[] = []
  const sinks: number[] = []
  for (let b = 0; b < B; b++) {
    const noIn = b !== p.startBlock && preds[b]?.length === 0
    const noOut = b !== p.endBlock && succs[b]?.length === 0
    const first = firstTrack(p, b)
    const last = lastTrack(p, b)
    if (!first || !last) continue
    if (noIn && noOut && p.blocks[b]?.length === 1) {
      out.push({
        kind: 'isolated',
        id: first.id,
        excludedOptions: [...new Set([...excludedBefore(first), ...excludedAfter(last)])],
      })
      continue
    }
    if (noIn) sources.push(b)
    if (noOut) sinks.push(b)
  }

  // Tracks nothing can precede must open the mix; only one can (none with a start).
  const reportEnds = (
    ends: number[],
    allowed: number,
    single: (b: number) => Diagnostic | null,
    many: (ids: string[]) => Diagnostic,
    idOf: (b: number) => string | undefined,
  ) => {
    if (ends.length <= allowed) return
    if (allowed === 0) {
      for (const b of ends) {
        const d = single(b)
        if (d) out.push(d)
      }
    } else {
      out.push(many(ends.map(idOf).filter((id): id is string => id !== undefined)))
    }
  }
  reportEnds(
    sources,
    hasStart ? 0 : 1,
    (b) => {
      const t = firstTrack(p, b)
      return t
        ? {
            kind: 'no-predecessor',
            id: t.id,
            keys: predecessorKeys(t.camelot),
            excludedOptions: excludedBefore(t),
          }
        : null
    },
    (ids) => ({ kind: 'too-many-openers', ids }),
    (b) => firstTrack(p, b)?.id,
  )
  reportEnds(
    sinks,
    hasEnd ? 0 : 1,
    (b) => {
      const t = lastTrack(p, b)
      return t
        ? {
            kind: 'no-successor',
            id: t.id,
            keys: successorKeys(t.camelot),
            excludedOptions: excludedAfter(t),
          }
        : null
    },
    (ids) => ({ kind: 'too-many-closers', ids }),
    (b) => lastTrack(p, b)?.id,
  )

  // Bottlenecks: several tracks whose only possible neighbour is the same track.
  const shared = (lists: number[][], starts: boolean) => {
    const groups = new Map<number, number[]>()
    lists.forEach((list, b) => {
      const only = list[0]
      if (list.length === 1 && only !== undefined)
        groups.set(only, [...(groups.get(only) ?? []), b])
    })
    // Without a fixed start (end), one of each group could open (close) the mix.
    const spare = starts
      ? hasStart || sources.length > 0
        ? 0
        : 1
      : hasEnd || sinks.length > 0
        ? 0
        : 1
    for (const [neighbour, group] of groups) {
      if (group.length - 1 <= spare) continue
      const ids = group
        .map((b) => (starts ? firstTrack(p, b) : lastTrack(p, b))?.id)
        .filter((id): id is string => id !== undefined)
      const other = (starts ? lastTrack(p, neighbour) : firstTrack(p, neighbour))?.id
      if (!other) continue
      out.push(
        starts
          ? { kind: 'shared-predecessor', ids, predecessor: other }
          : { kind: 'shared-successor', ids, successor: other },
      )
    }
  }
  shared(preds, true)
  shared(succs, false)

  if (out.length > 0) return out

  const tightest = Array.from({ length: B }, (_, b) => b)
    .sort(
      (a, b) =>
        Math.min(preds[a]?.length ?? 0, succs[a]?.length ?? 0) -
          Math.min(preds[b]?.length ?? 0, succs[b]?.length ?? 0) ||
        (preds[a]?.length ?? 0) +
          (succs[a]?.length ?? 0) -
          (preds[b]?.length ?? 0) -
          (succs[b]?.length ?? 0),
    )
    .slice(0, 3)
    .map((b) => ({
      id: firstTrack(p, b)?.id ?? '',
      predecessors: (preds[b] ?? []).map((x) => lastTrack(p, x)?.id ?? ''),
      successors: (succs[b] ?? []).map((x) => firstTrack(p, x)?.id ?? ''),
    }))
  return [{ kind: 'no-order-found', tightest }]
}

const list = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`

const orList = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`

/** Plain-English explanation of a diagnostic. */
export function describeDiagnostic(d: Diagnostic, name: TrackNamer): string {
  const excludedHint = (ids: string[]) =>
    ids.length > 0 ? ` Excluded tracks that would fit: ${list(ids.map(name))}.` : ''
  switch (d.kind) {
    case 'isolated':
      return `${name(d.id)} can’t follow or precede any other included track, so it can’t be placed.${excludedHint(d.excludedOptions)} Exclude it, or include a track it connects to.`
    case 'no-predecessor':
      return `${name(d.id)} can’t follow any included track, and it isn’t the first track. It needs a track in ${orList(d.keys)} before it.${excludedHint(d.excludedOptions)}`
    case 'no-successor':
      return `${name(d.id)} can’t precede any included track, and it isn’t the last track. It needs a track in ${orList(d.keys)} after it.${excludedHint(d.excludedOptions)}`
    case 'too-many-openers':
      return `${list(d.ids.map(name))} can’t follow any other included track, so each would have to open the mix, but only one can.`
    case 'too-many-closers':
      return `${list(d.ids.map(name))} can’t precede any other included track, so each would have to close the mix, but only one can.`
    case 'shared-predecessor':
      return `${list(d.ids.map(name))} can only follow ${name(d.predecessor)}; only one of them can.`
    case 'shared-successor':
      return `${list(d.ids.map(name))} can only precede ${name(d.successor)}; only one of them can.`
    case 'no-order-found': {
      const lines = d.tightest.map((t) => {
        const before = t.predecessors.length
          ? `follow ${list(t.predecessors.map(name))}`
          : 'follow nothing'
        const after = t.successors.length
          ? `precede ${list(t.successors.map(name))}`
          : 'precede nothing'
        return `${name(t.id)} can only ${before} and ${after}`
      })
      return `No clash-free order was found. The tracks with the fewest options: ${lines.join('; ')}. Excluding one of them is the most likely fix.`
    }
  }
}

/** A namer over a track list, e.g. "Bloodstream (2A · E♭ minor)". */
export function trackNamer(tracks: readonly MixTrack[]): TrackNamer {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  return (id) => describeTrack(byId.get(id), id)
}
