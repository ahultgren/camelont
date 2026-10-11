import { describe, expect, it } from 'vitest'
import { createPrng } from '@/shared/lib'
import { ALL_CAMELOT_KEYS, type CamelotKey } from '@/shared/music'
import { WCS_TRACKS } from '@/test/wcs'
import { DEFAULT_ARC_WEIGHT } from './arc'
import { moveBetween } from './chart'
import { NO_CONSTRAINTS, type MixConstraints } from './constraints'
import { evaluateMix, mixTracks, transitionCost } from './evaluate'
import { pickBestFit, type FitResult } from './fit'
import pool from './fit.pool.fixture.json'
import { DEFAULT_PROFILE, withArc } from './profile'
import { solveMix } from './solver/solve'
import type { MixTrack } from './types'

const profile = DEFAULT_PROFILE
const track = (id: string, camelot: CamelotKey, bpm = 100): MixTrack => ({
  id,
  label: id,
  camelot,
  bpm,
  energy: null,
})
const ids = (tracks: readonly MixTrack[]) => tracks.map((t) => t.id)
const fit = (
  fixed: readonly MixTrack[],
  candidates: readonly MixTrack[],
  count: number,
  constraints?: Partial<MixConstraints>,
): FitResult =>
  pickBestFit({
    fixed,
    candidates,
    count,
    profile,
    ...(constraints ? { constraints: { ...NO_CONSTRAINTS, ...constraints } } : {}),
  })
const scoreOf = (result: FitResult, id: string) => {
  const score = result.ranking.find((s) => s.id === id)
  if (!score) throw new Error(`No score for ${id}`)
  return score
}

/** Cost of the solver's best mix, or Infinity when there is no clash-free order. */
function solvedCost(tracks: readonly MixTrack[], constraints: MixConstraints = NO_CONSTRAINTS) {
  const outcome = solveMix({ tracks, constraints, profile })
  return outcome.kind === 'solved' ? (outcome.candidates[0]?.totalCost ?? Infinity) : Infinity
}
const randomDraw = (candidates: readonly MixTrack[], count: number, seed: number) =>
  createPrng(seed).shuffle(candidates).slice(0, count)
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length
const kept = (before: readonly MixTrack[], after: readonly MixTrack[]) =>
  before.filter((t) => after.some((u) => u.id === t.id)).length

const WCS = mixTracks(WCS_TRACKS)
const MAIN = mixTracks(pool.playlists.main)
const SINGALONGS = mixTracks(pool.playlists.sing)
const ODD = mixTracks(pool.playlists.odd)

describe('pickBestFit: counts and shape', () => {
  const fixed = [track('a', '8B', 100), track('b', '8B', 104), track('c', '9B', 108)]
  const candidates = [track('x', '8B', 102), track('y', '9B', 120), track('z', '2A', 100)]

  it('picks the number asked for, best first, and ranks every candidate once', () => {
    const result = fit(fixed, candidates, 2)
    expect(ids(result.picked)).toEqual(['x', 'y'])
    expect(result.ranking.map((s) => [s.id, s.picked])).toEqual([
      ['x', true],
      ['y', true],
      ['z', false],
    ])
  })

  it('picks nothing for a count of zero, and still scores the candidates', () => {
    const result = fit(fixed, candidates, 0)
    expect(result.picked).toEqual([])
    expect(result.ranking.map((s) => s.id)).toEqual(['x', 'y', 'z'])
    expect(result.ranking.every((s) => !s.picked)).toBe(true)
    expect(ids(result.order).sort()).toEqual(['a', 'b', 'c'])
  })

  it('picks every candidate when there are fewer than the count', () => {
    expect(ids(fit(fixed, candidates, 10).picked).sort()).toEqual(['x', 'y', 'z'])
  })

  it('treats a negative, fractional or missing count sensibly', () => {
    expect(fit(fixed, candidates, -3).picked).toEqual([])
    expect(fit(fixed, candidates, Number.NaN).picked).toEqual([])
    expect(ids(fit(fixed, candidates, 1.9).picked)).toEqual(['x'])
  })

  it('handles no candidates at all', () => {
    const result = fit(fixed, [], 3)
    expect(result.picked).toEqual([])
    expect(result.ranking).toEqual([])
  })

  it('returns the order with the picks in it', () => {
    const result = fit(fixed, candidates, 2)
    expect(ids(result.order).sort()).toEqual(['a', 'b', 'c', 'x', 'y'])
    expect(evaluateMix(result.order, profile).clashCount).toBe(0)
  })
})

