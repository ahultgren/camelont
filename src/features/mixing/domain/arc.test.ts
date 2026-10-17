import { describe, expect, it } from 'vitest'
import {
  againstSlope,
  ARC_PRESETS,
  arcPosition,
  arcRanges,
  arcSlopes,
  arcTarget,
  arcTermCost,
  measureWeights,
  normalise,
  signalRange,
} from './arc'
import type { MixTrack } from './types'

const track = (bpm: number): MixTrack => ({
  id: String(bpm),
  label: '',
  camelot: '8A',
  bpm,
  energy: null,
})

describe('arcTarget', () => {
  it('interpolates between points and clamps at the ends', () => {
    const build = ARC_PRESETS.steadyBuild
    expect(arcTarget(build, 0)).toBeCloseTo(0.05)
    expect(arcTarget(build, 1)).toBeCloseTo(1)
    expect(arcTarget(build, 0.5)).toBeCloseTo(0.525)
    expect(arcTarget(build, -1)).toBeCloseTo(0.05)
    expect(arcTarget(build, 2)).toBeCloseTo(1)
  })

  it('gives two waves a peak, a breather and a high close', () => {
    const waves = ARC_PRESETS.twoWaves
    expect(arcTarget(waves, 0.32)).toBe(1)
    expect(arcTarget(waves, 0.42)).toBeLessThan(0.5)
    expect(arcTarget(waves, 1)).toBeGreaterThan(0.8)
  })
})

describe('signals', () => {
  it('normalises over the set range', () => {
    const range = signalRange([track(80), track(120), track(100)], 'bpm')
    expect(range).toEqual({ min: 80, max: 120 })
    expect(normalise(100, { min: 80, max: 120 })).toBe(0.5)
    expect(normalise(100, { min: 100, max: 100 })).toBe(0.5)
    expect(signalRange([], 'bpm')).toBeNull()
  })

  it('can follow energy, and lets a track of unknown energy be anywhere', () => {
    const withEnergy = (energy: number | null): MixTrack => ({ ...track(100), energy })
    const tracks = [withEnergy(0.4), withEnergy(null), withEnergy(0.9)]
    expect(signalRange(tracks, 'energy')).toEqual({ min: 0.4, max: 0.9 })
    const arc = { preset: 'steadyBuild', signal: 'energy', weight: 10 } as const
    const range = { energy: { min: 0.4, max: 0.9 } }
    // last position: target 1; energy 0.4 is the lowest in the set
    expect(arcTermCost(withEnergy(0.4), 4, 5, arc, range)).toBeCloseTo(10)
    expect(arcTermCost(withEnergy(null), 4, 5, arc, range)).toBe(0)
  })

  it('positions tracks evenly', () => {
    expect(arcPosition(0, 1)).toBe(0)
    expect(arcPosition(2, 5)).toBe(0.5)
  })

  it('costs weight × deviation', () => {
    const arc = { preset: 'steadyBuild', signal: 'bpm', weight: 10 } as const
    const range = { bpm: { min: 80, max: 120 } }
    // last position: target 1; bpm 100 normalises to 0.5
    expect(arcTermCost(track(100), 4, 5, arc, range)).toBeCloseTo(5)
  })
})

