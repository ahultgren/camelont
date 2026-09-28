import { describe, expect, it } from 'vitest'
import { tempoGap, tempoLine } from './tempo'

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

describe('tempoLine', () => {
  it('is the raw BPM when no neighbour is matched at half or double time', () => {
    expect(tempoLine([100, 110, 95])).toEqual([100, 110, 95])
  })

  it('shows a double-time track at the tempo the comparison matched it at', () => {
    // 175 is compared with 88 as 87.5; 90 then follows 87.5 as is.
    expect(tempoLine([88, 175, 90])).toEqual([88, 87.5, 90])
    expect(tempoLine([92, 45, 94])).toEqual([92, 90, 94])
  })

  it('carries the folding along the chain', () => {
    // 176 matches 88; 180 then matches 176 as is, so it is shown halved too.
    expect(tempoLine([88, 176, 180, 92])).toEqual([88, 88, 90, 92])
  })

  it('keeps most tracks at their listed BPM when the opener is the odd one out', () => {
    expect(tempoLine([170, 88, 90, 92])).toEqual([85, 88, 90, 92])
  })

  it('follows the gap exactly, even where it differs from the nearest octave', () => {
    // 145 / 100 is above √2, but the gap still compares 145 with 100 as is (45 < 55).
    expect(tempoLine([100, 145])).toEqual([100, 145])
    expect(tempoLine([100, 155])).toEqual([100, 77.5])
  })

  it('handles empty and single-track mixes', () => {
    expect(tempoLine([])).toEqual([])
    expect(tempoLine([120])).toEqual([120])
  })
})
