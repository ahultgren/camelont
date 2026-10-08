import { describe, expect, it } from 'vitest'
import { ARC_PRESETS, arcPosition, arcTarget, arcTermCost, normalise, signalRange } from './arc'
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

  it('positions tracks evenly', () => {
    expect(arcPosition(0, 1)).toBe(0)
    expect(arcPosition(2, 5)).toBe(0.5)
  })

  it('costs weight × deviation', () => {
    const arc = { preset: 'steadyBuild', signal: 'bpm', weight: 10 } as const
    const range = { min: 80, max: 120 }
    // last position: target 1; bpm 100 normalises to 0.5
    expect(arcTermCost(track(100), 4, 5, arc, range)).toBeCloseTo(5)
  })
})
