import { describe, expect, it } from 'vitest'
import { setTempo, tempoGap } from './tempo'

describe('tempoGap', () => {
  it('is relative to the faster track', () => {
    expect(tempoGap(100, 110)).toBeCloseTo(10 / 110)
    expect(tempoGap(110, 100)).toBeCloseTo(10 / 110)
  })

  it('is zero for equal tempos', () => {
    expect(tempoGap(120, 120)).toBe(0)
  })

  it('compares set tempos as they are (half/double time is folded before)', () => {
    expect(tempoGap(78, 129.9)).toBeCloseTo(51.9 / 129.9)
  })

  it('handles zero safely', () => {
    expect(tempoGap(0, 0)).toBe(0)
  })
})

// The owner's WCS playlist as listed; Price Tag (175) and We Are Young (184.1) are
// listed at double the danced tempo.
const OWNER_SET = [
  78, 88, 88, 175, 91, 184.1, 92.5, 96, 102.1, 102.1, 104, 104, 105, 107, 108.9, 114, 114, 115.7,
  116, 118, 118.8, 121, 122, 127.4, 129.9,
]

describe('setTempo', () => {
  it("folds the owner's double-time tracks and nothing else", () => {
    const folded = OWNER_SET.map(setTempo(OWNER_SET))
    expect(folded).toEqual(
      OWNER_SET.map((bpm) => (bpm === 175 ? 87.5 : bpm === 184.1 ? 92.05 : bpm)),
    )
  })

  it('is stable: nudging one track never refolds another', () => {
    const base = OWNER_SET.map(setTempo(OWNER_SET))
    OWNER_SET.forEach((_, i) => {
      for (const delta of [-1, 1]) {
        const edited = OWNER_SET.map((b, j) => (j === i ? b + delta : b))
        const folded = edited.map(setTempo(edited))
        folded.forEach((v, j) => {
          if (j !== i) expect(v).toBe(base[j])
        })
      }
    })
  })

  it('folds half-time tracks up into the octave most of the set is listed in', () => {
    const house = [120, 122, 124, 126, 128, 63, 64]
    expect(house.map(setTempo(house))).toEqual([120, 122, 124, 126, 128, 126, 128])
  })

  it('fits the set into the narrowest octave, however far a track is listed', () => {
    const fold = setTempo([88, 90, 92, 350, 22.5])
    expect([350, 22.5].map(fold)).toEqual([87.5, 90])
  })

  it('follows the majority, whichever octave it is', () => {
    const fold = setTempo([170, 176, 180, 90])
    expect(fold(90)).toBe(180)
    expect(fold(176)).toBe(176)
  })

  it('does not depend on the order, and prefers the slower octave on a tie', () => {
    const a = setTempo([60, 61, 120, 122])
    const b = setTempo([122, 60, 120, 61])
    for (const bpm of [60, 61, 120, 122]) expect(a(bpm)).toBe(b(bpm))
    expect([120, 122].map(a)).toEqual([60, 61])
  })

  it('leaves values alone for an empty set', () => {
    expect(setTempo([])(120)).toBe(120)
  })
})
