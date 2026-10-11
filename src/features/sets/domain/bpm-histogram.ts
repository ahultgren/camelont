/**
 * A playlist's BPM distribution, for the range control (spec W8): the range is set on
 * the same scale the bars are drawn on, so the user sees what a range lets through.
 */
export interface BpmHistogram {
  /** The scale's ends, whole steps around every BPM. A range end here is "open". */
  min: number
  max: number
  step: number
  /** Tracks per step: `bins[i]` counts BPMs in `[min + i × step, min + (i + 1) × step)`. */
  bins: number[]
  /** The fullest bin. */
  peak: number
}

/** Most bars the control draws; wider spreads get wider steps. */
const MAX_BINS = 32
const STEPS = [5, 10, 20, 50]

/** Null when no track has a BPM. */
export function bpmHistogram(bpms: readonly number[]): BpmHistogram | null {
  const known = bpms.filter((bpm) => Number.isFinite(bpm))
  if (known.length === 0) return null
  const lowest = Math.min(...known)
  const highest = Math.max(...known)
  const step =
    STEPS.find((size) => (highest - lowest) / size + 2 <= MAX_BINS) ?? STEPS[STEPS.length - 1] ?? 5
  const min = Math.floor(lowest / step) * step
  // The top end is above every BPM, so a handle resting there leaves nothing out.
  const max = (Math.floor(highest / step) + 1) * step
  const bins = Array.from({ length: (max - min) / step }, () => 0)
  for (const bpm of known) {
    const index = Math.floor((bpm - min) / step)
    bins[index] = (bins[index] ?? 0) + 1
  }
  return { min, max, step, bins, peak: Math.max(...bins) }
}

/** Whether a bin lies inside a range (inclusive; an open end is null), at least in part. */
export function binInRange(
  histogram: BpmHistogram,
  index: number,
  range: { min: number | null; max: number | null },
): boolean {
  const from = histogram.min + index * histogram.step
  const to = from + histogram.step
  return (range.min === null || to > range.min) && (range.max === null || from <= range.max)
}

/**
 * A range end as a place on the scale: an open end rests at the scale's end, and a
 * stored value outside the scale is drawn at its edge.
 */
export function rangeOnScale(
  histogram: BpmHistogram,
  range: { min: number | null; max: number | null },
): { min: number; max: number } {
  const clamp = (value: number) => Math.min(histogram.max, Math.max(histogram.min, value))
  return {
    min: range.min === null ? histogram.min : clamp(range.min),
    max: range.max === null ? histogram.max : clamp(range.max),
  }
}

/**
 * A place on the scale as a range end: the scale's own end means "open" (null), so
 * dragging a handle all the way out removes that limit.
 */
export function scaleToRange(
  histogram: BpmHistogram,
  end: 'min' | 'max',
  value: number,
): number | null {
  const whole = Math.round(value)
  if (end === 'min') return whole <= histogram.min ? null : Math.min(whole, histogram.max)
  return whole >= histogram.max ? null : Math.max(whole, histogram.min)
}
