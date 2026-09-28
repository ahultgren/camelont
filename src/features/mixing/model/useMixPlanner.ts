import { computed, reactive, ref, toRaw, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { TrackFeatures } from '@/features/track-features'
import { DEFAULT_ARC_WEIGHT, type ArcPresetId } from '../domain/arc'
import { validateConstraints, type MixConstraints } from '../domain/constraints'
import { DEFAULT_PROFILE, withArc } from '../domain/profile'
import { DEFAULT_K, DEFAULT_SEED } from '../domain/solver/solve'
import { toMixInput, type PlannerEntry } from './mix-input'
import { useSolverClient, type SolverClient } from './solver-client'
import type { WorkerSolveRequest } from './solver.worker'
import { useMixer } from './useMixer'

export type ArcChoice = ArcPresetId | 'none'

export interface EditableConstraints {
  start: string | null
  end: string | null
  follows: [string, string][]
  excluded: string[]
}

const DEBOUNCE_MS = 250

/**
 * The mix page's state: constraints, arc choice, and results. Whenever the input is
 * complete (every track has data or is excluded) and the constraints are valid, the
 * solver re-runs in the worker; a newer run cancels the older one.
 */
export function useMixPlanner(
  entries: MaybeRefOrGetter<readonly PlannerEntry[]>,
  features: MaybeRefOrGetter<ReadonlyMap<string, TrackFeatures>>,
  options: { client?: SolverClient; debounceMs?: number } = {},
) {
  const constraints = reactive<EditableConstraints>({
    start: null,
    end: null,
    follows: [],
    excluded: [],
  })
  const arc = ref<ArcChoice>('none')
  const mixer = useMixer(options.client ?? useSolverClient())

  const input = computed(() => toMixInput(toValue(entries), toValue(features)))
  const excluded = computed(() => new Set(constraints.excluded))
  /** Tracks without data that the user hasn't excluded: they block mixing. */
  const blockers = computed(() => input.value.missing.filter((e) => !excluded.value.has(e.entryId)))

  const snapshot = (): MixConstraints => ({
    start: constraints.start,
    end: constraints.end,
    follows: constraints.follows.map(([a, b]) => [a, b] as const),
    excluded: [...constraints.excluded],
  })
  const constraintErrors = computed(() => validateConstraints(input.value.tracks, snapshot()))
  const includedCount = computed(
    () => input.value.tracks.filter((t) => !excluded.value.has(t.id)).length,
  )

  const request = computed((): WorkerSolveRequest | null => {
    if (blockers.value.length > 0 || constraintErrors.value.length > 0) return null
    if (includedCount.value === 0) return null
    const profile = withArc(
      DEFAULT_PROFILE,
      arc.value === 'none'
        ? null
        : { preset: arc.value, signal: 'bpm', weight: DEFAULT_ARC_WEIGHT },
    )
    return {
      tracks: toRaw(input.value.tracks).map((t) => ({ ...t })),
      constraints: snapshot(),
      profile,
      k: DEFAULT_K,
      seed: DEFAULT_SEED,
    }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    request,
    (next) => {
      clearTimeout(timer)
      if (!next) {
        mixer.cancel()
        return
      }
      timer = setTimeout(() => void mixer.run(next), options.debounceMs ?? DEBOUNCE_MS)
    },
    { immediate: true },
  )

  /** Results only count for the current request; otherwise they're stale. */
  const stale = computed(() => request.value === null)

  return {
    constraints,
    arc,
    input,
    blockers,
    constraintErrors,
    includedCount,
    stale,
    status: mixer.status,
    outcome: mixer.outcome,
    error: mixer.error,
    setStart(entryId: string | null) {
      constraints.start = entryId
    },
    setEnd(entryId: string | null) {
      constraints.end = entryId
    },
    toggleExcluded(entryId: string) {
      const i = constraints.excluded.indexOf(entryId)
      if (i >= 0) constraints.excluded.splice(i, 1)
      else constraints.excluded.push(entryId)
    },
    addFollow(from: string, to: string) {
      constraints.follows.push([from, to])
    },
    removeFollow(index: number) {
      constraints.follows.splice(index, 1)
    },
  }
}

export type MixPlanner = ReturnType<typeof useMixPlanner>
