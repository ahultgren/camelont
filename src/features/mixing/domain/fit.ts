import { NO_CONSTRAINTS, validateConstraints, type MixConstraints } from './constraints'
import { transitionCost, type Transition } from './evaluate'
import { withArc, type MixProfile } from './profile'
import { solveMix } from './solver/solve'
import type { MixTrack } from './types'

/**
 * Best fit (spec §8.4, decision 31): which `count` of the candidates fit the set best.
 * The picks are made before the solver orders anything and one at a time, so each pick
 * sees the earlier ones. A candidate is ranked by
 *
 * 1. whether it has a place: the clashes its best slot adds to one order of the set
 *    (the solver's, or `order` from an earlier call). While that order is clash-free, a
 *    track with a place keeps the set mixable; one without is picked only when nothing
 *    else is left. A track that would win on cost but has no slot in this one order
 *    gets a second opinion from the solver, up to `SECOND_OPINIONS` times;
 * 2. its added cost: the cheapest `a → track → b` over tracks of the set, less `a → b`
 *    when that is a transition a good mix would use anyway (see `NEAR`), or one legal
 *    move at an end of the order. Apart from the ends this doesn't depend on the
 *    order, so an unrelated edit to the set rarely moves a pick;
 * 3. its ID.
 *
 * All costs are `transitionCost`. The arc is ignored: it is a mix setting, and picks
 * are track choices that shouldn't change when the arc does.
 */
export interface FitRequest {
  /** The tracks in the set whatever is picked. May be empty. */
  fixed: readonly MixTrack[]
  /** The tracks to choose from. IDs are unique across `fixed` and `candidates`. */
  candidates: readonly MixTrack[]
  /** How many to pick; all of them when there are fewer. */
  count: number
  profile: MixProfile
  /**
   * The set's mix rules. They name fixed tracks only (spec §5.4). Rules that
   * `validateConstraints` rejects are ignored here; the planner reports them.
   */
  constraints?: MixConstraints
  /**
   * A clash-free order of `fixed`, when the caller has one: the `order` of the previous
   * call when several playlists pick in turn. Saves the solver run. Ignored unless it
   * holds exactly the fixed tracks, without a clash and within the rules.
   */
  order?: readonly MixTrack[]
}

export interface FitScore {
  id: string
  picked: boolean
  /**
   * Clashes its best slot in the order adds. 0 = it has a place. Positive = no place
   * was found in this order (another order may have one; the solver is only asked when
   * that would change a pick). Negative = it mends a clash of a set that has no
   * clash-free order.
   */
  clashes: number
  /** Added cost of its cheapest slot, at the time it was picked (or after all picks). */
  cost: number
  /** That slot: the transition into the track and the one out of it (null at an end). */
  after: Transition | null
  before: Transition | null
}

export interface FitResult {
  /** The picks, best first. */
  picked: MixTrack[]
  /** Every candidate: the picks in pick order, then the rest, best first. */
  ranking: FitScore[]
  /** The order used to check for a place, with the picks in it. */
  order: MixTrack[]
}

/**
 * A slot `a → b` earns its detour credit when b is among a's NEAR cheapest legal
 * successors or a among b's NEAR cheapest legal predecessors: a track has one neighbour
 * on each side in a mix, and a good mix draws them from its nearest few. Tuned on the
 * WCS hold-outs (1, 2, 3 and "any legal pair" were tried; decision 31).
 */
const NEAR = 2
/** Solver runs spent per call on tracks that have no slot in the order but would win on cost. */
const SECOND_OPINIONS = 4
/** Costs are compared on this grid, so that rounding noise can't decide (or cycle). */
const onGrid = (cost: number) => Math.round(cost * 1e9)

/** Transition costs between tracks by index, worked out on first use. */
interface CostTable {
  cost(from: number, to: number): number
  clash(from: number, to: number): boolean
}