describe('pickBestFit: the score', () => {
  it('is the cost a track adds between two neighbours, from evaluateMix', () => {
    const a = track('a', '8B', 100)
    const b = track('b', '9B', 104)
    const t = track('t', '8B', 102)
    const score = scoreOf(fit([a, b], [t], 1), 't')
    // Either way round costs the same here; the score says which it means.
    const [first, last] = score.after?.from === 'a' ? [a, b] : [b, a]
    expect(score.cost).toBeCloseTo(
      evaluateMix([first, t, last], profile).totalCost -
        evaluateMix([first, last], profile).totalCost,
    )
    expect(score.after).toEqual(transitionCost(first, t, profile))
    expect(score.before).toEqual(transitionCost(t, last, profile))
    expect(score.clashes).toBe(0)
  })

  it('prefers good chart moves at a close tempo', () => {
    const fixed = [track('a', '8B', 100), track('b', '8B', 102), track('c', '9B', 104)]
    const sameKeyCloseTempo = track('p', '8B', 101)
    const sameKeyFarTempo = track('q', '8B', 125)
    const weakMoveCloseTempo = track('r', '5A', 101)
    const result = fit(fixed, [weakMoveCloseTempo, sameKeyFarTempo, sameKeyCloseTempo], 3)
    expect(ids(result.picked)).toEqual(['p', 'q', 'r'])
    const costs = result.ranking.map((s) => s.cost)
    expect(costs[0]).toBeLessThan(costs[1] ?? 0)
  })

  it('names the neighbour on one side only when the set has a single track', () => {
    const a = track('a', '8A', 100)
    const up = track('up', '8B', 100) // 8A → 8B is +, 8B → 8A is −: the same cost each way
    const score = scoreOf(fit([a], [up], 1), 'up')
    expect(score.cost).toBeCloseTo(1)
    expect([score.after, score.before].filter((t) => t !== null)).toHaveLength(1)
  })

  it('ignores the arc: picks are track choices, the arc is a mix setting', () => {
    const arc = withArc(profile, { preset: 'twoWaves', signal: 'bpm', weight: DEFAULT_ARC_WEIGHT })
    const plain = pickBestFit({ fixed: WCS, candidates: ODD, count: 4, profile })
    const withTheArc = pickBestFit({ fixed: WCS, candidates: ODD, count: 4, profile: arc })
    expect(withTheArc).toEqual(plain)
  })

  it('lets later picks see earlier ones', () => {
    // q is far from the set but right next to p, which is picked first.
    const fixed = [track('a', '8B', 100), track('b', '8B', 100)]
    const p = track('p', '8B', 112)
    const q = track('q', '8B', 124)
    const r = track('r', '8B', 80)
    const alone = scoreOf(fit(fixed, [q, r], 0), 'q').cost
    const result = fit(fixed, [p, q, r], 2)
    expect(ids(result.picked)).toEqual(['p', 'q'])
    expect(scoreOf(result, 'q').cost).toBeLessThan(alone)
  })
})

describe('pickBestFit: determinism and ties', () => {
  it('gives the same picks for the same input', () => {
    expect(fit(WCS, ODD, 5)).toEqual(fit(WCS, ODD, 5))
  })

  it('does not depend on the order the candidates are given in', () => {
    const base = fit(WCS, ODD, 5)
    for (const seed of [1, 2, 3]) {
      const shuffled = fit(WCS, createPrng(seed).shuffle(ODD), 5)
      expect(ids(shuffled.picked)).toEqual(ids(base.picked))
      expect(shuffled.ranking).toEqual(base.ranking)
    }
  })

  it('breaks an exact tie by ID, not by input order', () => {
    const fixed = [track('a', '8B', 100), track('b', '9B', 100)]
    const twins = [track('t2', '8B', 100), track('t1', '8B', 100)]
    expect(ids(fit(fixed, twins, 1).picked)).toEqual(['t1'])
    expect(ids(fit(fixed, [...twins].reverse(), 1).picked)).toEqual(['t1'])
  })
})

