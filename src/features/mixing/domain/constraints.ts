import { formatKey } from '@/shared/music'
import { moveBetween } from './chart'
import type { MixTrack } from './types'

/** User constraints (decision #8): no positional pinning. */
export interface MixConstraints {
  start: string | null
  end: string | null
  /** "A must be followed by B" pairs; may chain (A → B, B → C). */
  follows: readonly (readonly [string, string])[]
  excluded: readonly string[]
}

export const NO_CONSTRAINTS: MixConstraints = { start: null, end: null, follows: [], excluded: [] }

export type ConstraintError =
  | { kind: 'unknown-track'; id: string }
  | { kind: 'excluded-in-constraint'; id: string }
  | { kind: 'start-is-end'; id: string }
  | { kind: 'self-follow'; id: string }
  | { kind: 'clash-pair'; from: string; to: string }
  | { kind: 'branch-out'; from: string; to: readonly [string, string] }
  | { kind: 'branch-in'; to: string; from: readonly [string, string] }
  | { kind: 'cycle'; ids: string[] }
  | { kind: 'start-has-predecessor'; id: string; predecessor: string }
  | { kind: 'end-has-successor'; id: string; successor: string }
  | { kind: 'chain-closes-early'; ids: string[] }

/**
 * Checks constraints against the tracks that will be mixed (excluded tracks included,
 * so they can be reported). Returns every problem found, in a stable order.
 */
export function validateConstraints(
  tracks: readonly MixTrack[],
  constraints: MixConstraints,
): ConstraintError[] {
  const errors: ConstraintError[] = []
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const excluded = new Set(constraints.excluded)
  const includedCount = tracks.filter((t) => !excluded.has(t.id)).length

  const referenced = [
    constraints.start,
    constraints.end,
    ...constraints.follows.flatMap(([a, b]) => [a, b]),
  ].filter((id): id is string => id !== null)
  for (const id of new Set(referenced)) {
    if (!byId.has(id)) errors.push({ kind: 'unknown-track', id })
    else if (excluded.has(id)) errors.push({ kind: 'excluded-in-constraint', id })
  }

  if (constraints.start !== null && constraints.start === constraints.end && includedCount > 1) {
    errors.push({ kind: 'start-is-end', id: constraints.start })
  }

  const next = new Map<string, string>()
  const prev = new Map<string, string>()
  for (const [from, to] of constraints.follows) {
    if (from === to) {
      errors.push({ kind: 'self-follow', id: from })
      continue
    }
    const a = byId.get(from)
    const b = byId.get(to)
    if (a && b && moveBetween(a.camelot, b.camelot) === null) {
      errors.push({ kind: 'clash-pair', from, to })
    }
    const existingNext = next.get(from)
    if (existingNext !== undefined && existingNext !== to) {
      errors.push({ kind: 'branch-out', from, to: [existingNext, to] })
    } else next.set(from, to)
    const existingPrev = prev.get(to)
    if (existingPrev !== undefined && existingPrev !== from) {
      errors.push({ kind: 'branch-in', to, from: [existingPrev, from] })
    } else prev.set(to, from)
  }

  // Cycles: walk each chain from every node; a revisit within one walk is a cycle.
  const reported = new Set<string>()
  for (const origin of next.keys()) {
    const seen: string[] = []
    let cursor: string | undefined = origin
    while (cursor !== undefined && !seen.includes(cursor)) {
      seen.push(cursor)
      cursor = next.get(cursor)
    }
    if (cursor !== undefined) {
      const cycle = seen.slice(seen.indexOf(cursor))
      const key = [...cycle].sort().join(',')
      if (!reported.has(key)) {
        reported.add(key)
        errors.push({ kind: 'cycle', ids: cycle })
      }
    }
  }

  if (constraints.start !== null) {
    const predecessor = prev.get(constraints.start)
    if (predecessor !== undefined) {
      errors.push({ kind: 'start-has-predecessor', id: constraints.start, predecessor })
    }
  }
  if (constraints.end !== null) {
    const successor = next.get(constraints.end)
    if (successor !== undefined) {
      errors.push({ kind: 'end-has-successor', id: constraints.end, successor })
    }
  }

  // A chain from start that reaches end would close the mix before the other tracks.
  if (constraints.start !== null && constraints.end !== null && reported.size === 0) {
    const chain = [constraints.start]
    let cursor = next.get(constraints.start)
    while (cursor !== undefined && !chain.includes(cursor)) {
      chain.push(cursor)
      if (cursor === constraints.end) break
      cursor = next.get(cursor)
    }
    if (chain[chain.length - 1] === constraints.end && chain.length < includedCount) {
      errors.push({ kind: 'chain-closes-early', ids: chain })
    }
  }

  return errors
}

export type TrackNamer = (id: string) => string

/** "Bloodstream (2A · E♭ minor)"-style name for messages. */
export function describeTrack(track: MixTrack | undefined, id: string): string {
  return track ? `${track.label} (${formatKey(track.camelot)})` : `an unknown track (${id})`
}

/** Plain-English message for a constraint error. */
export function describeConstraintError(error: ConstraintError, name: TrackNamer): string {
  switch (error.kind) {
    case 'unknown-track':
      return `${name(error.id)} can’t be mixed: it isn’t in the playlist or has no key or BPM.`
    case 'excluded-in-constraint':
      return `${name(error.id)} is excluded but also used in a constraint.`
    case 'start-is-end':
      return `${name(error.id)} can’t be both the first and the last track.`
    case 'self-follow':
      return `${name(error.id)} can’t follow itself.`
    case 'clash-pair':
      return `${name(error.from)} → ${name(error.to)} is a clash on the chart, so it can’t be a required pair.`
    case 'branch-out':
      return `${name(error.from)} can only be followed by one track, not both ${name(error.to[0])} and ${name(error.to[1])}.`
    case 'branch-in':
      return `${name(error.to)} can only follow one track, not both ${name(error.from[0])} and ${name(error.from[1])}.`
    case 'cycle':
      return `The required pairs form a loop: ${[...error.ids, error.ids[0] ?? ''].map(name).join(' → ')}.`
    case 'start-has-predecessor':
      return `${name(error.id)} is the first track, but ${name(error.predecessor)} must come before it.`
    case 'end-has-successor':
      return `${name(error.id)} is the last track, but ${name(error.successor)} must come after it.`
    case 'chain-closes-early':
      return `The required pairs lead from the first track straight to the last (${error.ids.map(name).join(' → ')}), leaving no room for the others.`
  }
}
