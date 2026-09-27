import type { Prng } from '@/shared/lib'
import { NO_BLOCK, type ArcBoundInput, type Problem } from './problem'

/**
 * Partial path in the search. Paths are stored as parent links; the arrays hold the
 * bookkeeping for cheap dead-end detection:
 *
 * - availIn[r]  = legal predecessors of unvisited r that are unvisited or the last block
 * - availOut[r] = legal successors of unvisited r that are unvisited
 *
 * A node whose availIn hits 0 can never be reached; two nodes that can only follow
 * the last block can't both come next; more than one node without successors (or any
 * besides the end track) can't all be last. That's the scarcity reasoning that lets
 * low-degree tracks like Bloodstream be placed instead of stranded.
 */
interface State {
  parent: State | null
  block: number
  depth: number
  pos: number
  cost: number
  penalty: number
  lowerBound: number
  fragile: number
  sinks: number
  visited: Uint8Array
  availIn: Int16Array
  availOut: Int16Array
  h1: number
  h2: number
}

export interface SearchContext {
  problem: Problem
  B: number
  n: number
  minIn: Float64Array
  minArc: Float64Array
  zobrist1: Uint32Array
  zobrist2: Uint32Array
  penalties: Float64Array | null
  scarcityWeight: number
  arcBound: ArcBound | null
}

/**
 * Exact lower bound on the remaining arc cost, ignoring transitions: with cost
 * w × |value − target|, matching sorted values to sorted targets is optimal (1-D).
 */
interface ArcBound {
  weight: number
  /** Normalised signal per track. */
  value: Float64Array
  /** Track indices sorted by value. */
  byValue: Int32Array
  /** For each start position p, the targets of positions p..n−1, sorted. */
  targetsFrom: Float64Array[]
  blockOfTrack: Int32Array
}

export function createContext(
  problem: Problem,
  prng: Prng,
  penalties: Float64Array | null,
  scarcityWeight: number,
): SearchContext {
  const arcBound = problem.arcBound
  const B = problem.blocks.length
  const n = problem.tracks.length
  const minIn = new Float64Array(B)
  const minArc = new Float64Array(B)
  for (let b = 0; b < B; b++) {
    let best = Infinity
    for (const p of problem.pred[b] ?? [])
      best = Math.min(best, problem.edgeCost[p * B + b] ?? Infinity)
    minIn[b] = Number.isFinite(best) ? best : 0
    if (problem.arcCost && !arcBound) {
      let arc = 0
      for (const t of problem.blocks[b] ?? []) {
        let m = Infinity
        for (let p = 0; p < n; p++) m = Math.min(m, problem.arcCost[t * n + p] ?? Infinity)
        arc += m
      }
      minArc[b] = arc
    }
  }
  const zobrist1 = new Uint32Array(B)
  const zobrist2 = new Uint32Array(B)
  for (let b = 0; b < B; b++) {
    zobrist1[b] = Math.floor(prng.next() * 2 ** 32)
    zobrist2[b] = Math.floor(prng.next() * 2 ** 32)
  }
  return {
    problem,
    B,
    n,
    minIn,
    minArc,
    zobrist1,
    zobrist2,
    penalties,
    scarcityWeight,
    arcBound: arcBound ? buildArcBound(problem, arcBound) : null,
  }
}

function buildArcBound(problem: Problem, input: ArcBoundInput): ArcBound {
  const n = problem.tracks.length
  const value = Float64Array.from(input.values)
  const byValue = Int32Array.from(
    Array.from({ length: n }, (_, t) => t).sort((a, b) => (value[a] ?? 0) - (value[b] ?? 0)),
  )
  const targetsFrom = Array.from({ length: n + 1 }, (_, p) =>
    Float64Array.from(input.targets.slice(p)).sort(),
  )
  const blockOfTrack = new Int32Array(n)
  problem.blocks.forEach((block, b) => {
    for (const t of block) blockOfTrack[t] = b
  })
  return { weight: input.weight, value, byValue, targetsFrom, blockOfTrack }
}

function arcLowerBound(bound: ArcBound, visited: Uint8Array, pos: number): number {
  const targets = bound.targetsFrom[pos]
  if (!targets) return 0
  let i = 0
  let sum = 0
  for (const t of bound.byValue) {
    if (visited[bound.blockOfTrack[t] ?? 0]) continue
    sum += Math.abs((bound.value[t] ?? 0) - (targets[i++] ?? 0))
  }
  return bound.weight * sum
}

const fragility = (s: State, r: number): number =>
  ((s.availIn[r] ?? 0) <= 1 ? 1 : 0) + ((s.availOut[r] ?? 0) <= 1 ? 1 : 0)

