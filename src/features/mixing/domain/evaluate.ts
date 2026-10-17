import { parseCamelot, type MoveTone } from '@/shared/music'
import {
  againstSlope,
  ARC_PRESETS,
  arcPosition,
  arcRanges,
  arcSlopes,
  arcTarget,
  arcTermCost,
  SIGNAL_MEASURES,
  type ArcConfig,
  type ArcRanges,
  type SignalRange,
} from './arc'
import { MOVE_META, moveBetween, type MoveOrClash } from './chart'
import { energyRise, energyStepCost, keyLiftFactor } from './energy'
import type { MixProfile } from './profile'
import { tempoGap } from './tempo'
import type { MixTrack } from './types'

export interface Transition {
  from: string
  to: string
  move: MoveOrClash
  /** The profile's cost of the move, times the key-lift factor when the profile has one. */
  moveCost: number
  tempoGap: number
  tempoCost: number
  /** What the step in energy costs (0 unless the profile scores energy steps). */
  energyCost: number
  /** moveCost + tempoCost + energyCost */
  cost: number
}

export interface Peak {
  index: number
  id: string
  bpm: number
}

export interface MixStats {
  moveCounts: Record<MoveOrClash, number>
  toneCounts: Record<MoveTone, number>
  peaks: Peak[]
  opener: string | null
  closer: string | null
  bpmRange: { min: number; max: number } | null
}

export interface ArcEvaluation {
  config: ArcConfig
  /** Distance from the line, plus `slopeCost`. */
  cost: number
  /** The range the target is drawn against: the first measure the signal follows. */
  range: SignalRange
  ranges: ArcRanges
  /** Target level (0..1) at each position. */
  target: number[]
  /** Per transition: a key move against the arc's slope, when the profile scores that. */
  against: boolean[]
  /** What the moves against the slope cost. */
  slopeCost: number
}

export interface EvaluatedMix {
  order: MixTrack[]
  transitions: Transition[]
  transitionCost: number
  arc: ArcEvaluation | null
  totalCost: number
  clashCount: number
  stats: MixStats
}

/** Cost of one transition. The solver uses this same function. */
export function transitionCost(from: MixTrack, to: MixTrack, profile: MixProfile): Transition {
  const move = moveBetween(from.camelot, to.camelot) ?? 'clash'
  const rise = energyRise(from, to)
  const moveCost =
    (move === 'clash' ? profile.clashCost : profile.moveCost[move]) *
    keyLiftFactor(MOVE_META[move].tone, rise, profile.keyLift)
  const gap = tempoGap(from.bpm, to.bpm)
  const tempoCost = profile.tempoWeight * gap
  const energyCost = energyStepCost(rise, profile.energyStep)
  return {
    from: from.id,
    to: to.id,
    move,
    moveCost,
    tempoGap: gap,
    tempoCost,
    energyCost,
    cost: moveCost + tempoCost + energyCost,
  }
}

/** The arc's ranges over the whole set being mixed (the solver uses them too). */
export function arcRangesOf(tracks: readonly MixTrack[], profile: MixProfile): ArcRanges | null {
  return profile.arc ? arcRanges(tracks, profile.arc.signal) : null
}

/** Which way the profile's arc goes between neighbours, if moves are to follow it. */
export function slopesOf(profile: MixProfile, count: number): number[] | null {
  const arc = profile.arc
  return arc && (arc.slopeWeight ?? 0) > 0 ? arcSlopes(ARC_PRESETS[arc.preset], count) : null
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
}

const ALL_MOVES = Object.keys(MOVE_META) as MoveOrClash[]
const ALL_TONES: readonly MoveTone[] = ['perfect', 'boost', 'drop', 'mood', 'clash']

/**
 * Local BPM maxima that stand out: a peak's prominence (height above the higher of
 * the lowest points on each side before a higher track) must be at least
 * max(5 BPM, 10% of the range).
 */
