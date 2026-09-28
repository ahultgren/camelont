import { describe, expect, it } from 'vitest'
import {
  chartWidth,
  formatBpmDelta,
  keyCounts,
  linearX,
  linearY,
  niceRange,
  totalMinutes,
  wheelCells,
} from './layout'

describe('layout helpers', () => {
  it('auto-ranges BPM to whole steps with room', () => {
    expect(niceRange(78, 127.4)).toEqual({
      min: 70,
      max: 130,
      ticks: [70, 80, 90, 100, 110, 120, 130],
    })
    expect(niceRange(100, 104)).toMatchObject({ min: 90, max: 120 })
  })

  it('maps positions and values into the frame', () => {
    const frame = { width: 100, height: 100, left: 10, right: 10, top: 10, bottom: 10 }
    const x = linearX(frame, 5)
    expect([x(0), x(4)]).toEqual([10, 90])
    expect(linearX(frame, 1)(0)).toBe(50)
    const y = linearY(frame, 0, 100)
    expect([y(100), y(0)]).toEqual([10, 90])
  })

  it('widens the chart for long mixes', () => {
    expect(chartWidth(20)).toBe(740)
    expect(chartWidth(5)).toBe(640)
  })

  it('counts keys', () => {
    expect([...keyCounts(['7B', '7B', '8A'])]).toEqual([
      ['7B', 2],
      ['8A', 1],
    ])
  })

  it('lays out 24 wheel cells with 1 at the top', () => {
    const cells = wheelCells()
    expect(cells).toHaveLength(24)
    const oneB = cells.find((c) => c.key === '1B')
    expect(oneB?.labelX).toBeCloseTo(110)
    expect(oneB?.labelY).toBeLessThan(30)
  })

  it('formats deltas and durations', () => {
    expect(formatBpmDelta(9.5)).toBe('+9.5 BPM')
    expect(formatBpmDelta(-4)).toBe('−4 BPM')
    expect(totalMinutes([180_000, 150_000])).toBe(6)
  })
})