export function rootState(ctx: SearchContext): State {
  const { problem, B } = ctx
  const availIn = new Int16Array(B)
  const availOut = new Int16Array(B)
  let lowerBound = 0
  let sinks = 0
  for (let b = 0; b < B; b++) {
    availIn[b] = problem.pred[b]?.length ?? 0
    availOut[b] = problem.succ[b]?.length ?? 0
    lowerBound += (ctx.minIn[b] ?? 0) + (ctx.minArc[b] ?? 0)
    if (availOut[b] === 0 && b !== problem.endBlock) sinks++
  }
  const root: State = {
    parent: null,
    block: NO_BLOCK,
    depth: 0,
    pos: 0,
    cost: 0,
    penalty: 0,
    lowerBound,
    fragile: 0,
    sinks,
    visited: new Uint8Array(B),
    availIn,
    availOut,
    h1: 0,
    h2: 0,
  }
  for (let b = 0; b < B; b++) root.fragile += fragility(root, b)
  return root
}

/**
 * Blocks that may open the path, or null when the root is already hopeless: another
 * block nothing can precede (beyond the one allowed opener), or too many dead ends.
 */
function openers(ctx: SearchContext, root: State): number[] | null {
  const { problem, B } = ctx
  if (root.sinks > (problem.endBlock === NO_BLOCK ? 1 : 0)) return null
  const sources = Array.from({ length: B }, (_, b) => b).filter((b) => root.availIn[b] === 0)
  if (problem.startBlock !== NO_BLOCK) {
    return sources.some((b) => b !== problem.startBlock) ? null : [problem.startBlock]
  }
  if (sources.length > 1) return null
  if (sources.length === 1) return sources
  return Array.from({ length: B }, (_, b) => b).filter((b) => b !== problem.endBlock || B === 1)
}

/** Place block `b` after `state`; null if that makes the rest impossible. */
export function expand(ctx: SearchContext, state: State, b: number): State | null {
  const { problem, B, n } = ctx
  const end = problem.endBlock
  const remaining = B - state.depth - 1
  if (b === end && remaining > 0) return null

  const visited = state.visited.slice()
  const availIn = state.availIn.slice()
  const availOut = state.availOut.slice()
  const child: State = {
    parent: state,
    block: b,
    depth: state.depth + 1,
    pos: state.pos + (problem.blocks[b]?.length ?? 0),
    cost: state.cost,
    penalty: state.penalty,
    lowerBound: state.lowerBound - (ctx.minIn[b] ?? 0) - (ctx.minArc[b] ?? 0),
    fragile: state.fragile - fragility(state, b),
    sinks: state.sinks - ((state.availOut[b] ?? 0) === 0 && b !== end ? 1 : 0),
    visited,
    availIn,
    availOut,
    h1: (state.h1 ^ (ctx.zobrist1[b] ?? 0)) >>> 0,
    h2: (state.h2 ^ (ctx.zobrist2[b] ?? 0)) >>> 0,
  }
  visited[b] = 1

  // b is no longer available as a successor.
  for (const p of problem.pred[b] ?? []) {
    if (visited[p]) continue
    const before = fragility(child, p)
    availOut[p] = (availOut[p] ?? 0) - 1
    if (availOut[p] === 0 && p !== end) child.sinks++
    child.fragile += fragility(child, p) - before
  }
  // The previous last block now has its successor; it can't precede anyone else.
  const last = state.block
  if (last !== NO_BLOCK) {
    for (const x of problem.succ[last] ?? []) {
      if (visited[x]) continue
      const before = fragility(child, x)
      availIn[x] = (availIn[x] ?? 0) - 1
      if (availIn[x] === 0) return null
      child.fragile += fragility(child, x) - before
    }
    child.cost += problem.edgeCost[last * B + b] ?? NaN
    child.penalty += ctx.penalties?.[last * B + b] ?? 0
  }
  if (problem.arcCost) {
    let pos = state.pos
    for (const t of problem.blocks[b] ?? []) child.cost += problem.arcCost[t * n + pos++] ?? 0
  }

  if (remaining > 0) {
    let onward = 0
    let mustFollow = 0
    for (const s of problem.succ[b] ?? []) {
      if (visited[s]) continue
      onward++
      if (availIn[s] === 1) mustFollow++
    }
    if (onward === 0 || mustFollow > 1) return null
    if (child.sinks > (end === NO_BLOCK ? 1 : 0)) return null
  }
  return child
}

