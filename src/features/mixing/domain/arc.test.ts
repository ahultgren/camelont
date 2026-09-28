import { describe, expect, it } from 'vitest'
import { ARC_PRESETS, arcPosition, arcScale, arcTarget, arcTermCost, normalise } from './arc'
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
    const scale = arcScale([track(80), track(120), track(100)], 'bpm')
    expect(scale?.range).toEqual({ min: 80, max: 120 })
    expect(scale?.value(track(100))).toBe(100)
    expect(normalise(100, { min: 80, max: 120 })).toBe(0.5)
    expect(normalise(100, { min: 100, max: 100 })).toBe(0.5)
    expect(arcScale([], 'bpm')).toBeNull()
  })

  it('uses the set tempo, so a double-time track is neither a peak nor stretches the range', () => {
    const scale = arcScale([track(88), track(175), track(90), track(96)], 'bpm')
    expect(scale?.value(track(175))).toBe(87.5)
    expect(scale?.range).toEqual({ min: 87.5, max: 96 })
  })

  it('positions tracks evenly', () => {
    expect(arcPosition(0, 1)).toBe(0)
    expect(arcPosition(2, 5)).toBe(0.5)
  })

  it('costs weight × deviation', () => {
    const arc = { preset: 'steadyBuild', signal: 'bpm', weight: 10 } as const
    const scale = arcScale([track(80), track(100), track(120)], 'bpm')
    if (!scale) throw new Error('no scale')
    // last position: target 1; bpm 100 normalises to 0.5
    expect(arcTermCost(track(100), 4, 5, arc, scale)).toBeCloseTo(5)
  })
})
