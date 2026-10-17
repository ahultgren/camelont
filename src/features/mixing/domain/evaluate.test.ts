import { describe, expect, it } from 'vitest'
import { wcsId, wcsOrder } from '@/test/wcs'
import { DEFAULT_ARC_WEIGHT } from './arc'
import { evaluateMix, mixTracks, transitionCost } from './evaluate'
import { DEFAULT_PROFILE, NO_SHAPING, profileFor, SLOPE_WEIGHT, withArc } from './profile'
import type { MixTrack } from './types'

const handTuned = mixTracks(wcsOrder('hand_tuned'))
const greedy = mixTracks(wcsOrder('script_greedy'))
const original = mixTracks(wcsOrder('original'))

describe('evaluateMix on the WCS fixture', () => {
  it('scores the hand-tuned order as clash-free: 9 perfect, 7 boost, 3 drop', () => {
    const mix = evaluateMix(handTuned, DEFAULT_PROFILE)
    expect(mix.clashCount).toBe(0)
    expect(mix.transitions).toHaveLength(19)
    expect(mix.stats.toneCounts).toEqual({ perfect: 9, boost: 7, drop: 3, mood: 0, clash: 0 })
    // It used only perfect, +, − and +++ (research.md §3).
    const used = new Set(mix.transitions.map((t) => t.move))
    expect([...used].sort()).toEqual(['boost1', 'boost3', 'drop1', 'perfect'])
  })

  it('scores the greedy baseline as clash-free', () => {
    expect(evaluateMix(greedy, DEFAULT_PROFILE).clashCount).toBe(0)
  })

  it('counts and costs clashes in an unordered playlist', () => {
    const mix = evaluateMix(original, DEFAULT_PROFILE)
    expect(mix.clashCount).toBeGreaterThan(0)
    const clash = mix.transitions.find((t) => t.move === 'clash')
    expect(clash?.moveCost).toBe(DEFAULT_PROFILE.clashCost)
  })

  it('reports opener, closer, BPM range and peaks', () => {
    const { stats } = evaluateMix(handTuned, DEFAULT_PROFILE)
    expect(stats.opener).toBe(wcsId('Brother'))
    expect(stats.closer).toBe(wcsId('Safe and Sound'))
    expect(stats.bpmRange).toEqual({ min: 78, max: 127.4 })
    // Pompeii (wave 1), I Wanna Dance with Somebody (wave 2), Safe and Sound (close)
    expect(stats.peaks.map((p) => p.index)).toEqual([6, 11, 19])
  })

  it('uses each BPM as saved: a double-time track is a big gap, a peak and the top of the range', () => {
    const tracks = mixTracks(
      [88, 175, 90].map((bpm, i) => ({
        id: String(i),
        label: String(bpm),
        camelot: '8A',
        bpm,
        energy: null,
      })),
    )
    const mix = evaluateMix(tracks, DEFAULT_PROFILE)
    expect(mix.transitions.map((t) => t.tempoGap)).toEqual([87 / 175, 85 / 175])
    expect(mix.stats.bpmRange).toEqual({ min: 88, max: 175 })
    expect(mix.stats.peaks).toEqual([{ index: 1, id: '1', bpm: 175 }])
  })

  it('scores the arc on the saved BPM, so a double-time track counts as the fastest', () => {
    const profile = withArc(DEFAULT_PROFILE, { preset: 'steadyBuild', signal: 'bpm', weight: 10 })
    const tracks = mixTracks(
      [88, 92, 96, 184].map((bpm, i) => ({
        id: String(i),
        label: String(bpm),
        camelot: '8A',
        bpm,
        energy: null,
      })),
    )
    expect(evaluateMix(tracks, profile).arc?.range).toEqual({ min: 88, max: 184 })
  })

  it('sums move and tempo costs into the total', () => {
    const mix = evaluateMix(handTuned, DEFAULT_PROFILE)
    const sum = mix.transitions.reduce((s, t) => s + t.cost, 0)
    expect(mix.totalCost).toBeCloseTo(sum)
    expect(mix.arc).toBeNull()
    const first = mix.transitions[0]
    // Brother (12B, 78) → Love Is (11B, 88): drop1 + 20 × 10/88
    expect(first?.move).toBe('drop1')
    expect(first?.cost).toBeCloseTo(1 + (20 * 10) / 88)
  })

  it('adds the arc term, and two waves prefers the hand-tuned shape', () => {
    const profile = withArc(DEFAULT_PROFILE, {
      preset: 'twoWaves',
      signal: 'bpm',
      weight: DEFAULT_ARC_WEIGHT,
    })
    const tuned = evaluateMix(handTuned, profile)
    const base = evaluateMix(greedy, profile)
    expect(tuned.arc?.cost).toBeGreaterThan(0)
    expect(tuned.totalCost).toBeCloseTo(tuned.transitionCost + (tuned.arc?.cost ?? 0))
    expect(tuned.arc?.cost).toBeLessThan(base.arc?.cost ?? 0)
    expect(tuned.arc?.target).toHaveLength(20)
  })

  describe('with energy', () => {
    const pair = (camelot: string, from: number | null, to: number | null) =>
      mixTracks([
        { id: 'a', label: 'a', camelot: '8B', bpm: 100, energy: from },
        { id: 'b', label: 'b', camelot, bpm: 100, energy: to },
      ]) as [MixTrack, MixTrack]

    it('leaves the default profile as it was: energy changes nothing', () => {
      const [a, b] = pair('10B', 0.2, 0.9)
      const plain = transitionCost(a, b, DEFAULT_PROFILE)
      expect(plain.move).toBe('boost3')
      expect(plain.moveCost).toBe(2)
      expect(plain.energyCost).toBe(0)
      expect(plain.cost).toBe(2)
      expect(profileFor(NO_SHAPING)).toEqual(DEFAULT_PROFILE)
    })

    it('charges a climb in energy when steps are scored, and a fall much less', () => {
      const steps = profileFor({ ...NO_SHAPING, energySteps: true })
      // 0.4 → 0.8 is 0.3 beyond the free 0.1: 10 × 0.3
      expect(transitionCost(...pair('8B', 0.4, 0.8), steps).energyCost).toBeCloseTo(3)
      expect(transitionCost(...pair('8B', 0.8, 0.4), steps).energyCost).toBeCloseTo(0.75)
      expect(transitionCost(...pair('8B', 0.4, null), steps).energyCost).toBe(0)
      const t = transitionCost(...pair('9B', 0.4, 0.8), steps)
      expect(t.cost).toBeCloseTo(t.moveCost + t.tempoCost + t.energyCost)
    })

    it('makes +++ free into a rise in energy with key lift, and dearer into a fall', () => {
      const lift = profileFor({ ...NO_SHAPING, keyLift: true })
      // 8B → 10B is +++ (2); 8B → 6B is −−− (2).
      expect(transitionCost(...pair('10B', 0.4, 0.8), lift).moveCost).toBeCloseTo(0)
      expect(transitionCost(...pair('10B', 0.8, 0.4), lift).moveCost).toBeCloseTo(4)
      expect(transitionCost(...pair('6B', 0.8, 0.4), lift).moveCost).toBeCloseTo(0)
      expect(transitionCost(...pair('6B', 0.4, 0.8), lift).moveCost).toBeCloseTo(4)
      // No direction, or no energy: the move costs what it costs.
      expect(transitionCost(...pair('8B', 0.4, 0.8), lift).moveCost).toBe(0)
      expect(transitionCost(...pair('10B', null, 0.8), lift).moveCost).toBe(2)
    })

    it('sums every term into the total', () => {
      const shaped = profileFor({
        arc: 'twoWaves',
        arcBalance: 1,
        energySteps: true,
        keyLift: true,
        keysFollowArc: false,
      })
      const mix = evaluateMix(handTuned, shaped)
      const transitions = mix.transitions.reduce((sum, t) => sum + t.cost, 0)
      expect(mix.arc?.config.signal).toBe('energy')
      expect(mix.arc?.range).toEqual({ min: 0.414, max: 0.929 })
      expect(mix.totalCost).toBeCloseTo(transitions + (mix.arc?.cost ?? 0))
      expect(mix.transitions.some((t) => t.energyCost > 0)).toBe(true)
    })
  })

  describe('aligned with the arc', () => {
    const aligned = profileFor({
      ...NO_SHAPING,
      arc: 'twoWaves',
      arcBalance: 0.5,
      keysFollowArc: true,
    })

    it('pulls BPM and energy to the line, each on its own range', () => {
      const mix = evaluateMix(handTuned, aligned)
      expect(mix.arc?.ranges).toEqual({
        bpm: { min: 78, max: 127.4 },
        energy: { min: 0.414, max: 0.929 },
      })
      // The target is drawn against BPM, the first of the two.
      expect(mix.arc?.range).toEqual({ min: 78, max: 127.4 })
    })

    it('marks and charges every move against the slope', () => {
      const mix = evaluateMix(handTuned, aligned)
      const against = mix.arc?.against ?? []
      expect(against).toHaveLength(19)
      // Brother → Love Is is a − while two waves climbs from the start.
      expect(mix.transitions[0]?.move).toBe('drop1')
      expect(against[0]).toBe(true)
      const count = against.filter(Boolean).length
      expect(mix.arc?.slopeCost).toBe(count * SLOPE_WEIGHT)
      const transitions = mix.transitions.reduce((sum, t) => sum + t.cost, 0)
      expect(mix.totalCost).toBeCloseTo(transitions + (mix.arc?.cost ?? 0))
    })

    it('marks nothing when the keys are not asked to follow the arc', () => {
      const loose = profileFor({ ...NO_SHAPING, arc: 'twoWaves', arcBalance: 0.5 })
      const mix = evaluateMix(handTuned, loose)
      expect(mix.arc?.against.some(Boolean)).toBe(false)
      expect(mix.arc?.slopeCost).toBe(0)
    })
  })

  it('handles empty and single-track mixes', () => {
    expect(evaluateMix([], DEFAULT_PROFILE).totalCost).toBe(0)
    const one = evaluateMix(handTuned.slice(0, 1), DEFAULT_PROFILE)
    expect(one.transitions).toEqual([])
    expect(one.stats.peaks).toEqual([])
  })
})