describe('pickBestFit: keeping the set mixable (spec §8.4)', () => {
  // The only clash-free orders of the fixed tracks are p a b c q and its reverse.
  const chain = [
    track('p', '12B'),
    track('a', '1A'),
    track('b', '2A'),
    track('c', '5A'),
    track('q', '8B'),
  ]
  // Good moves to a and to c, but they are not neighbours: no clash-free order has it.
  const noPlace = track('noPlace', '6A', 100)
  // Fits between a and b, at a tempo that makes it the dearer of the two.
  const hasPlace = track('hasPlace', '2A', 120)

  it('is a fixture that means what it says', () => {
    expect(solvedCost(chain)).toBeLessThan(Infinity)
    expect(solvedCost([...chain, noPlace])).toBe(Infinity)
    expect(solvedCost([...chain, hasPlace])).toBeLessThan(Infinity)
  })

  it('does not pick a track without a place while one with a place is available', () => {
    const result = fit(chain, [noPlace, hasPlace], 1)
    expect(ids(result.picked)).toEqual(['hasPlace'])
    expect(scoreOf(result, 'hasPlace').clashes).toBe(0)
    expect(scoreOf(result, 'noPlace').clashes).toBeGreaterThan(0)
    // The rule decided, not the cost.
    expect(scoreOf(result, 'noPlace').cost).toBeLessThan(scoreOf(result, 'hasPlace').cost)
    expect(solvedCost([...chain, ...result.picked])).toBeLessThan(Infinity)
  })

  it('picks it once nothing with a place is left, and says so', () => {
    const result = fit(chain, [noPlace, hasPlace], 2)
    expect(ids(result.picked)).toEqual(['hasPlace', 'noPlace'])
    expect(scoreOf(result, 'noPlace').clashes).toBeGreaterThan(0)
  })

  it('ranks by tempo when every candidate clashes with every track', () => {
    const fixed = [track('a', '8B', 100), track('b', '8B', 104), track('c', '8B', 108)]
    const clashing = [track('far', '2B', 150), track('near', '12B', 103), track('mid', '4B', 120)]
    const ranking = fit(fixed, clashing, 0).ranking
    expect(ranking.map((s) => s.id)).toEqual(['near', 'mid', 'far'])
    expect(ranking.every((s) => s.clashes > 0)).toBe(true)
    expect(ranking.every((s) => s.after?.move === 'clash' && s.before?.move === 'clash')).toBe(true)
    expect(ids(fit(fixed, clashing, 1).picked)).toEqual(['near'])
  })

  it('picks the one track that bridges two groups of keys that cannot meet', () => {
    // 8B and 2B have no move either way; 9B has one to and from both.
    const fixed = [track('g1', '8B', 100), track('g2', '8B', 102), track('h1', '2B', 100)]
    const candidates = [
      track('fitsG', '8B', 101),
      track('bridge', '9B', 110),
      track('fitsH', '2B', 100),
    ]
    expect(solvedCost(fixed)).toBe(Infinity)
    const result = fit(fixed, candidates, 1)
    expect(ids(result.picked)).toEqual(['bridge'])
    expect(scoreOf(result, 'bridge').clashes).toBeLessThan(0)
    expect(solvedCost([...fixed, ...result.picked])).toBeLessThan(Infinity)
    expect(solvedCost([...fixed, track('fitsG', '8B', 101)])).toBe(Infinity)
  })

  it('counts a slot the mix rules forbid as no place', () => {
    const x = track('x', '8B')
    const y = track('y', '9B')
    // Legal next to x only, and x → t → y is a clash: its only place is before x.
    const t = track('t', '8A')
    const u = track('u', '8B', 130)
    expect(transitionCost(t, x, profile).move).not.toBe('clash')
    expect(transitionCost(t, y, profile).move).toBe('clash')
    expect(scoreOf(fit([x, y], [t, u], 0), 't').clashes).toBe(0)

    expect(scoreOf(fit([x, y], [t, u], 0, { start: 'x' }), 't').clashes).toBeGreaterThan(0)
    expect(ids(fit([x, y], [t, u], 1, { start: 'x' }).picked)).toEqual(['u'])
    expect(solvedCost([x, y, t], { ...NO_CONSTRAINTS, start: 'x' })).toBe(Infinity)
  })

  it('never puts a pick inside a follow pair or outside the opener and closer', () => {
    const x = track('x', '8B', 100)
    const y = track('y', '8B', 104)
    const z = track('z', '9B', 108)
    const between = track('between', '8B', 102)
    const result = fit([x, y, z], [between], 1, { start: 'x', end: 'z', follows: [['x', 'y']] })
    expect(ids(result.order)).toEqual(['x', 'y', 'between', 'z'])
    expect(scoreOf(result, 'between').clashes).toBe(0)
  })

  it('finds no place when the rules leave no slot at all', () => {
    const only = track('only', '8B')
    const result = fit([only], [track('t', '8B')], 1, { start: 'only', end: 'only' })
    expect(scoreOf(result, 't').clashes).toBeGreaterThan(0)
    expect(ids(result.picked)).toEqual(['t'])
  })

  it('falls back to the fewest clashes when the rules are invalid', () => {
    const fixed = [track('a', '8B'), track('b', '8B')]
    const result = fit(fixed, [track('t', '8B', 101)], 1, { start: 'missing' })
    expect(ids(result.picked)).toEqual(['t'])
    expect(scoreOf(result, 't').clashes).toBe(0)
  })
})

