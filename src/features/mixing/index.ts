// Public API of the mixing feature. Other layers import only from here.
export { ARC_PRESETS, DEFAULT_ARC_WEIGHT, type ArcConfig, type ArcPresetId } from './domain/arc'
export { MOVE_META, moveBetween, type Move, type MoveMeta, type MoveOrClash } from './domain/chart'
export {
  describeConstraintError,
  NO_CONSTRAINTS,
  validateConstraints,
  type ConstraintError,
  type MixConstraints,
} from './domain/constraints'
export { describeDiagnostic, trackNamer, type Diagnostic } from './domain/diagnostics'
export {
  evaluateMix,
  type EvaluatedMix,
  type MixStats,
  type Peak,
  type Transition,
} from './domain/evaluate'
export { DEFAULT_PROFILE, PROFILES, profileById, withArc, type MixProfile } from './domain/profile'
export { DEFAULT_K, type SolveOutcome } from './domain/solver/solve'
export { tempoGap } from './domain/tempo'
export type { MixTrack } from './domain/types'
export { useMixer, type MixerStatus } from './model/useMixer'
