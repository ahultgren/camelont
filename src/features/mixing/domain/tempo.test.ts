import { describe, expect, it } from 'vitest'
import { tempoGap } from './tempo'

describe('tempoGap', () => {
  it('is relative to the faster track', () => {
    expect(tempoGap(100, 110)).toBeCloseTo(10 / 110)
    expect(tempoGap(110, 100)).toBeCloseTo(10 / 110)
  })

  it('is zero for equal tempos', () => {
    expect(tempoGap(120, 120)).toBe(0)
  })

  it('tolerates half and double time', () => {
    expect(tempoGap(87.5, 175)).toBe(0)
    expect(tempoGap(176, 88)).toBe(0)
    expect(tempoGap(90, 184)).toBeCloseTo(4 / 184)
  })

  it('handles zero safely', () => {
    expect(tempoGap(0, 0)).toBe(0)
  })
})
