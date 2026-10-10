import { NO_CONSTRAINTS, type MixConstraints } from './constraints'
import { transitionCost, type Transition } from './evaluate'
import { withArc, type MixProfile } from './profile'
import { solveMix } from './solver/solve'
import type { MixTrack } from './types'

/**
 * Best fit (spec §8.4, decision 29): which `count` of the candidates fit the set best.
 * The picks are made before the solver orders anything and one at a time, so each pick
 * sees the earlier ones. A candidate is ranked by
 *
 * 1. whether it has a place: the clashes its best slot adds to one clash-free order of
 *    the set (the solver's, or `order` from an earlier call). A track with a place keeps
 *    the set mixable; one without is picked only when nothing else is left;
 * 2. its added cost: the cheapest `a → track → b` over tracks of the set, less `a → b`
 *    when that is a transition a good mix would use anyway (see `NEAR`). This doesn't
 *    depend on the order, so an unrelated edit to the set can't reshuffle the picks;
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
  /** The set's mix rules. They name fixed tracks only (spec §5.4). */
  constraints?: MixConstraints
  /**
   * A clash-free order of `fixed`, when the caller has one: the `order` of the previous
   * call when several playlists pick in turn. Saves the solver run. Ignored unless it
   * holds exactly the fixed tracks.
   */
  order?: readonly MixTrack[]
}

export interface FitScore {
  id: string
  picked: boolean
  /**
   * Clashes its best slot in the order adds: 0 = it has a place, negative = it mends a
   * clash of a set that can't be mixed without it, positive = no place was found.
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
 * WCS hold-outs (1, 2, 3 and "any legal pair" were tried; decision 29).
 */
const NEAR = 2
const EPSILON = 1e-9

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

/** Where a slot may not be: before the opener, after the closer, inside a follow pair. */
interface Rules {
  start: string | null
  end: string | null
  follows: ReadonlySet<string>
}

const pairKey = (from: string, to: string) => `${from}\n${to}`

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

/** Orders by cost, then by ID, so that equal costs never fall back on input order. */
function byCostThenId<T>(cost: (item: T) => number, id: (item: T) => string) {
  return (a: T, b: T): number => {
    const diff = cost(a) - cost(b)
    if (Math.abs(diff) > EPSILON) return diff
    return id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0
  }
}

/** The `k` cheapest of `items`, cheapest first, in one pass (k is small here). */
function cheapest(
  items: readonly number[],
  k: number,
  cost: (item: number) => number,
  id: (item: number) => string,
  skip: (item: number) => boolean = () => false,
): number[] {
  if (k <= 0) return []
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
  const constraints = { ...(request.constraints ?? NO_CONSTRAINTS), excluded: [] }
  const rules: Rules = {
    start: constraints.start,
    end: constraints.end,
    follows: new Set(constraints.follows.map(([from, to]) => pairKey(from, to))),
  }

  const tracks = [...fixed, ...candidates]
  const table = costTable(tracks, profile)
  const idOf = (index: number) => tracks[index]?.id ?? ''
  const trackAt = (index: number): MixTrack => {
    const track = tracks[index]
    if (!track) throw new Error(`Track index ${index} out of range`)
    return track
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

  /** Added cost of the cheapest slot for `track` among `members`. */
  const fitAmong = (
    track: number,
    members: readonly number[],
    slots: readonly [number, number][],
  ): Fit => {
    const ins = cheapest(members, 2, (m) => table.cost(m, track), idOf)
    const only = ins.length === 1 ? ins[0] : undefined
    if (ins.length === 0) return { cost: 0, after: null, before: null }
    if (only !== undefined) {
      const after = table.cost(only, track)
      const before = table.cost(track, only)
      return after <= before
        ? { cost: after, after: only, before: null }
        : { cost: before, after: null, before: only }
    }
    // Without credit: the cheapest way in and the cheapest way out, by different tracks.
    const outs = cheapest(members, 2, (m) => table.cost(track, m), idOf)
    let best: Fit = { cost: Infinity, after: null, before: null }
    const offer = (after: number, before: number, credit: number) => {
      const cost = table.cost(after, track) + table.cost(track, before) - credit
      if (cost < best.cost - EPSILON) best = { cost, after, before }
    }
    for (const after of ins) {
      for (const before of outs) if (after !== before) offer(after, before, 0)
    }
    for (const [after, before] of slots) offer(after, before, table.cost(after, before))
    return best
  }

  /** The slot of `order` that adds the fewest clashes, then the least cost. */
  const placeIn = (order: readonly number[], track: number): Place => {
    const n = order.length
    let best: Place | null = null
    for (let index = 0; index <= n; index++) {
      const prev = order[index - 1]
      const next = order[index]
      if (prev === undefined && next !== undefined && rules.start === idOf(next)) continue
      if (prev !== undefined && next === undefined && rules.end === idOf(prev)) continue
      if (prev !== undefined && next !== undefined) {
        if (rules.follows.has(pairKey(idOf(prev), idOf(next)))) continue
      }
      let clashes = 0
      let cost = 0
      if (prev !== undefined) {
        clashes += Number(table.clash(prev, track))
        cost += table.cost(prev, track)
      }
      if (next !== undefined) {
        clashes += Number(table.clash(track, next))
        cost += table.cost(track, next)
      }
      if (prev !== undefined && next !== undefined) {
        clashes -= Number(table.clash(prev, next))
        cost -= table.cost(prev, next)
      }
      if (
        !best ||
        clashes < best.clashes ||
        (clashes === best.clashes && cost < best.cost - EPSILON)
      ) {
        best = { index, clashes, cost }
      }
    }
    // The mix rules leave no slot at all: no place.
    return best ?? { index: n, clashes: 1, cost: 0 }
  }

  const order = startingOrder(request, constraints, profile) ?? []
  if (order.length === 0) {
    // No clash-free order exists (or the rules are invalid): fewest clashes, greedily,
    // in ID order so that the result doesn't depend on the input order.
    const byId = fixed.map((_, i) => i).sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1))
    for (const track of byId) order.splice(placeIn(order, track).index, 0, track)
  }