function costTable(tracks: readonly MixTrack[], profile: MixProfile): CostTable {
  const size = tracks.length
  const costs = new Float64Array(size * size).fill(NaN)
  const clashes = new Uint8Array(size * size)
  const cost = (from: number, to: number): number => {
    const key = from * size + to
    const known = costs[key] ?? NaN
    if (!Number.isNaN(known)) return known
    const a = tracks[from]
    const b = tracks[to]
    if (!a || !b) throw new Error(`Track index ${from} or ${to} out of range`)
    const transition = transitionCost(a, b, profile)
    costs[key] = transition.cost
    clashes[key] = transition.move === 'clash' ? 1 : 0
    return transition.cost
  }
  return {
    cost,
    clash: (from, to) => {
      cost(from, to)
      return clashes[from * size + to] === 1
    },
  }
}

/** A position between two tracks of the order (or at an end of it). */
interface Gap {
  prev: number | undefined
  next: number | undefined
  /** False where the mix rules allow nothing: before the opener, after the closer, inside a follow pair. */
  open: boolean
  /** The transition a track put here replaces. */
  clash: number
  cost: number
}

interface Place {
  /** Insert before this position of the order. */
  index: number
  clashes: number
  cost: number
}

interface Fit {
  cost: number
  after: number | null
  before: number | null
}

interface Scored extends Fit {
  track: number
  place: Place
}

/** Orders by cost, then by ID, so that equal costs never fall back on input order. */
function byCostThenId<T>(cost: (item: T) => number, id: (item: T) => string) {
  return (a: T, b: T): number => {
    const diff = onGrid(cost(a)) - onGrid(cost(b))
    if (diff !== 0 && !Number.isNaN(diff)) return diff
    return id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0
  }
}

/** The `k` cheapest of `items`, cheapest first, in one pass (k is 2 here). */
function cheapest(
  items: readonly number[],
  k: number,
  cost: (item: number) => number,
  id: (item: number) => string,
  skip: (item: number) => boolean = () => false,
): number[] {
  const compare = byCostThenId(cost, id)
  const best: number[] = []
  for (const item of items) {
    if (skip(item)) continue
    const worst = best[best.length - 1]
    if (best.length === k && worst !== undefined && compare(item, worst) >= 0) continue
    best.push(item)
    best.sort(compare)
    if (best.length > k) best.pop()
  }
  return best
}

