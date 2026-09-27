import { createPrng } from '@/shared/lib'
import { validateConstraints, type ConstraintError, type MixConstraints } from '../constraints'
import { diagnose, type Diagnostic } from '../diagnostics'
import { evaluateMix, type EvaluatedMix } from '../evaluate'
import type { MixProfile } from '../profile'
import type { MixTrack } from '../types'
import { selectDiverse } from './diversity'
import { improvePath } from './local-search'
import {
  buildProblem,
  expandPath,
  includedTracks,
  isLegalPath,
  pathCost,
  type Problem,
} from './problem'
import { beamSearch, createContext, depthFirstSearch } from './search'

export interface SolveRequest {
  /** Every mixable entry (with key and BPM); exclusions come from `constraints`. */
  tracks: readonly MixTrack[]
  constraints: MixConstraints
  profile: MixProfile
  /** How many alternatives to return (default 5). */
  k?: number
  seed?: number
  /** Safety net only; results are deterministic unless it is reached. */
  timeLimitMs?: number
  now?: () => number
}

export interface SolveStats {
  expansions: number
  elapsedMs: number
  timedOut: boolean
}

export type SolveOutcome =
  | { kind: 'solved'; candidates: EvaluatedMix[]; stats: SolveStats }
  | { kind: 'invalid'; errors: ConstraintError[] }
  | { kind: 'infeasible'; diagnostics: Diagnostic[]; stats: SolveStats }
  | { kind: 'empty' }

export const DEFAULT_K = 5
export const DEFAULT_SEED = 1
/** Kept mixes must differ in at least this share of their transitions. */
export const MIN_ADJACENCY_DIFFERENCE = 0.3
const DEFAULT_TIME_LIMIT_MS = 8000
const SCARCITY_WEIGHT = 2
/** Extra cost on edges already used by earlier results, to steer later rounds away. */
const DIVERSITY_PENALTY = 2.5
const PATHS_PER_ROUND = 3
const LOCAL_SEARCH_PASSES = 6
const DFS_BUDGET = 200_000

/** Beam width: wide for small sets, narrower for large ones (work grows with B²). */
const beamWidth = (blocks: number) => Math.max(32, Math.min(768, Math.round(12000 / blocks)))

/**
 * Finds up to k clash-free, meaningfully different mixes, best first:
 * beam search (+ DFS fallback) → or-opt local search → diversity selection, with
 * later rounds penalising edges earlier results used. Deterministic for a seed.
 */
export function solveMix(request: SolveRequest): SolveOutcome {
  const now = request.now ?? (() => Date.now())
  const started = now()
  const deadline = started + (request.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS)
  const timedOut = () => now() > deadline
  const k = request.k ?? DEFAULT_K
  const prng = createPrng(request.seed ?? DEFAULT_SEED)

  const errors = validateConstraints(request.tracks, request.constraints)
  if (errors.length > 0) return { kind: 'invalid', errors }

  const included = includedTracks(request.tracks, request.constraints)
  if (included.length === 0) return { kind: 'empty' }

  const problem = buildProblem(included, request.constraints, request.profile)
  const B = problem.blocks.length
  const width = beamWidth(B)
  const penalties = new Float64Array(B * B)
  const pool = new Map<string, { path: number[]; cost: number }>()
  let expansions = 0
  let hitLimit = false
  const stats = (): SolveStats => ({
    expansions,
    elapsedMs: now() - started,
    timedOut: hitLimit,
  })

  const addToPool = (path: number[]) => {
    if (isLegalPath(problem, path))
      pool.set(path.join(','), { path, cost: pathCost(problem, path) })
  }

  const rounds = Math.max(1, k + 1)
  for (let round = 0; round < rounds && !timedOut(); round++) {
    const ctx = createContext(problem, prng, round === 0 ? null : penalties, SCARCITY_WEIGHT)
    let result = beamSearch(ctx, width, prng, timedOut)
    if (round === 0 && result.paths.length === 0 && !result.timedOut) {
      result = beamSearch(ctx, width * 4, prng, timedOut)
      if (result.paths.length === 0 && !result.timedOut) {
        expansions += result.expansions
        result = depthFirstSearch(ctx, DFS_BUDGET, timedOut)
      }
    }
    expansions += result.expansions
    hitLimit ||= result.timedOut
    if (round === 0 && result.paths.length === 0) break

    const best = result.paths[0]
    if (best) {
      addToPool(improvePath(problem, best, LOCAL_SEARCH_PASSES, timedOut))
      penaliseEdges(penalties, B, best)
    }
    for (const path of result.paths.slice(0, PATHS_PER_ROUND)) addToPool(path)
    if (enoughDiverse(problem, pool, k)) break
  }

  if (pool.size === 0) {
    return {
      kind: 'infeasible',
      diagnostics: diagnose(request.tracks, request.constraints),
      stats: stats(),
    }
  }

  const ranked = [...pool.values()].sort((a, b) => a.cost - b.cost)
  const orderIds = (c: { path: number[] }) => expandPath(problem, c.path).map((t) => t.id)
  const chosen = selectDiverse(ranked, orderIds, k, MIN_ADJACENCY_DIFFERENCE)
  return {
    kind: 'solved',
    candidates: chosen.map((c) => evaluateMix(expandPath(problem, c.path), request.profile)),
    stats: stats(),
  }
}

function penaliseEdges(penalties: Float64Array, B: number, path: readonly number[]) {
  for (let i = 1; i < path.length; i++) {
    const index = (path[i - 1] ?? 0) * B + (path[i] ?? 0)
    penalties[index] = (penalties[index] ?? 0) + DIVERSITY_PENALTY
  }
}

function enoughDiverse(
  problem: Problem,
  pool: Map<string, { path: number[]; cost: number }>,
  k: number,
): boolean {
  if (pool.size < k) return false
  const ranked = [...pool.values()].sort((a, b) => a.cost - b.cost)
  const orderIds = (c: { path: number[] }) => expandPath(problem, c.path).map((t) => t.id)
  return selectDiverse(ranked, orderIds, k, MIN_ADJACENCY_DIFFERENCE).length >= k
}