describe('pickBestFit: cases from the adversarial review', () => {
  it('charges a track at an end of the mix for one transition, not two', () => {
    // 9A has a perfect move to 8B and none to the others: it goes on the end, for free.
    const fixed = [track('f8', '8B'), track('f10', '10B'), track('f11', '11B')]
    const result = fit(fixed, [track('end', '9A', 100), track('mid', '10B', 120)], 1)
    expect(ids(result.picked)).toEqual(['end'])
    expect(scoreOf(result, 'end')).toMatchObject({ clashes: 0, cost: 0 })
    expect([scoreOf(result, 'end').after, scoreOf(result, 'end').before]).toContain(null)
  })

  it('prefers the one good neighbour at an end over two poor ones in the middle', () => {
    const fixed = [
      track('f0', '8A', 97),
      track('f1', '10B', 118),
      track('f2', '10B', 105),
      track('f3', '10A', 118),
    ]
    const candidates = [
      track('p1', '7B', 100),
      track('p2', '7B', 103),
      track('q1', '10A', 89),
      track('q2', '7A', 125),
    ]
    const result = fit(fixed, candidates, 2)
    expect(ids(result.picked)).toEqual(['p1', 'p2'])
    expect(solvedCost([...fixed, ...result.picked])).toBeLessThan(
      solvedCost([...fixed, ...candidates.slice(2)]),
    )
  })

  it('does not price a clash for a track that has a place', () => {
    const fixed = [
      track('a', '11B', 117),
      track('b', '2B', 112),
      track('c', '1B', 106),
      track('d', '2B', 117),
      track('e', '2B', 104),
    ]
    const candidates = [
      track('perfect', '12A', 118),
      track('far', '11A', 102),
      track('farther', '11A', 135),
    ]
    const result = fit(fixed, candidates, 1)
    expect(ids(result.picked)).toEqual(['perfect'])
    expect(scoreOf(result, 'perfect').after?.move ?? 'perfect').not.toBe('clash')
    expect(scoreOf(result, 'perfect').before?.move ?? 'perfect').not.toBe('clash')
  })

  it('asks the solver before a track with no slot in the order loses to a dearer one', () => {
    // 9A fits only beside 8B, which sits in the middle of the first order found.
    const fixed = [track('a7', '7B'), track('x8', '8B'), track('c10', '10B')]
    const result = fit(fixed, [track('t9', '9A', 100), track('u', '8B', 200)], 1)
    expect(ids(result.picked)).toEqual(['t9'])
    expect(scoreOf(result, 't9').clashes).toBe(0)
    expect(ids(result.order).sort()).toEqual(['a7', 'c10', 't9', 'x8'])
    expect(evaluateMix(result.order, profile).clashCount).toBe(0)
  })

  it('asks the solver only so many times', () => {
    const chain = [
      track('p', '12B'),
      track('a', '1A'),
      track('b', '2A'),
      track('c', '5A'),
      track('q', '8B'),
    ]
    const noPlace = Array.from({ length: 8 }, (_, i) => track(`noPlace${i}`, '6A', 100))
    const result = fit(chain, [...noPlace, track('hasPlace', '2A', 120)], 1)
    expect(ids(result.picked)).toEqual(['hasPlace'])
    expect(result.ranking.filter((s) => s.clashes > 0)).toHaveLength(8)
  })

  it('ignores an order that has a clash in it or breaks the rules', () => {
    const a = track('a7', '7B')
    const x = track('x8', '8B')
    const c = track('c10', '10B')
    const t = track('t9', '9A')
    const candidates = [track('good', '7B', 100), track('junk', '12B', 140)]
    const fixed = [a, x, c, t]
    const clashing = [c, t, x, a]
    expect(evaluateMix(clashing, profile).clashCount).toBe(1)
    const base = fit(fixed, candidates, 1)
    expect(ids(base.picked)).toEqual(['good'])
    expect(pickBestFit({ fixed, candidates, count: 1, profile, order: clashing })).toEqual(base)

    const constraints = { ...NO_CONSTRAINTS, start: 'x8' }
    const ruled = pickBestFit({ fixed, candidates, count: 1, profile, constraints })
    const breaksTheRule = pickBestFit({
      fixed,
      candidates,
      count: 1,
      profile,
      constraints,
      order: base.order.filter((track) => fixed.includes(track)),
    })
    expect(breaksTheRule).toEqual(ruled)
  })

  it('keeps the order clash-free when it picks a track the first order had no slot for', () => {
    const fixed = [track('a7', '7B'), track('x8', '8B'), track('c10', '10B')]
    const first = fit(fixed, [track('t9', '9A')], 1)
    expect(evaluateMix(first.order, profile).clashCount).toBe(0)
    const second = pickBestFit({
      fixed: [...fixed, ...first.picked],
      candidates: [track('good', '7B', 100), track('junk', '12B', 140)],
      count: 1,
      profile,
      order: first.order,
    })
    expect(ids(second.picked)).toEqual(['good'])
  })

  it.each([
    { name: 'an opener that is not in the set', rules: { start: 'gone' } },
    { name: 'a follow pair that is a clash', rules: { follows: [['a', 'd']] as const } },
    { name: 'an opener that is a candidate', rules: { start: 'good' } },
  ])('ignores mix rules that cannot hold: $name', ({ rules }) => {
    const fixed = [
      track('a', '12B'),
      track('b', '1A'),
      track('e', '2A'),
      track('d', '5A'),
      track('c', '8B'),
    ]
    const candidates = [track('good', '2A', 100), track('junk', '5A', 150)]
    expect(fit(fixed, candidates, 1, rules)).toEqual(fit(fixed, candidates, 1))
    expect(ids(fit(fixed, candidates, 1, rules).picked)).toEqual(['good'])
  })

  it('compares costs on a grid, so a near-tie gives one answer in any input order', () => {
    const fixed = [track('a', '8B', 100), track('b', '8B', 100)]
    const x = track('x', '8B', 100.000000003)
    const y = track('y', '8B', 100.0000000015)
    const z = track('z', '8B', 100)
    const orders = [
      [x, y, z],
      [x, z, y],
      [y, x, z],
      [y, z, x],
      [z, x, y],
      [z, y, x],
    ]
    const picks = orders.map((candidates) => ids(fit(fixed, candidates, 1).picked)[0])
    expect(new Set(picks).size).toBe(1)
  })
})

