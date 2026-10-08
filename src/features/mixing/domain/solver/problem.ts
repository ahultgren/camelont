import { ARC_PRESETS, ARC_SIGNALS, arcPosition, arcTarget, arcTermCost, normalise } from '../arc'
import type { MixConstraints } from '../constraints'
import { arcRange, transitionCost } from '../evaluate'
import type { MixProfile } from '../profile'
import type { MixTrack } from '../types'

/**
 * The search problem: included tracks collapsed into blocks (follow-chains), with a
 * legal-move digraph between blocks. Clashes are never edges. All costs come from
 * evaluate.ts, so the solver and the UI score identically.
 */
export interface Problem {
  profile: MixProfile
  /** Included tracks; indices below refer to this array. */
  tracks: MixTrack[]
  /** Block → track indices in order. A block's in-key is its first track, out-key its last. */
  blocks: number[][]
  startBlock: number
  endBlock: number
  /** Legal successors / predecessors of each block. */
  succ: number[][]
  pred: number[][]
  /** Transition cost from block a's last track to block b's first (B × B; NaN if illegal). */
  edgeCost: Float64Array
  /** Sum of the fixed transition costs inside blocks. */
  internalCost: number
  /** Arc cost of track t at position p (n × n), or null without an arc. */
  arcCost: Float64Array | null
  /** The same arc terms split into values and targets, for the search's lower bound. */
  arcBound: ArcBoundInput | null
}

/** arcTermCost(t, p) = weight × |values[t] − targets[p]| (see arc.ts). */
export interface ArcBoundInput {
  weight: number
  values: readonly number[]
  targets: readonly number[]
}

export const NO_BLOCK = -1

/** Tracks that take part: not excluded. */
export function includedTracks(
  tracks: readonly MixTrack[],
  constraints: MixConstraints,
): MixTrack[] {
  const excluded = new Set(constraints.excluded)
  return tracks.filter((t) => !excluded.has(t.id))
}

/** Collapse follow pairs into chains. Assumes validated constraints (no cycles/branches). */
export function buildBlocks(
  tracks: readonly MixTrack[],
  follows: MixConstraints['follows'],
): number[][] {
  const index = new Map(tracks.map((t, i) => [t.id, i]))
  const next = new Map<number, number>()
  const hasPrev = new Set<number>()
  for (const [from, to] of follows) {
    const a = index.get(from)
    const b = index.get(to)
    if (a === undefined || b === undefined) continue
    next.set(a, b)
    hasPrev.add(b)
  }
  const blocks: number[][] = []
  tracks.forEach((_, i) => {
    if (hasPrev.has(i)) return
    const block = [i]
    let cursor = next.get(i)
    while (cursor !== undefined) {
      block.push(cursor)
      cursor = next.get(cursor)
    }
    blocks.push(block)
  })
  return blocks
}

export function buildProblem(
  included: readonly MixTrack[],
  constraints: MixConstraints,
  profile: MixProfile,
): Problem {
  const tracks = [...included]
  const blocks = buildBlocks(tracks, constraints.follows)
  const B = blocks.length
  const first = (b: number) => tracks[blocks[b]?.[0] ?? -1]
  const last = (b: number) => {
    const block = blocks[b] ?? []
    return tracks[block[block.length - 1] ?? -1]
  }
  const blockOf = (id: string | null): number =>
    id === null ? NO_BLOCK : blocks.findIndex((block) => block.some((t) => tracks[t]?.id === id))

  let internalCost = 0
  for (const block of blocks) {
    for (let i = 1; i < block.length; i++) {
      const a = tracks[block[i - 1] ?? -1]
      const b = tracks[block[i] ?? -1]
      if (a && b) internalCost += transitionCost(a, b, profile).cost
    }
  }

  const edgeCost = new Float64Array(B * B).fill(NaN)
  const succ: number[][] = blocks.map(() => [])
  const pred: number[][] = blocks.map(() => [])
  for (let a = 0; a < B; a++) {
    const from = last(a)
    for (let b = 0; b < B; b++) {
      const to = first(b)
      if (a === b || !from || !to) continue
      const t = transitionCost(from, to, profile)
      if (t.move === 'clash') continue
      edgeCost[a * B + b] = t.cost
      succ[a]?.push(b)
      pred[b]?.push(a)
    }
  }

  let arcCost: Float64Array | null = null
  let arcBound: ArcBoundInput | null = null
  const range = arcRange(tracks, profile)
  if (profile.arc && range) {
    const arc = profile.arc
    const n = tracks.length
    arcCost = new Float64Array(n * n)
    for (let t = 0; t < n; t++) {
      const track = tracks[t]
      if (!track) continue
      for (let p = 0; p < n; p++) arcCost[t * n + p] = arcTermCost(track, p, n, arc, range)
    }
    const values = tracks.map(ARC_SIGNALS[arc.signal])
    if (values.every((v) => v !== null)) {
      arcBound = {
        weight: arc.weight,
        values: values.map((v) => normalise(v, range)),
        targets: tracks.map((_, p) => arcTarget(ARC_PRESETS[arc.preset], arcPosition(p, n))),
      }
    }
  }

  return {
    profile,
    tracks,
    blocks,
    startBlock: blockOf(constraints.start),
    endBlock: blockOf(constraints.end),
    succ,
    pred,
    edgeCost,
    internalCost,
    arcCost,
    arcBound,
  }
}

/** Track order of a block path. */
export function expandPath(problem: Problem, path: readonly number[]): MixTrack[] {
  return path.flatMap((b) =>
    (problem.blocks[b] ?? []).map((t) => {
      const track = problem.tracks[t]
      if (!track) throw new Error(`Track index ${t} out of range`)
      return track
    }),
  )
}

/** Whether every consecutive pair of blocks is a legal edge and start/end hold. */
export function isLegalPath(problem: Problem, path: readonly number[]): boolean {
  const B = problem.blocks.length
  if (path.length !== B || new Set(path).size !== B) return false
  if (problem.startBlock !== NO_BLOCK && path[0] !== problem.startBlock) return false
  if (problem.endBlock !== NO_BLOCK && path[B - 1] !== problem.endBlock) return false
  for (let i = 1; i < path.length; i++) {
    if (Number.isNaN(problem.edgeCost[(path[i - 1] ?? 0) * B + (path[i] ?? 0)])) return false
  }
  return true
}

/** Full objective of a block path; equals `evaluateMix(expandPath(...)).totalCost`. */
export function pathCost(problem: Problem, path: readonly number[]): number {
  const B = problem.blocks.length
  const n = problem.tracks.length
  let cost = problem.internalCost
  for (let i = 1; i < path.length; i++) {
    cost += problem.edgeCost[(path[i - 1] ?? 0) * B + (path[i] ?? 0)] ?? NaN
  }
  if (problem.arcCost) {
    let pos = 0
    for (const b of path) {
      for (const t of problem.blocks[b] ?? []) cost += problem.arcCost[t * n + pos++] ?? 0
    }
  }
  return cost
}