describe('an arc that follows BPM and energy together', () => {
  const track2 = (bpm: number, energy: number | null): MixTrack => ({ ...track(bpm), energy })

  it('has a range for each, and charges both deviations', () => {
    const tracks = [track2(80, 0.4), track2(120, 0.9)]
    const ranges = arcRanges(tracks, 'both')
    expect(ranges).toEqual({ bpm: { min: 80, max: 120 }, energy: { min: 0.4, max: 0.9 } })
    const arc = { preset: 'steadyBuild', signal: 'both', weight: 10 } as const
    if (!ranges) throw new Error('no ranges')
    // Last position: target 1. Fast and intense: nothing to pay.
    expect(arcTermCost(track2(120, 0.9), 4, 5, arc, ranges)).toBeCloseTo(0)
    // Fast but calm (or the reverse) pays for the half that is low.
    expect(arcTermCost(track2(120, 0.4), 4, 5, arc, ranges)).toBeCloseTo(10)
    expect(arcTermCost(track2(80, 0.9), 4, 5, arc, ranges)).toBeCloseTo(10)
    expect(arcTermCost(track2(80, null), 4, 5, arc, ranges)).toBeCloseTo(10)
  })

  it('has no ranges for a set with nothing to measure', () => {
    expect(arcRanges([track2(80, null)], 'energy')).toBeNull()
    expect(arcRanges([track2(80, null)], 'both')).toEqual({ bpm: { min: 80, max: 80 } })
  })
})

describe('the slope of the arc', () => {
  it('rises all the way in a steady build', () => {
    expect(arcSlopes(ARC_PRESETS.steadyBuild, 5)).toEqual([1, 1, 1, 1])
  })

  it('rises, falls, rises, falls and rises in two waves', () => {
    const slopes = arcSlopes(ARC_PRESETS.twoWaves, 20)
    expect(slopes).toHaveLength(19)
    const runs = slopes.filter((s, i) => s !== slopes[i - 1])
    expect(runs).toEqual([1, -1, 1, -1, 1])
  })

  it('lets only perfect and + moves rise, and only perfect and − moves fall', () => {
    expect(againstSlope('perfect', 1)).toBe(false)
    expect(againstSlope('boost', 1)).toBe(false)
    expect(againstSlope('drop', 1)).toBe(true)
    expect(againstSlope('mood', 1)).toBe(true)
    expect(againstSlope('perfect', -1)).toBe(false)
    expect(againstSlope('drop', -1)).toBe(false)
    expect(againstSlope('boost', -1)).toBe(true)
    expect(againstSlope('mood', -1)).toBe(true)
    expect(againstSlope('drop', 0)).toBe(false)
  })
})

describe('the balance between BPM and energy', () => {
  const track2 = (bpm: number, energy: number): MixTrack => ({ ...track(bpm), energy })
  const ranges = { bpm: { min: 80, max: 120 }, energy: { min: 0.4, max: 0.9 } }
  const both = (balance?: number) =>
    ({
      preset: 'steadyBuild',
      signal: 'both',
      weight: 10,
      ...(balance === undefined ? {} : { balance }),
    }) as const

  it('counts both fully in the middle, and fades one out toward either end', () => {
    expect(measureWeights(both())).toEqual({ bpm: 1, energy: 1 })
    expect(measureWeights(both(0.5))).toEqual({ bpm: 1, energy: 1 })
    expect(measureWeights(both(0.25))).toEqual({ bpm: 1, energy: 0.5 })
    expect(measureWeights(both(0.75))).toEqual({ bpm: 0.5, energy: 1 })
    expect(measureWeights(both(0))).toEqual({ bpm: 1, energy: 0 })
    expect(measureWeights(both(1))).toEqual({ bpm: 0, energy: 1 })
  })

  it('is what a single signal is at either end', () => {
    expect(measureWeights({ preset: 'twoWaves', signal: 'bpm', weight: 8 })).toEqual({
      bpm: 1,
      energy: 0,
    })
    expect(measureWeights({ preset: 'twoWaves', signal: 'energy', weight: 8 })).toEqual({
      bpm: 0,
      energy: 1,
    })
  })

  it('weighs each deviation by its share', () => {
    // Last position: target 1. Fast (on the line) but calm (1 below it).
    const calm = track2(120, 0.4)
    expect(arcTermCost(calm, 4, 5, both(0.5), ranges)).toBeCloseTo(10)
    expect(arcTermCost(calm, 4, 5, both(0.25), ranges)).toBeCloseTo(5)
    expect(arcTermCost(calm, 4, 5, both(0), ranges)).toBeCloseTo(0)
  })
})