export function findPeaks(order: readonly MixTrack[]): Peak[] {
  const bpm = order.map((t) => t.bpm)
  if (bpm.length < 2) return []
  const range = Math.max(...bpm) - Math.min(...bpm)
  const minProminence = Math.max(5, 0.1 * range)
  const peaks: Peak[] = []
  bpm.forEach((value, i) => {
    const prev = bpm[i - 1] ?? -Infinity
    const next = bpm[i + 1] ?? -Infinity
    if (!(value > prev && value >= next)) return
    // Lowest point on one side before a higher track (or the end); null if no side.
    const side = (step: 1 | -1): number | null => {
      let low: number | null = null
      for (let j = i + step; j >= 0 && j < bpm.length; j += step) {
        const v = bpm[j] ?? value
        if (v > value) break
        low = Math.min(low ?? v, v)
      }
      return low
    }
    const left = side(-1)
    const right = side(1)
    const bases = [left, right].filter((b): b is number => b !== null)
    const prominence = bases.length ? value - Math.max(...bases) : 0
    const track = order[i]
    if (track && prominence >= minProminence) peaks.push({ index: i, id: track.id, bpm: value })
  })
  return peaks
}

/**
 * The single source of truth for scoring a mix: transitions (move + tempo), the
 * optional arc term, and summary stats. The solver and the UI both use it.
 */
export function evaluateMix(order: readonly MixTrack[], profile: MixProfile): EvaluatedMix {
  const transitions: Transition[] = []
  for (let i = 1; i < order.length; i++) {
    const from = order[i - 1]
    const to = order[i]
    if (from && to) transitions.push(transitionCost(from, to, profile))
  }
  const transitionTotal = transitions.reduce((sum, t) => sum + t.cost, 0)

  let arc: ArcEvaluation | null = null
  const ranges = arcRangesOf(order, profile)
  const config = profile.arc
  const range =
    ranges && config
      ? SIGNAL_MEASURES[config.signal].map((m) => ranges[m]).find(Boolean)
      : undefined
  if (config && ranges && range) {
    const levelCost = order.reduce(
      (sum, track, i) => sum + arcTermCost(track, i, order.length, config, ranges),
      0,
    )
    const slopes = slopesOf(profile, order.length)
    const against = transitions.map((t, i) =>
      slopes ? againstSlope(MOVE_META[t.move].tone, slopes[i] ?? 0) : false,
    )
    const slopeCost = against.filter(Boolean).length * (config.slopeWeight ?? 0)
    const target = order.map((_, i) =>
      arcTarget(ARC_PRESETS[config.preset], arcPosition(i, order.length)),
    )
    arc = { config, cost: levelCost + slopeCost, range, ranges, target, against, slopeCost }
  }

  const moveCounts = emptyCounts(ALL_MOVES)
  const toneCounts = emptyCounts(ALL_TONES)
  for (const t of transitions) {
    moveCounts[t.move]++
    toneCounts[MOVE_META[t.move].tone]++
  }
  const bpms = order.map((t) => t.bpm)

  return {
    order: [...order],
    transitions,
    transitionCost: transitionTotal,
    arc,
    totalCost: transitionTotal + (arc?.cost ?? 0),
    clashCount: moveCounts.clash,
    stats: {
      moveCounts,
      toneCounts,
      peaks: findPeaks(order),
      opener: order[0]?.id ?? null,
      closer: order[order.length - 1]?.id ?? null,
      bpmRange: bpms.length ? { min: Math.min(...bpms), max: Math.max(...bpms) } : null,
    },
  }
}

/** Converts loosely typed track data (e.g. fixtures) to `MixTrack`s; throws on bad keys. */
export function mixTracks(
  tracks: readonly {
    id: string
    label: string
    camelot: string
    bpm: number
    energy: number | null
  }[],
): MixTrack[] {
  return tracks.map((t) => {
    const camelot = parseCamelot(t.camelot)
    if (!camelot) throw new Error(`Invalid Camelot key ${t.camelot}`)
    return { ...t, camelot }
  })
}
