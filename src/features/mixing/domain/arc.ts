import type { MoveTone } from '@/shared/music'
import type { MixTrack } from './types'

/**
 * The optional arc: a target curve over set position, the signal it applies to (BPM,
 * energy, or both at once), a weight, and optionally a cost for key moves that go
 * against its slope. Presets are data; measures are functions. Removing arcs means
 * deleting this file and the one term in evaluate.ts.
 */
export type ArcPresetId = 'twoWaves' | 'steadyBuild'
/** What the arc follows; `both` pulls BPM and energy to the line, each on its own range. */
export type ArcSignalId = 'bpm' | 'energy' | 'both'
/** A value of a track that an arc can follow. */
export type ArcMeasure = 'bpm' | 'energy'
/** What the user picks: one of the presets, or no arc at all. */
export type ArcChoice = ArcPresetId | 'none'

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
  /** Cost per unit of deviation per track, for each measure the signal follows. */
  weight: number
  /**
   * Cost of a key move against the arc's slope: where it rises, anything but perfect
   * and boosts; where it falls, anything but perfect and drops. 0 or absent is off.
   */
  slopeWeight?: number
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

/** Raw value of a measure for a track (null when unknown). */
export const ARC_MEASURES: Record<ArcMeasure, (track: MixTrack) => number | null> = {
  bpm: (track) => track.bpm,
  energy: (track) => track.energy,
}

/** The measures a signal follows. */
export const SIGNAL_MEASURES: Record<ArcSignalId, readonly ArcMeasure[]> = {
  bpm: ['bpm'],
  energy: ['energy'],
  both: ['bpm', 'energy'],
}

export interface SignalRange {
  min: number
  max: number
}

/** A measure's range over a set of tracks, used to normalise it to 0..1. */
export function signalRange(tracks: readonly MixTrack[], measure: ArcMeasure): SignalRange | null {
  const values = tracks.map(ARC_MEASURES[measure]).filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

/** The range of each measure a signal follows; null when none of them has a value. */
export type ArcRanges = Partial<Record<ArcMeasure, SignalRange>>

export function arcRanges(tracks: readonly MixTrack[], signal: ArcSignalId): ArcRanges | null {
  const ranges: ArcRanges = {}
  for (const measure of SIGNAL_MEASURES[signal]) {
    const range = signalRange(tracks, measure)
    if (range) ranges[measure] = range
  }
  return Object.keys(ranges).length > 0 ? ranges : null
}

export function normalise(value: number, range: SignalRange): number {
  return range.max === range.min ? 0.5 : (value - range.min) / (range.max - range.min)
}

/** Position (0..1) of the i-th of n tracks. */
export const arcPosition = (index: number, count: number): number =>
  count <= 1 ? 0 : index / (count - 1)

/** Arc cost of one track at one position: each known measure's distance from the line. */
export function arcTermCost(
  track: MixTrack,
  index: number,
  count: number,
  arc: ArcConfig,
  ranges: ArcRanges,
): number {
  const target = arcTarget(ARC_PRESETS[arc.preset], arcPosition(index, count))
  let deviation = 0
  for (const measure of SIGNAL_MEASURES[arc.signal]) {
    const value = ARC_MEASURES[measure](track)
    const range = ranges[measure]
    if (value !== null && range) deviation += Math.abs(normalise(value, range) - target)
  }
  return arc.weight * deviation
}

/** A change in the line smaller than this between neighbours counts as level. */
const FLAT = 0.01

/** Which way the arc goes from each position to the next: 1 up, −1 down, 0 level. */
export function arcSlopes(preset: ArcPreset, count: number): number[] {
  const slopes: number[] = []
  for (let i = 1; i < count; i++) {
    const rise =
      arcTarget(preset, arcPosition(i, count)) - arcTarget(preset, arcPosition(i - 1, count))
    slopes.push(Math.abs(rise) < FLAT ? 0 : Math.sign(rise))
  }
  return slopes
}

/** Whether a move goes against a slope: only perfect and boosts rise, perfect and drops fall. */
export function againstSlope(tone: MoveTone, slope: number): boolean {
  if (slope === 0 || tone === 'perfect') return false
  return !(tone === (slope > 0 ? 'boost' : 'drop'))
}