  interface Scored extends Fit {
    track: number
    place: Place
  }
  const remaining = new Set(candidates.map((_, i) => fixed.length + i))
  const scoreAll = (): Scored[] => {
    const slots = nearSlots(order)
    return [...remaining]
      .map((track) => ({ track, place: placeIn(order, track), ...fitAmong(track, order, slots) }))
      .sort(
        (a, b) =>
          a.place.clashes - b.place.clashes ||
          byCostThenId<Scored>(
            (s) => s.cost,
            (s) => idOf(s.track),
          )(a, b),
      )
  }
  /**
   * With nothing to fit yet, start from the middle of the tightest group: the candidate
   * whose `size − 1` nearest candidates (in either direction) are nearest.
   */
  const seed = (size: number): number | undefined => {
    const pool = [...remaining]
    const near = (track: number) => (o: number) =>
      Math.min(table.cost(track, o), table.cost(o, track))
    const spread = (track: number): number =>
      cheapest(pool, size - 1, near(track), idOf, (o) => o === track).reduce(
        (sum, o) => sum + near(track)(o),
        0,
      )
    return [...pool].sort(byCostThenId(spread, idOf))[0]
  }

  const toScore = (s: Scored, picked: boolean): FitScore => ({
    id: idOf(s.track),
    picked,
    clashes: s.place.clashes,
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
    remaining.delete(best.track)
    picked.push(trackAt(best.track))
    ranking.push(toScore(best, true))
    order.splice(best.place.index, 0, best.track)
  }
  ranking.push(...scoreAll().map((s) => toScore(s, false)))
  return { picked, ranking, order: order.map(trackAt) }
}

/** The caller's order if it holds exactly the fixed tracks, else the solver's best. */
function startingOrder(
  request: FitRequest,
  constraints: MixConstraints,
  profile: MixProfile,
): number[] | null {
  const { fixed } = request
  const index = new Map(fixed.map((t, i) => [t.id, i]))
  const toIndices = (order: readonly MixTrack[]): number[] | null => {
    const indices = order.map((t) => index.get(t.id)).filter((i) => i !== undefined)
    const complete = order.length === fixed.length && new Set(indices).size === fixed.length
    return complete ? indices : null
  }
  const given = request.order ? toIndices(request.order) : null
  if (given) return given
  const outcome = solveMix({ tracks: fixed, constraints, profile, k: 1 })
  const best = outcome.kind === 'solved' ? outcome.candidates[0] : undefined
  return best ? toIndices(best.order) : null
}
