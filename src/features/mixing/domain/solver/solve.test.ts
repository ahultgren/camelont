import { describe, expect, it } from 'vitest'
import { createPrng } from '@/shared/lib'
import { ALL_CAMELOT_KEYS } from '@/shared/music'
import { WCS_TRACKS, wcsId, wcsOrder } from '@/test/wcs'
import { DEFAULT_ARC_WEIGHT } from '../arc'
import { NO_CONSTRAINTS, type MixConstraints } from '../constraints'
import { evaluateMix, mixTracks } from '../evaluate'
import { DEFAULT_PROFILE, withArc } from '../profile'
import type { MixTrack } from '../types'
import { adjacencyDifference } from './diversity'
import { MIN_ADJACENCY_DIFFERENCE, solveMix, type SolveOutcome } from './solve'

const tracks = mixTracks(WCS_TRACKS)
const brother = wcsId('Brother')
const safe = wcsId('Safe and Sound')
const counting = wcsId('Counting Stars')
const bloodstream = wcsId('Bloodstream')
const stolen = wcsId('Stolen Dance')
const girl = wcsId('Girl on Fire')

const solve = (constraints: Partial<MixConstraints> = {}, extra: { seed?: number } = {}) =>
  solveMix({
    tracks,
    constraints: { ...NO_CONSTRAINTS, ...constraints },
    profile: DEFAULT_PROFILE,
    ...extra,
  })

function solved(outcome: SolveOutcome) {
  if (outcome.kind !== 'solved') throw new Error(`Expected a solution, got ${outcome.kind}`)
  return outcome
}

const ids = (order: readonly MixTrack[]) => order.map((t) => t.id)

describe('solveMix on the WCS set', () => {
  const result = solved(solve())

  it('finds clash-free orders of every track', () => {
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
    for (const mix of result.candidates) {
      expect(mix.clashCount).toBe(0)
      expect([...ids(mix.order)].sort()).toEqual(tracks.map((t) => t.id).sort())
    }
  })

  it('returns up to five meaningfully different mixes, best first', () => {
    const { candidates } = result
    expect(candidates.length).toBeLessThanOrEqual(5)
    expect(candidates.length).toBeGreaterThan(1)
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]?.totalCost).toBeGreaterThanOrEqual(candidates[i - 1]?.totalCost ?? 0)
    }
    for (const a of candidates) {
      for (const b of candidates) {
        if (a === b) continue
        expect(adjacencyDifference(ids(a.order), ids(b.order))).toBeGreaterThanOrEqual(
          MIN_ADJACENCY_DIFFERENCE,
        )
      }
    }
  })

  it('beats the greedy baseline from the same opener', () => {
    const greedy = evaluateMix(mixTracks(wcsOrder('script_greedy')), DEFAULT_PROFILE)
    const best = solved(solve({ start: brother })).candidates[0]
    expect(best?.stats.opener).toBe(brother)
    expect(best?.totalCost).toBeLessThan(greedy.totalCost)
  })

  it('matches or beats the hand-tuned order under the two-waves profile', () => {
    const profile = withArc(DEFAULT_PROFILE, {
      preset: 'twoWaves',
      signal: 'bpm',
      weight: DEFAULT_ARC_WEIGHT,
    })
    const handTuned = evaluateMix(mixTracks(wcsOrder('hand_tuned')), profile)
    const outcome = solved(solveMix({ tracks, constraints: NO_CONSTRAINTS, profile }))
    expect(outcome.candidates[0]?.totalCost).toBeLessThanOrEqual(handTuned.totalCost + 1e-9)
    expect(outcome.candidates[0]?.arc).not.toBeNull()
  })

  it('respects start and end', () => {
    for (const mix of solved(solve({ start: girl, end: safe })).candidates) {
      expect(mix.stats.opener).toBe(girl)
      expect(mix.stats.closer).toBe(safe)
    }
  })

  it('respects follow chains', () => {
    const outcome = solved(
      solve({
        follows: [
          [counting, bloodstream],
          [bloodstream, stolen],
        ],
      }),
    )
    for (const mix of outcome.candidates) {
      const order = ids(mix.order)
      expect(order[order.indexOf(counting) + 1]).toBe(bloodstream)
      expect(order[order.indexOf(bloodstream) + 1]).toBe(stolen)
    }
  })

  it('leaves excluded tracks out', () => {
    const outcome = solved(solve({ excluded: [girl, brother] }))
    for (const mix of outcome.candidates) {
      expect(mix.order).toHaveLength(18)
      expect(ids(mix.order)).not.toContain(girl)
      expect(ids(mix.order)).not.toContain(brother)
    }
  })

  it('is deterministic for a seed', () => {
    const a = solved(solve({}, { seed: 7 })).candidates.map((m) => ids(m.order))
    const b = solved(solve({}, { seed: 7 })).candidates.map((m) => ids(m.order))
    expect(a).toEqual(b)
  })

  it('reports invalid constraints instead of solving', () => {
    const outcome = solve({ follows: [[bloodstream, wcsId('I Wanna Dance')]] })
    expect(outcome.kind).toBe('invalid')
  })

  it('reports infeasibility with diagnostics', () => {
    const outcome = solve({ excluded: [counting, stolen] })
    expect(outcome.kind).toBe('infeasible')
    if (outcome.kind === 'infeasible') {
      expect(outcome.diagnostics).toContainEqual(
        expect.objectContaining({ kind: 'isolated', id: bloodstream }),
      )
    }
  })

  it('handles empty and single-track inputs', () => {
    expect(solve({ excluded: tracks.map((t) => t.id) }).kind).toBe('empty')
    const one = solved(solve({ excluded: tracks.slice(1).map((t) => t.id) }))
    expect(one.candidates).toHaveLength(1)
    expect(one.candidates[0]?.order).toHaveLength(1)
  })
})

describe('solveMix at 100 tracks', () => {
  const rng = createPrng(2026)
  const big: MixTrack[] = Array.from({ length: 100 }, (_, i) => ({
    id: `t${String(i)}`,
    label: `Track ${String(i)}`,
    camelot: ALL_CAMELOT_KEYS[rng.int(24)] ?? '8A',
    bpm: 80 + rng.int(50),
    energy: null,
  }))

  it('finds several clash-free mixes quickly', () => {
    const started = performance.now()
    const outcome = solved(
      solveMix({
        tracks: big,
        constraints: NO_CONSTRAINTS,
        profile: withArc(DEFAULT_PROFILE, { preset: 'twoWaves', signal: 'bpm', weight: 8 }),
      }),
    )
    const elapsed = performance.now() - started
    expect(outcome.candidates.length).toBeGreaterThanOrEqual(3)
    for (const mix of outcome.candidates) {
      expect(mix.clashCount).toBe(0)
      expect(mix.order).toHaveLength(100)
    }
    expect(outcome.stats.timedOut).toBe(false)
    // The spec target is ~2 s on a laptop; allow slack for CI runners.
    expect(elapsed).toBeLessThan(6000)
  })
})
