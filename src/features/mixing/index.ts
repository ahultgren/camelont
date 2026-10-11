// Public API of the mixing feature. Other layers import only from here.
export {
  ARC_PRESETS,
  DEFAULT_ARC_WEIGHT,
  type ArcChoice,
  type ArcConfig,
  type ArcPresetId,
} from './domain/arc'
export { MOVE_META, moveBetween, type Move, type MoveMeta, type MoveOrClash } from './domain/chart'
export {
  describeConstraintError,
  NO_CONSTRAINTS,
  validateConstraints,
  type ConstraintError,
  type MixConstraints,
} from './domain/constraints'
export {
  describeDiagnostic,
  trackNamer,
  type Diagnostic,
  type DiagnosticWording,
} from './domain/diagnostics'
export {
  evaluateMix,
  type EvaluatedMix,
  type MixStats,
  type Peak,
  type Transition,
} from './domain/evaluate'
export { pickBestFit, type FitRequest, type FitResult, type FitScore } from './domain/fit'
export {
  DEFAULT_PROFILE,
  profileById,
  profileForArc,
  PROFILES,
  withArc,
  type MixProfile,
} from './domain/profile'
export { DEFAULT_K, type SolveOutcome } from './domain/solver/solve'
export { tempoGap } from './domain/tempo'
export type { MixTrack } from './domain/types'
export { useFitter } from './model/useFitter'
export { useMixer, type MixerStatus } from './model/useMixer'
export { toMixInput, type MixInput, type PlannerEntry } from './model/mix-input'
export { useMixPlanner, type MixPlanner } from './model/useMixPlanner'
export { default as ArcPicker } from './ui/ArcPicker.vue'
export { default as CandidateList } from './ui/CandidateList.vue'
export { default as ConstraintsPanel } from './ui/ConstraintsPanel.vue'
export { default as MixProblems } from './ui/MixProblems.vue'
export { mixDescription, mixPlaylistName } from './domain/describe'
export {
  inlineFitClient,
  inlineSolverClient,
  installMixing,
  useFitClient,
  useSolverClient,
  type FitClient,
  type SolverClient,
  type WorkerRun,
} from './model/solver-client'
export type { WorkerSolveRequest } from './model/solver.worker'