describe('pickBestFit: several playlists picking in turn (assumption A10)', () => {
  it('continues from the order of the previous call', () => {
    const first = fit(WCS, ODD, 2)
    const fixed = [...WCS, ...first.picked]
    const second = pickBestFit({
      fixed,
      candidates: SINGALONGS,
      count: 2,
      profile,
      order: first.order,
    })
    const withoutNewPicks = second.order.filter((t) => !second.picked.includes(t))
    expect(ids(withoutNewPicks)).toEqual(ids(first.order))
    expect(evaluateMix(second.order, profile).clashCount).toBe(0)
  })

  it('ignores an order that does not hold exactly the fixed tracks', () => {
    const base = fit(WCS, ODD, 3)
    for (const order of [WCS.slice(1), [...WCS, ...ODD.slice(0, 1)], [...WCS.slice(1), WCS[1]]]) {
      const result = pickBestFit({
        fixed: WCS,
        candidates: ODD,
        count: 3,
        profile,
        order: order.filter((t) => t !== undefined),
      })
      expect(result).toEqual(base)
    }
  })
})

describe('pickBestFit: no fixed tracks (every playlist limited)', () => {
  it('picks a group that mixes well, whatever order the candidates come in', () => {
    const result = fit([], WCS, 6)
    expect(result.picked).toHaveLength(6)
    expect(result.ranking[0]).toMatchObject({ picked: true, cost: 0, after: null, before: null })
    const cost = solvedCost(result.picked)
    expect(cost).toBeLessThan(Infinity)
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(cost).toBeLessThan(solvedCost(randomDraw(WCS, 6, seed)))
      expect(ids(fit([], createPrng(seed).shuffle(WCS), 6).picked)).toEqual(ids(result.picked))
    }
  })

  it('picks one track when one is asked for', () => {
    expect(fit([], WCS, 1).picked).toHaveLength(1)
  })
})

