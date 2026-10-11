import type { MoveTone } from '@/shared/music'
import type { MixTrack } from './types'

/**
 * Energy between neighbours (research.md §4): a track's energy is how intense it is, and
 * a key move lifts or settles the transition itself. These are the two terms a profile
 * can add for that; both are 0 or neutral when a track's energy is unknown.
 */

/** How a climb in energy between neighbours is charged. */
export interface EnergyStep {
  /** Cost per unit of energy (0..1) climbed beyond `free`. */
  weight: number
  /** The step that costs nothing. */
  free: number
  /** A fall costs this share of the same climb: a reset may be sudden, a build is not. */
  fallFactor: number
}

/** A 0.3 climb costs 2, about one `+++`; the same fall a quarter of that. */
export const DEFAULT_ENERGY_STEP: EnergyStep = { weight: 10, free: 0.1, fallFactor: 0.25 }

/** The change in energy at which the key lift is in full effect. */
const LIFT_FULL_AT = 0.2

/** The climb in energy from one track to the next (a fall is negative); null if unknown. */
export const energyRise = (from: MixTrack, to: MixTrack): number | null =>
  from.energy === null || to.energy === null ? null : to.energy - from.energy

export function energyStepCost(rise: number | null, step: EnergyStep | null): number {
  if (rise === null || step === null) return 0
  const beyond = Math.max(0, Math.abs(rise) - step.free)
  return step.weight * beyond * (rise < 0 ? step.fallFactor : 1)
}

const DIRECTION: Record<MoveTone, number> = { perfect: 0, boost: 1, drop: -1, mood: 0, clash: 0 }

/**
 * What a move's cost is multiplied by, 0..2. With `keyLift` 1 a boost into a rise in
 * energy, or a drop into a fall, costs less (nothing from a 0.2 change), and the
 * opposite costs up to double. Below 0 it is the reverse: the key move cushions the
 * change. 0 leaves every move alone.
 */
export function keyLiftFactor(tone: MoveTone, rise: number | null, keyLift: number): number {
  if (rise === null) return 1
  const agreement = DIRECTION[tone] * Math.sign(rise) * Math.min(1, Math.abs(rise) / LIFT_FULL_AT)
  return 1 - keyLift * agreement
}