function score(ctx: SearchContext, s: State): number {
  const arc = ctx.arcBound ? arcLowerBound(ctx.arcBound, s.visited, s.pos) : 0
  return s.cost + s.penalty + s.lowerBound + arc + ctx.scarcityWeight * s.fragile
}

function statePath(state: State): number[] {
  const path: number[] = []
  for (let s: State | null = state; s && s.block !== NO_BLOCK; s = s.parent) path.push(s.block)
  return path.reverse()
}

export interface SearchResult {
  paths: number[][]
  expansions: number
  timedOut: boolean
}

/**
 * Beam search over partial paths, ranked by cost so far + a lower bound on the rest +
 * a scarcity penalty (Warnsdorff-style). Returns complete paths, cheapest first.
 */
export function beamSearch(
  ctx: SearchContext,
  width: number,
  prng: Prng,
  timedOut: () => boolean,
): SearchResult {
  const { problem, B, n } = ctx
  const root = rootState(ctx)
  const first = openers(ctx, root)
  if (!first) return { paths: [], expansions: 0, timedOut: false }
  let layer: { state: State; score: number }[] = [{ state: root, score: score(ctx, root) }]
  let expansions = 0

  for (let depth = 0; depth < B; depth++) {
    if (timedOut()) return { paths: [], expansions, timedOut: true }
    // Rank every extension by a cheap estimate (no copying), then materialise the most
    // promising ones until twice the beam width survive the dead-end checks.
    const options: {
      parent: State
      parentScore: number
      b: number
      estimate: number
      tie: number
    }[] = []
    for (const { state, score: parentScore } of layer) {
      const candidates = state.block === NO_BLOCK ? first : (problem.succ[state.block] ?? [])
      for (const b of candidates) {
        if (state.visited[b]) continue
        let estimate = parentScore - (ctx.minIn[b] ?? 0)
        if (state.block !== NO_BLOCK) {
          estimate +=
            (problem.edgeCost[state.block * B + b] ?? 0) +
            (ctx.penalties?.[state.block * B + b] ?? 0)
        }
        if (problem.arcCost) {
          let pos = state.pos
          for (const t of problem.blocks[b] ?? []) estimate += problem.arcCost[t * n + pos++] ?? 0
        }
        options.push({ parent: state, parentScore, b, estimate, tie: prng.next() })
      }
    }
    options.sort((a, b) => a.estimate - b.estimate || a.tie - b.tie)

    const best = new Map<string, { state: State; score: number; tie: number }>()
    for (const option of options) {
      if (best.size >= width * 2) break
      const child = expand(ctx, option.parent, option.b)
      expansions++
      if (!child) continue
      const key = `${child.h1}:${child.h2}:${option.b}`
      const s = score(ctx, child)
      const existing = best.get(key)
      if (!existing || s < existing.score)
        best.set(key, { state: child, score: s, tie: option.tie })
    }
    layer = [...best.values()].sort((a, b) => a.score - b.score || a.tie - b.tie).slice(0, width)
    if (layer.length === 0) return { paths: [], expansions, timedOut: false }
  }
  const complete = layer
    .map((l) => l.state)
    .sort((a, b) => a.cost + a.penalty - (b.cost + b.penalty))
  return { paths: complete.map(statePath), expansions, timedOut: false }
}

/**
 * Depth-first search with the same pruning, most-constrained successor first. A
 * fallback for instances where the beam loses every path; bounded by `maxExpansions`.
 */
export function depthFirstSearch(
  ctx: SearchContext,
  maxExpansions: number,
  timedOut: () => boolean,
): SearchResult {
  const root = rootState(ctx)
  const first = openers(ctx, root)
  if (!first) return { paths: [], expansions: 0, timedOut: false }
  let expansions = 0
  let stopped = false

  const visit = (state: State, options: readonly number[]): State | null => {
    if (state.depth === ctx.B) return state
    const children: State[] = []
    for (const b of options) {
      if (state.visited[b]) continue
      if (++expansions > maxExpansions || (expansions % 1024 === 0 && timedOut())) {
        stopped = true
        return null
      }
      const child = expand(ctx, state, b)
      if (child) children.push(child)
    }
    children.sort(
      (a, b) =>
        (a.availOut[a.block] ?? 0) - (b.availOut[b.block] ?? 0) || score(ctx, a) - score(ctx, b),
    )
    for (const child of children) {
      const found = visit(child, ctx.problem.succ[child.block] ?? [])
      if (found || stopped) return found
    }
    return null
  }

  const found = visit(root, first)
  return { paths: found ? [statePath(found)] : [], expansions, timedOut: stopped }
}