describe('pickBestFit on the WCS set', () => {
  // Hold out 8 of the 20 tracks as candidates and pick 3 back, over several splits.
  const splits = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
    const shuffled = createPrng(seed).shuffle(WCS)
    return { fixed: shuffled.slice(8), candidates: shuffled.slice(0, 8) }
  })
  const results = splits.map(({ fixed, candidates }) => {
    const { picked, ranking } = fit(fixed, candidates, 3)
    const base = solvedCost(fixed)
    const random = [11, 12, 13, 14, 15].map(
      (seed) => solvedCost([...fixed, ...randomDraw(candidates, 3, seed)]) - base,
    )
    return { ranking, added: solvedCost([...fixed, ...picked]) - base, random }
  })

  it('picks tracks that have a place, and the set stays mixable', () => {
    for (const { ranking, added } of results) {
      expect(ranking.filter((s) => s.picked).every((s) => s.clashes === 0)).toBe(true)
      expect(added).toBeLessThan(Infinity)
    }
  })

  it('costs no more than a random draw of the same size, on every split', () => {
    for (const { added, random } of results) expect(added).toBeLessThanOrEqual(mean(random))
  })

  it('adds less than a third of what random draws add, over all splits', () => {
    const fitTotal = results.reduce((sum, r) => sum + r.added, 0)
    const randomTotal = results.reduce((sum, r) => sum + mean(r.random), 0)
    expect(fitTotal).toBeLessThan(randomTotal / 3)
  })
})

describe('pickBestFit on a multi-playlist pool (synthetic, 78–184 BPM)', () => {
  it('has the spread it claims', () => {
    const all = [...MAIN, ...SINGALONGS, ...ODD]
    const bpms = all.map((t) => t.bpm)
    expect(all).toHaveLength(110)
    expect(Math.min(...bpms)).toBe(78)
    expect(Math.max(...bpms)).toBe(184.1)
    expect(all.filter((t) => t.camelot === '2A').length).toBeGreaterThan(0)
  })

  const cases = [
    { name: 'WCS + 6 of both', fixed: WCS, candidates: [...SINGALONGS, ...ODD], count: 6 },
    { name: 'main + 4 of the odd ones', fixed: MAIN.slice(0, 25), candidates: ODD, count: 4 },
    { name: 'singalongs + 5 of the odd ones', fixed: SINGALONGS, candidates: ODD, count: 5 },
  ].map((c) => {
    const { picked, ranking } = fit(c.fixed, c.candidates, c.count)
    const random = [11, 12, 13].map((seed) =>
      solvedCost([...c.fixed, ...randomDraw(c.candidates, c.count, seed)]),
    )
    return { ...c, ranking, cost: solvedCost([...c.fixed, ...picked]), random }
  })

  it.each(cases)('$name: every pick has a place and the set stays mixable', (c) => {
    expect(c.ranking.filter((s) => s.picked).every((s) => s.clashes === 0)).toBe(true)
    expect(c.cost).toBeLessThan(Infinity)
  })

  it.each(cases.slice(0, 2))('$name: costs less than each of three random draws', (c) => {
    expect(c.cost).toBeLessThan(Math.min(...c.random))
  })

  // Known limit (decision 31): the singalongs have four tempo clusters and a dear mix
  // (cost 100). The picks add 0.2 to it, as scored, but a draw that happens to join a
  // cluster lets the solver rearrange the whole mix for less. Only solving once per
  // candidate would see that.
  it('costs less than random draws over the three cases together', () => {
    const total = cases.reduce((sum, c) => sum + c.cost, 0)
    expect(total).toBeLessThan(cases.reduce((sum, c) => sum + mean(c.random), 0))
  })

  it('does not reach for double-time tracks when the set has none', () => {
    const candidates = [...SINGALONGS, ...ODD]
    const fastest = Math.max(...WCS.map((t) => t.bpm))
    expect(candidates.filter((t) => t.bpm > 150).length).toBeGreaterThan(3)
    for (const pick of fit(WCS, candidates, 10).picked) expect(pick.bpm).toBeLessThan(fastest * 1.1)
  })
})

