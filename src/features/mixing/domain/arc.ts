import { setTempo } from './tempo'
import type { MixTrack } from './types'

/**
 * The optional energy arc: a target curve over set position, a signal it applies to,
 * and a weight. Presets are data; signals are functions. Removing arcs means deleting
 * this file and the one term in evaluate.ts.
 */
export type ArcPresetId = 'twoWaves' | 'steadyBuild'
export type ArcSignalId = 'bpm'

export interface ArcPreset {
  id: ArcPresetId
  name: string
  description: string
  /** Piecewise-linear target: [position 0..1, level 0..1], sorted by position. */
  points: readonly (readonly [number, number])[]
}

export interface ArcConfig {
  preset: ArcPresetId
  signal: ArcSignalId
  /** Cost per unit of deviation per track. */
  weight: number
}

export const ARC_PRESETS: Record<ArcPresetId, ArcPreset> = {
  // Modelled on the hand-tuned WCS set (the quality bar, research.md §3): slow opener,
  // first peak about a third in, a breather, a second wave that dips, and a climb that
  // closes near the top.
  twoWaves: {
    id: 'twoWaves',
    name: 'Two waves',
    description: 'Slow opener, a first peak, a breather, then a second wave that closes high.',
    points: [
      [0, 0.1],
      [0.32, 1],
      [0.42, 0.3],
      [0.55, 0.75],
      [0.75, 0.3],
      [1, 0.85],
    ],
  },
  steadyBuild: {
    id: 'steadyBuild',
    name: 'Steady build',
    description: 'Start low and rise steadily to the end.',
    points: [
      [0, 0.05],
      [1, 1],
    ],
  },
}

export const DEFAULT_ARC_WEIGHT = 8

/** Target level (0..1) of a preset at a position (0..1). */
export function arcTarget(preset: ArcPreset, position: number): number {
  const points = preset.points
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return 0
  if (position <= first[0]) return first[1]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a && b && position <= b[0]) {
      const t = b[0] === a[0] ? 1 : (position - a[0]) / (b[0] - a[0])
      return a[1] + t * (b[1] - a[1])
    }
  }
  return last[1]
}

/**
 * Signals, built for a set: each gives a track's value in that set (null when unknown).
 * BPM is the set tempo, so a track listed at double time isn't scored as the fastest.
 */
const ARC_SIGNALS: Record<
  ArcSignalId,
  (tracks: readonly MixTrack[]) => (track: MixTrack) => number | null
> = {
  bpm: (tracks) => {
    const fold = setTempo(tracks.map((t) => t.bpm))
    return (track) => fold(track.bpm)
  },
}

export interface SignalRange {
  min: number
  max: number
}

/** A signal over a set: each track's value and the range used to normalise it to 0..1. */
export interface ArcScale {
  value: (track: MixTrack) => number | null
  range: SignalRange
}

export function arcScale(tracks: readonly MixTrack[], signal: ArcSignalId): ArcScale | null {
  const value = ARC_SIGNALS[signal](tracks)
  const values = tracks.map(value).filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return { value, range: { min: Math.min(...values), max: Math.max(...values) } }
}

export function normalise(value: number, range: SignalRange): number {
  return range.max === range.min ? 0.5 : (value - range.min) / (range.max - range.min)
}

/** Position (0..1) of the i-th of n tracks. */
export const arcPosition = (index: number, count: number): number =>
  count <= 1 ? 0 : index / (count - 1)

/** Arc cost of one track at one position (0 when the signal is unknown). */
export function arcTermCost(
  track: MixTrack,
  index: number,
  count: number,
  arc: ArcConfig,
  scale: ArcScale,
): number {
  const value = scale.value(track)
  if (value === null) return 0
  const target = arcTarget(ARC_PRESETS[arc.preset], arcPosition(index, count))
  return arc.weight * Math.abs(normalise(value, scale.range) - target)
}
