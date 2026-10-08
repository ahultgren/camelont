import { camelotParts, type CamelotKey, type WheelNumber } from '@/shared/music'

/** Display details of an entry, keyed by entry ID (the engine only knows labels). */
export interface EntryInfo {
  title: string
  artists: readonly string[]
  durationMs: number
}

/** An auto-ranged axis padded to whole steps. */
export function niceRange(
  min: number,
  max: number,
  step = 10,
): { min: number; max: number; ticks: number[] } {
  let lo = Math.floor(min / step) * step
  let hi = Math.ceil(max / step) * step
  if (hi - lo < step * 2) {
    lo -= step
    hi += step
  }
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v)
  return { min: lo, max: hi, ticks }
}

export interface Frame {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

export function linearX(frame: Frame, count: number) {
  const inner = frame.width - frame.left - frame.right
  return (i: number) => frame.left + (count <= 1 ? inner / 2 : (i * inner) / (count - 1))
}

export function linearY(frame: Frame, min: number, max: number) {
  const inner = frame.height - frame.top - frame.bottom
  return (v: number) => frame.top + ((max - v) * inner) / (max - min || 1)
}

/** Width that gives each track at least `perTrack` px, for horizontal scrolling. */
export const chartWidth = (count: number, base = 640, perTrack = 34): number =>
  Math.max(base, 60 + count * perTrack)

/** How many tracks use each key, e.g. 7B × 5. */
export function keyCounts(keys: readonly CamelotKey[]): Map<CamelotKey, number> {
  const counts = new Map<CamelotKey, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  return counts
}

export interface WheelCell {
  key: CamelotKey
  n: WheelNumber
  path: string
  labelX: number
  labelY: number
}

/** Two rings: outer major (B), inner minor (A); 1 at the top, clockwise. */
export function wheelCells(center = 110): WheelCell[] {
  const cells: WheelCell[] = []
  const point = (r: number, a: number) =>
    [center + r * Math.sin(a), center - r * Math.cos(a)] as const
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const [x1, y1] = point(r1, a0)
    const [x2, y2] = point(r1, a1)
    const [x3, y3] = point(r0, a1)
    const [x4, y4] = point(r0, a0)
    const f = (v: number) => v.toFixed(2)
    return `M${f(x1)},${f(y1)}A${String(r1)},${String(r1)} 0 0 1 ${f(x2)},${f(y2)}L${f(x3)},${f(y3)}A${String(r0)},${String(r0)} 0 0 0 ${f(x4)},${f(y4)}Z`
  }
  for (let n = 1; n <= 12; n++) {
    const a0 = (((n - 1) * 30 - 15) * Math.PI) / 180
    const a1 = a0 + (30 * Math.PI) / 180
    const mid = (a0 + a1) / 2
    for (const [mode, r0, r1] of [
      ['B', 74, 106],
      ['A', 40, 72],
    ] as const) {
      const key = `${String(n)}${mode}` as CamelotKey
      const [labelX, labelY] = point((r0 + r1) / 2, mid)
      cells.push({
        key,
        n: camelotParts(key).n,
        path: arc(r0, r1, a0 + 0.012, a1 - 0.012),
        labelX,
        labelY,
      })
    }
  }
  return cells
}

export const formatBpmDelta = (delta: number): string =>
  `${delta >= 0 ? '+' : '−'}${String(Math.round(Math.abs(delta) * 10) / 10)} BPM`

export const totalMinutes = (durationsMs: readonly number[]): number =>
  Math.round(durationsMs.reduce((s, d) => s + d, 0) / 60000)