describe('pickBestFit: stability (lesson of 2026-09-28)', () => {
  const SLOW = 30_000
  const cases = [
    { name: 'WCS + 3 of the odd ones', fixed: WCS, candidates: ODD, count: 3 },
    { name: 'WCS + 6 of both', fixed: WCS, candidates: [...SINGALONGS, ...ODD], count: 6 },
    { name: 'main + 4 of the odd ones', fixed: MAIN.slice(0, 25), candidates: ODD, count: 4 },
  ].map((c) => {
    const base = fit(c.fixed, c.candidates, c.count)
    // The set doesn't change when a candidate does, so neither does its order.
    const order = base.order.filter((t) => c.fixed.includes(t))
    const withCandidates = (candidates: readonly MixTrack[]) =>
      pickBestFit({ fixed: c.fixed, candidates, count: c.count, profile, order }).picked
    return { ...c, base, withCandidates }
  })

  it.each(cases)('$name: removing a candidate that was not picked changes nothing', (c) => {
    expect(ids(c.withCandidates(c.candidates))).toEqual(ids(c.base.picked))
    for (const gone of c.candidates.filter((t) => !c.base.picked.includes(t))) {
      const picked = c.withCandidates(c.candidates.filter((t) => t !== gone))
      expect(ids(picked)).toEqual(ids(c.base.picked))
    }
  })

  it.each(cases)('$name: removing a picked candidate keeps the picks before it', (c) => {
    c.base.picked.forEach((gone, rank) => {
      const picked = c.withCandidates(c.candidates.filter((t) => t !== gone))
      expect(ids(picked).slice(0, rank)).toEqual(ids(c.base.picked).slice(0, rank))
      expect(kept(c.base.picked, picked)).toBeGreaterThanOrEqual(c.count - 2)
    })
  })

  it.each(cases)('$name: adding one candidate moves at most one pick', (c) => {
    for (const extra of MAIN.slice(30, 40)) {
      const picked = c.withCandidates([...c.candidates, extra])
      expect(kept(c.base.picked, picked)).toBeGreaterThanOrEqual(c.count - 1)
    }
  })

  it.each(cases)(
    '$name: removing one track of the set keeps most picks',
    (c) => {
      const keptEach = c.fixed.map((gone) => {
        const result = fit(
          c.fixed.filter((t) => t !== gone),
          c.candidates,
          c.count,
        )
        return kept(c.base.picked, result.picked)
      })
      expect(Math.min(...keptEach)).toBeGreaterThanOrEqual(c.count - Math.ceil(c.count / 3))
      expect(mean(keptEach)).toBeGreaterThanOrEqual(0.85 * c.count)
    },
    SLOW,
  )

  it.each(cases)(
    '$name: adding one track to the set keeps most picks',
    (c) => {
      const keptEach = MAIN.slice(30, 40).map((extra) =>
        kept(c.base.picked, fit([...c.fixed, extra], c.candidates, c.count).picked),
      )
      expect(Math.min(...keptEach)).toBeGreaterThanOrEqual(c.count - Math.ceil(c.count / 3))
      expect(mean(keptEach)).toBeGreaterThanOrEqual(0.85 * c.count)
    },
    SLOW,
  )

  it('an unrelated track in the set changes no pick', () => {
    // Unrelated: no chart move to or from any pick, at a tempo far from all of them.
    const base = fit(WCS, ODD, 3)
    const unrelated = ALL_CAMELOT_KEYS.filter((key) =>
      base.picked.every((pick) => moveBetween(key, pick.camelot) === null),
    )
    expect(unrelated.length).toBeGreaterThan(0)
    for (const key of unrelated) {
      const result = fit([...WCS, track('unrelated', key, 160)], ODD, 3)
      expect(ids(result.picked)).toEqual(ids(base.picked))
    }
  })
})
