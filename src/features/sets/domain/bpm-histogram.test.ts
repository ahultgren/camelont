import { describe, expect, it } from 'vitest'
import { binInRange, bpmHistogram, rangeOnScale, scaleToRange } from './bpm-histogram'

describe('a playlist’s BPM distribution', () => {
  it('counts tracks per 5 BPM on a scale of whole steps around them', () => {
    const histogram = bpmHistogram([78, 88, 89.9, 90, 127.4])
    expect(histogram).toMatchObject({ min: 75, max: 130, step: 5, peak: 2 })
    expect(histogram?.bins).toEqual([1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 1])
  })

  it('puts the top of the scale above the fastest track', () => {
    expect(bpmHistogram([100, 110])).toMatchObject({ min: 100, max: 115, bins: [1, 0, 1] })
  })

  it('widens the steps for a wide spread instead of drawing more bars', () => {
    const histogram = bpmHistogram([60, 175, 184.1, 240])
    expect(histogram?.step).toBe(10)
    expect(histogram?.bins.length).toBeLessThanOrEqual(32)
    expect(histogram?.bins.reduce((sum, count) => sum + count, 0)).toBe(4)
  })

  it('has nothing to draw without a BPM', () => {
    expect(bpmHistogram([])).toBeNull()
    expect(bpmHistogram([Number.NaN])).toBeNull()
  })

  it('says which bars a range lets through, ends included', () => {
    const histogram = bpmHistogram([78, 88, 90, 127.4])
    if (!histogram) throw new Error('no histogram')
    const inRange = (range: { min: number | null; max: number | null }) =>
      histogram.bins.map((_, index) => binInRange(histogram, index, range))
    expect(inRange({ min: null, max: null }).every(Boolean)).toBe(true)
    // 85–90: the 85 bar and the 90 bar (90 itself is inside).
    expect(inRange({ min: 85, max: 90 })).toEqual([
      false,
      false,
      true,
      true,
      ...Array<boolean>(7).fill(false),
    ])
    expect(inRange({ min: 126, max: null }).filter(Boolean)).toHaveLength(1)
  })

  it('draws an open end at the end of the scale and a far value at its edge', () => {
    const histogram = bpmHistogram([78, 127.4])
    if (!histogram) throw new Error('no histogram')
    expect(rangeOnScale(histogram, { min: null, max: null })).toEqual({ min: 75, max: 130 })
    expect(rangeOnScale(histogram, { min: 85, max: 110 })).toEqual({ min: 85, max: 110 })
    expect(rangeOnScale(histogram, { min: 40, max: 300 })).toEqual({ min: 75, max: 130 })
  })

  it('reads a handle at the end of the scale as an open end', () => {
    const histogram = bpmHistogram([78, 127.4])
    if (!histogram) throw new Error('no histogram')
    expect(scaleToRange(histogram, 'min', 75)).toBeNull()
    expect(scaleToRange(histogram, 'min', 60)).toBeNull()
    expect(scaleToRange(histogram, 'min', 85.4)).toBe(85)
    expect(scaleToRange(histogram, 'max', 130)).toBeNull()
    expect(scaleToRange(histogram, 'max', 110)).toBe(110)
    expect(scaleToRange(histogram, 'max', 20)).toBe(75)
    expect(scaleToRange(histogram, 'min', 500)).toBe(130)
  })
})
