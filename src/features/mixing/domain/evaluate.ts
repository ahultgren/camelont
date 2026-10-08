import { parseCamelot, type MoveTone } from '@/shared/music'
import {
  ARC_PRESETS,
  arcPosition,
  arcTarget,
  arcTermCost,
  signalRange,
  type ArcConfig,
  type SignalRange,
} from './arc'
import { MOVE_META, moveBetween, type MoveOrClash } from './chart'
import type { MixProfile } from './profile'
import { tempoGap } from './tempo'
import type { MixTrack } from './types'

export interface Transition {
  from: string
  to: string
  move: MoveOrClash
  moveCost: number
  tempoGap: number
  tempoCost: number
  /** moveCost + tempoCost */
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
  cost: number
  range: SignalRange
  /** Target level (0..1) at each position. */
  target: number[]
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
  const moveCost = move === 'clash' ? profile.clashCost : profile.moveCost[move]
  const gap = tempoGap(from.bpm, to.bpm)
  const tempoCost = profile.tempoWeight * gap
  return {
    from: from.id,
    to: to.id,
    move,
    moveCost,
    tempoGap: gap,
    tempoCost,
    cost: moveCost + tempoCost,
  }
}

/** The arc's signal range over the whole set being mixed (the solver uses it too). */
export function arcRange(tracks: readonly MixTrack[], profile: MixProfile): SignalRange | null {
  return profile.arc ? signalRange(tracks, profile.arc.signal) : null
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
  const range = arcRange(order, profile)
  if (profile.arc && range) {
    const config = profile.arc
    const cost = order.reduce(
      (sum, track, i) => sum + arcTermCost(track, i, order.length, config, range),
      0,
    )
    const target = order.map((_, i) =>
      arcTarget(ARC_PRESETS[config.preset], arcPosition(i, order.length)),
    )
    arc = { config, cost, range, target }
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
