import {
  ARC_PRESETS,
  DEFAULT_ARC_WEIGHT,
  type ArcChoice,
  type ArcConfig,
  type ArcSignalId,
} from './arc'
import type { Move } from './chart'
import { DEFAULT_ENERGY_STEP, type EnergyStep } from './energy'

/**
 * A profile turns a mix into a cost (lower is better). It is kept separate from the
 * chart, so scoring can change without touching the rules (decision #5).
 */
export interface MixProfile {
  id: string
  name: string
  moveCost: Record<Move, number>
  /** Only used when evaluating given orders; generated mixes never contain clashes. */
  clashCost: number
  /** Multiplies the relative tempo gap (20: a 10% gap ≈ one +++). */
  tempoWeight: number
  arc: ArcConfig | null
  /** What a climb in energy between neighbours costs; null leaves energy steps alone. */
  energyStep: EnergyStep | null
  /** −1..1: how far a key move that goes with the energy is cheaper (energy.ts). 0 is off. */
  keyLift: number
}

/** The reference weights from docs/reference/camelot.py. */
export const DEFAULT_PROFILE: MixProfile = {
  id: 'default',
  name: 'Balanced',
  moveCost: {
    perfect: 0,
    boost1: 1,
    drop1: 1,
    boost3: 2,
    drop3: 2,
    boost2: 3,
    drop2: 3,
    boost3Alt: 4,
    drop3Alt: 4,
    mood: 4,
  },
  clashCost: 10,
  tempoWeight: 20,
  arc: null,
  energyStep: null,
  keyLift: 0,
}

export const PROFILES: readonly MixProfile[] = [DEFAULT_PROFILE]

export function profileById(id: string): MixProfile {
  return PROFILES.find((p) => p.id === id) ?? DEFAULT_PROFILE
}

export function withArc(profile: MixProfile, arc: ArcConfig | null): MixProfile {
  return { ...profile, arc }
}

/**
 * How a mix is shaped beyond keys and tempo, as the user sets it: an arc and what it
 * follows, and two switches that use the tracks' energy (decision 45). Each is one term
 * of the cost, so they combine.
 */
export interface MixShaping {
  arc: ArcChoice
  /**
   * What the arc follows, from 0 (BPM only) through 0.5 (BPM and energy in full) to 1
   * (energy only). Means nothing without an arc.
   */
  arcBalance: number
  /** Climb in small steps of energy; a fall may be sudden. */
  energySteps: boolean
  /** Key boosts go with rises in energy, key drops with falls. */
  keyLift: boolean
  /** Where the arc rises only perfect and + moves, where it falls only perfect and −. */
  keysFollowArc: boolean
}

export const NO_SHAPING: MixShaping = {
  arc: 'none',
  arcBalance: 0,
  energySteps: false,
  keyLift: false,
  keysFollowArc: false,
}

/**
 * A move against the arc costs more than any move in the chart (4 at most) and about as
 * much as a 50% tempo gap: it happens only when the set has no other way.
 */
export const SLOPE_WEIGHT = 10

/** The default profile, shaped as the user chose. */
export function profileFor(shaping: MixShaping): MixProfile {
  return {
    ...DEFAULT_PROFILE,
    arc:
      shaping.arc === 'none'
        ? null
        : {
            preset: shaping.arc,
            signal: signalOf(shaping.arcBalance),
            ...(shaping.arcBalance > 0 && shaping.arcBalance < 1
              ? { balance: shaping.arcBalance }
              : {}),
            weight: DEFAULT_ARC_WEIGHT,
            ...(shaping.keysFollowArc ? { slopeWeight: SLOPE_WEIGHT } : {}),
          },
    energyStep: shaping.energySteps ? DEFAULT_ENERGY_STEP : null,
    keyLift: shaping.keyLift ? 1 : 0,
  }
}

/** The signal an arc balance means: one measure at either end, both in between. */
export const signalOf = (balance: number): ArcSignalId =>
  balance <= 0 ? 'bpm' : balance >= 1 ? 'energy' : 'both'

/** The balance in words, e.g. "BPM and energy, energy at half". */
export function describeBalance(balance: number): string {
  if (balance <= 0) return 'BPM'
  if (balance >= 1) return 'energy'
  if (balance === 0.5) return 'BPM and energy'
  const share = Math.round(100 * Math.min(1, 2 * Math.min(balance, 1 - balance)))
  return `BPM and energy, ${balance < 0.5 ? 'energy' : 'BPM'} at ${String(share)}%`
}

/** The shaping in a few words, e.g. "Two waves by energy, energy steps"; "none" for none. */
export function describeShaping(shaping: MixShaping): string {
  const parts = [
    ...(shaping.arc === 'none'
      ? []
      : [
          `${ARC_PRESETS[shaping.arc].name}${shaping.arcBalance > 0 ? ` by ${describeBalance(shaping.arcBalance)}` : ''}`,
        ]),
    ...(shaping.arc !== 'none' && shaping.keysFollowArc ? ['keys follow the arc'] : []),
    ...(shaping.energySteps ? ['energy steps'] : []),
    ...(shaping.keyLift ? ['key lift'] : []),
  ]
  return parts.length ? parts.join(', ') : 'none'
}
