import type { ArcConfig } from './arc'
import type { Move } from './chart'

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
}

export const PROFILES: readonly MixProfile[] = [DEFAULT_PROFILE]

export function profileById(id: string): MixProfile {
  return PROFILES.find((p) => p.id === id) ?? DEFAULT_PROFILE
}

export function withArc(profile: MixProfile, arc: ArcConfig | null): MixProfile {
  return { ...profile, arc }
}