export function pickBestFit(request: FitRequest): FitResult {
  const { fixed, candidates } = request
  const profile = withArc(request.profile, null)
  const rules = { ...(request.constraints ?? NO_CONSTRAINTS), excluded: [] }
  const constraints = validateConstraints(fixed, rules).length === 0 ? rules : NO_CONSTRAINTS
  const follows = new Set(constraints.follows.map(([from, to]) => `${from}\n${to}`))

  const tracks = [...fixed, ...candidates]
  const table = costTable(tracks, profile)
  const idOf = (index: number) => tracks[index]?.id ?? ''
  const trackAt = (index: number): MixTrack => {
    const track = tracks[index]
    if (!track) throw new Error(`Track index ${index} out of range`)
    return track
  }

  const gapsOf = (order: readonly number[]): Gap[] =>
    Array.from({ length: order.length + 1 }, (_, index) => {
      const prev = order[index - 1]
      const next = order[index]
      if (prev === undefined || next === undefined) {
        const beforeOpener = next !== undefined && constraints.start === idOf(next)
        const afterCloser = prev !== undefined && constraints.end === idOf(prev)
        return { prev, next, open: !beforeOpener && !afterCloser, clash: 0, cost: 0 }
      }
      return {
        prev,
        next,
        open: follows.size === 0 || !follows.has(`${idOf(prev)}\n${idOf(next)}`),
        clash: Number(table.clash(prev, next)),
        cost: table.cost(prev, next),
      }
    })

  /** The gap that takes `track` for the fewest added clashes, then the least cost. */
  const placeIn = (gaps: readonly Gap[], track: number): Place => {
    let best: Place | null = null
    for (const [index, { prev, next, open, clash, cost: replaced }] of gaps.entries()) {
      if (!open) continue
      let clashes = -clash
      let cost = -replaced
      if (prev !== undefined) {
        clashes += Number(table.clash(prev, track))
        cost += table.cost(prev, track)
      }
      if (next !== undefined) {
        clashes += Number(table.clash(track, next))
        cost += table.cost(track, next)
      }
      const better =
        !best ||
        clashes < best.clashes ||
        (clashes === best.clashes && onGrid(cost) < onGrid(best.cost))
      if (better) best = { index, clashes, cost }
    }
    // The mix rules leave no gap open: no place.
    return best ?? { index: gaps.length - 1, clashes: 1, cost: 0 }
  }

  /** The slots that earn a detour credit, as [a, b] pairs of members. */
  const nearSlots = (members: readonly number[]): [number, number][] => {
    const slots = new Map<number, [number, number]>()
    for (const a of members) {
      const successors = cheapest(
        members,
        NEAR,
        (b) => table.cost(a, b),
        idOf,
        (b) => b === a || table.clash(a, b),
      )
      for (const b of successors) slots.set(a * tracks.length + b, [a, b])
      const predecessors = cheapest(
        members,
        NEAR,
        (b) => table.cost(b, a),
        idOf,
        (b) => b === a || table.clash(b, a),
      )
      for (const b of predecessors) slots.set(b * tracks.length + a, [b, a])
    }
    return [...slots.values()]
  }

  /** Added cost of the cheapest slot for `track` in the set. */
  const fitOf = (
    track: number,
    order: readonly number[],
    gaps: readonly Gap[],
    slots: readonly [number, number][],
  ): Fit => {
    const first = order[0]
    const last = order[order.length - 1]
    if (first === undefined || last === undefined) return { cost: 0, after: null, before: null }
    let best: Fit = { cost: Infinity, after: null, before: null }
    const offer = (after: number | null, before: number | null, credit: number) => {
      const cost =
        (after === null ? 0 : table.cost(after, track)) +
        (before === null ? 0 : table.cost(track, before)) -
        credit
      if (onGrid(cost) < onGrid(best.cost)) best = { cost, after, before }
    }
    if (order.length > 1) {
      // Between two tracks. Without credit: the cheapest way in and the cheapest way
      // out, by different tracks. With credit: the slots a good mix would use.
      const ins = cheapest(order, 2, (m) => table.cost(m, track), idOf)
      const outs = cheapest(order, 2, (m) => table.cost(track, m), idOf)
      for (const after of ins) {
        for (const before of outs) if (after !== before) offer(after, before, 0)
      }
      for (const [after, before] of slots) offer(after, before, table.cost(after, before))
    }
    // At an end of the order it adds one transition, not two.
    if (gaps[0]?.open && !table.clash(track, first)) offer(null, first, 0)
    if (gaps[order.length]?.open && !table.clash(last, track)) offer(last, null, 0)
    // A single track that clashes with it, or whose ends the rules close.
    if (best.cost === Infinity) offer(last, null, 0)
    return best
  }

  /** The solver's best order of `members`, or null when there is no clash-free one. */
  const solve = (members: readonly number[]): number[] | null => {
    const outcome = solveMix({ tracks: members.map(trackAt), constraints, profile, k: 1 })
    const best = outcome.kind === 'solved' ? outcome.candidates[0] : undefined
    if (!best) return null
    const index = new Map(members.map((m) => [idOf(m), m]))
    const order = best.order.map((t) => index.get(t.id)).filter((m) => m !== undefined)
    return new Set(order).size === members.length ? order : null
  }

  /** The caller's order, if it is a mix of exactly the fixed tracks. */
  const givenOrder = (): number[] | null => {
    const given = request.order
    if (given?.length !== fixed.length) return null
    const index = new Map(fixed.map((t, i) => [t.id, i]))
    const order = given.map((t) => index.get(t.id)).filter((i) => i !== undefined)
    if (new Set(order).size !== fixed.length) return null
    const gaps = gapsOf(order)
    const obeys =
      gaps.every((gap) => gap.clash === 0) &&
      (constraints.start === null || constraints.start === idOf(order[0] ?? -1)) &&
      (constraints.end === null || constraints.end === idOf(order[order.length - 1] ?? -1)) &&
      gaps.filter((gap) => !gap.open && gap.prev !== undefined && gap.next !== undefined).length ===
        follows.size
    return obeys ? order : null
  }

  /** No clash-free order exists: fewest clashes, greedily, in ID order (not input order). */
  const greedyOrder = (): number[] => {
    const order: number[] = []
    const byId = fixed.map((_, i) => i).sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1))
    for (const track of byId) order.splice(placeIn(gapsOf(order), track).index, 0, track)
    return order
  }

  let order =
    fixed.length === 0 ? [] : (givenOrder() ?? solve(fixed.map((_, i) => i)) ?? greedyOrder())
  let orderClashes = gapsOf(order).reduce((sum, gap) => sum + gap.clash, 0)

  const remaining = new Set(candidates.map((_, i) => fixed.length + i))
  const compareScores = byCostThenId<Scored>(
    (s) => s.cost,
    (s) => idOf(s.track),
  )
  const scoreAll = (): Scored[] => {
    const gaps = gapsOf(order)
    const slots = nearSlots(order)
    return [...remaining]
      .map((track) => ({
        track,
        place: placeIn(gaps, track),
        ...fitOf(track, order, gaps, slots),
      }))
      .sort((a, b) => a.place.clashes - b.place.clashes || compareScores(a, b))
  }

  /**
   * With nothing to fit yet, start from the middle of the tightest group: the candidate
   * whose `size − 1` nearest candidates (in either direction) are nearest.
   */
  const seed = (size: number): number | undefined => {
    const pool = [...remaining]
    const spread = new Map(
      pool.map((track) => {
        const distances = Float64Array.from(
          pool.filter((o) => o !== track),
          (o) => Math.min(table.cost(track, o), table.cost(o, track)),
        ).sort()
        return [track, distances.subarray(0, Math.max(0, size - 1)).reduce((a, b) => a + b, 0)]
      }),
    )
    return pool.sort(byCostThenId((track) => spread.get(track) ?? 0, idOf))[0]
  }

  let opinions = SECOND_OPINIONS
  const refuted = new Set<number>()
  /**
   * The order has one slot per neighbouring pair, so a track can have a place in
   * another clash-free order and none in this one. Before such a track loses to a
   * dearer one (or is picked as having no place), the solver is asked. A yes brings a
   * new order with the track in it.
   */
  const secondOpinion = (scores: readonly Scored[], best: Scored) => {
    if (orderClashes > 0) return null
    const doubted = scores
      .filter((s) => s.place.clashes > 0 && !refuted.has(s.track))
      .filter((s) => best.place.clashes > 0 || onGrid(s.cost) < onGrid(best.cost))
      .sort(compareScores)
    for (const scored of doubted) {
      if (opinions === 0) break
      opinions--
      const solved = solve([...order, scored.track])
      if (solved) return { scored, solved }
      refuted.add(scored.track)
    }
    return null
  }

  const toScore = (s: Scored, picked: boolean, clashes = s.place.clashes): FitScore => ({
    id: idOf(s.track),
    picked,
    clashes,
    cost: s.cost,
    after: s.after === null ? null : transitionCost(trackAt(s.after), trackAt(s.track), profile),
    before: s.before === null ? null : transitionCost(trackAt(s.track), trackAt(s.before), profile),
  })

  const count = Math.max(0, Math.min(candidates.length, Math.floor(request.count) || 0))
  const picked: MixTrack[] = []
  const ranking: FitScore[] = []
  while (picked.length < count) {
    const scores = scoreAll()
    const first = order.length === 0 ? seed(count) : undefined
    const best = scores.find((s) => s.track === first) ?? scores[0]
    if (!best) break
    const placed = secondOpinion(scores, best)
    const pick = placed?.scored ?? best
    remaining.delete(pick.track)
    picked.push(trackAt(pick.track))
    if (placed) {
      ranking.push(toScore(pick, true, 0))
      order = placed.solved
    } else {
      ranking.push(toScore(pick, true))
      order.splice(pick.place.index, 0, pick.track)
      orderClashes += pick.place.clashes
    }
  }
  ranking.push(...scoreAll().map((s) => toScore(s, false)))
  return { picked, ranking, order: order.map(trackAt) }
}
