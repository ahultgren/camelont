import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import {
  DEFAULT_PROFILE,
  describeConstraintError,
  describeDiagnostic,
  mixDescription,
  trackNamer,
  useFitClient,
  useFitter,
  useMixer,
  useSolverClient,
  validateConstraints,
  type ConstraintError,
  type Diagnostic,
  type EvaluatedMix,
  type FitClient,
  type MixTrack,
  type SolveOutcome,
  type SolverClient,
  type WorkerSolveRequest,
} from '@/features/mixing'
import { useTrackFeatures, type TrackFeatures } from '@/features/track-features'
import {
  settledState,
  summariseChange,
  type ChangeSummary,
  type SettledState,
} from '../domain/change-summary'
import {
  withArc,
  withBpmRange,
  withChosenMix,
  withCloser,
  withFollow,
  withLimit,
  withMark,
  withOpener,
  withoutFollow,
  withPickMethod,
  withRole,
  withSave,
  type TrackRole,
} from '../domain/edits'
import { withFollower } from '../domain/follow'
import {
  describeBlocker,
  describeEmptySet,
  describeExcludedInRule,
  excludedInRules,
  type MixRule,
} from '../domain/mix-problems'
import { playlistRemoval, removePlaylist, type Dropped } from '../domain/playlist-diff'
import type { PickRequest, Selection } from '../domain/select'
import { selectForSet } from '../domain/select-set'
import { chosenIndex, ruleTrackIds, sameOrder, saveState, type MixRules } from '../domain/set'
import type { MixSet, PickMethod, SetArc, SetTrack, TrackMark } from '../domain/types'
import {
  fitKey,
  fitRequest,
  ruleConstraints,
  solveKey,
  solveRequest,
  trackFacts,
  type TrackFacts,
} from './mix-request'
import { useSetsDeps } from './deps'
import { useRecent } from './recent'
import { useSetsStore } from './sets-store'
import { usePlaylistChanges } from './usePlaylistChanges'
import { useReadPlaylists } from './useReadPlaylists'

/** Why there is no mix. Each one is in plain language and names the tracks it is about. */
export type WorkspaceProblem =
  /** No track is in the set. */
  | { kind: 'empty'; message: string }
  /** A track that must be in the set has no key or BPM (spec §8.3). */
  | { kind: 'needsData'; trackId: string; message: string }
  /** A mix rule names an excluded track (spec §5.4). */
  | { kind: 'excludedInRule'; trackId: string; rule: MixRule; message: string }
  /** The mix rules can't all hold: a cycle, a branch, a clashing pair (spec §5.4). */
  | { kind: 'rule'; error: ConstraintError; message: string }
  /** No clash-free order exists; `diagnostic` says what blocks it (spec U7). */
  | { kind: 'noMix'; diagnostic: Diagnostic | null; message: string }
  /** The mix couldn't be worked out at all; `retry` tries again. */
  | { kind: 'failed'; message: string }

/** What stands where the mix is shown (spec W3, W9). */
export type WorkspaceView =
  /** Nothing has been worked out yet: the set was just opened. */
  | { kind: 'opening' }
  | {
      kind: 'mix'
      /** Best cost first; every one orders the same tracks. */
      alternatives: readonly EvaluatedMix[]
      shownIndex: number
      shown: EvaluatedMix
      /** The shown mix is the one stored in the set as chosen. */
      chosen: boolean
    }
  | { kind: 'problems'; problems: readonly WorkspaceProblem[] }

export interface SetWorkspaceOptions {
  /** Default: the mixing feature's clients (workers in the app, in-process in tests). */
  solverClient?: SolverClient
  fitClient?: FitClient
  /** How long edits are gathered before the mix is worked out again. */
  debounceMs?: number
}

const DEBOUNCE_MS = 150
/** How many answers are kept, so that undoing a change needs no work. */
const KEPT_RESULTS = 8
/** Left-out tracks named in one diagnostic before "and N more". */
const NAMED_OPTIONS = 5

const NO_PLAYLISTS: MixSet['playlists'] = []
const NO_MARKS: MixSet['marks'] = {}
const NO_FOLLOWS: MixSet['mix']['follows'] = []

const orderOf = (mix: EvaluatedMix): string[] => mix.order.map((track) => track.id)
const sameItems = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index])

/** A best-fit answer: the picks, and the order to hand to the next playlist. */
interface FitAnswer {
  picked: string[]
  order: string[]
}

interface Resolution {
  selection: Selection
  /** The best-fit pick still to be worked out; the selection is a draft until then. */
  missing: { key: string; request: PickRequest; order: readonly string[] | null } | null
}

/** A fit or a solve. `start` resolves to a way to keep its result, or to why it failed. */
interface Work {
  key: string
  start: () => Promise<{ keep: () => void } | { failed: string }>
}

type SettledView = Exclude<WorkspaceView, { kind: 'opening' | 'mix' }> | MixResult
interface MixResult {
  kind: 'mix'
  alternatives: readonly EvaluatedMix[]
}

/**
 * Everything the workspace page of one set needs (spec §8, §9): the set and its edits,
 * key and BPM of its tracks, which tracks are in it, the mix or the problem in its
 * place, what the last update changed, and the playlist change check.
 *
 * It belongs to one set for as long as it lives: give the page component the set ID as
 * its `key`, so that another set gets another workspace.
 *
 * Nothing here is deeply reactive. The set is an immutable value from the store, and
 * every step is a computed over the part of the set it depends on, so an edit redoes
 * only what it touches: the arc never re-selects tracks, a mark never rebuilds the pool.
 */
export function useSetWorkspace(setId: string, options: SetWorkspaceOptions = {}) {
  const sets = useSetsStore()
  const deps = useSetsDeps()

  // ── The set ──────────────────────────────────────────────────────────────────────
  const set = computed(() => sets.get(setId) ?? null)
  const unreadable = computed(() => sets.unreadable.find((stored) => stored.id === setId) ?? null)
  /** `missing`: no such set on this device. `unreadable`: stored, but not valid. */
  const status = computed(() => {
    if (set.value) return 'ready' as const
    if (!sets.loaded) return 'loading' as const
    return unreadable.value ? ('unreadable' as const) : ('missing' as const)
  })
  /** Why there is no set to work on, in words; null while there is one or it is loading. */
  const statusMessage = computed(() => {
    if (status.value === 'unreadable') {
      const stored = unreadable.value
      return `${stored?.name ? `“${stored.name}”` : 'This set'} can’t be read. ${stored?.problem ?? ''}`.trim()
    }
    if (status.value !== 'missing') return null
    return sets.loadError === null
      ? 'This set isn’t on this device. It may have been deleted, or made in another browser.'
      : `Your sets couldn’t be read from this device (${sets.loadError}).`
  })

  // The parts of the set the steps below depend on. Each keeps its identity until an
  // edit touches it (see domain/edits.ts).
  const playlists = computed(() => set.value?.playlists ?? NO_PLAYLISTS)
  const marks = computed(() => set.value?.marks ?? NO_MARKS)
  const opener = computed(() => set.value?.mix.opener ?? null)
  const closer = computed(() => set.value?.mix.closer ?? null)
  const follows = computed(() => set.value?.mix.follows ?? NO_FOLLOWS)
  const arc = computed<SetArc>(() => set.value?.mix.arc ?? 'none')
  const rules = computed<MixRules>(() => ({
    opener: opener.value,
    closer: closer.value,
    follows: follows.value,
  }))
  const ruleIds = computed(() => ruleTrackIds(rules.value))
  const hasSet = computed(() => set.value !== null)

  // ── Track data ───────────────────────────────────────────────────────────────────
  // A change to a playlist's choices gives a new playlist object around the same track
  // list, so the pool is keyed on the lists themselves.
  const trackLists = computed<readonly (readonly SetTrack[])[]>((previous) => {
    const lists = playlists.value.map((playlist) => playlist.tracks)
    return previous && sameItems(previous, lists) ? previous : lists
  })
  /** Every track in the set's playlists, once, in pool order. */
  const tracks = computed<ReadonlyMap<string, SetTrack>>(() => {
    const pool = new Map<string, SetTrack>()
    for (const list of trackLists.value) {
      for (const track of list) if (!pool.has(track.trackId)) pool.set(track.trackId, track)
    }
    return pool
  })
  const trackIds = computed(() => [...tracks.value.keys()])
  const trackFeatures = useTrackFeatures(trackIds)
  /** Key and BPM are being looked up; what was known before stays in use until then. */
  const featuresLoading = trackFeatures.isLoading
  /**
   * Key, BPM and their sources per track ID (overrides applied: they belong to the
   * track, so one made in another set counts here too).
   */
  const features = computed<ReadonlyMap<string, TrackFeatures>>((previous) =>
    featuresLoading.value && previous ? previous : trackFeatures.features.value,
  )
  const facts = computed<TrackFacts | null>((previous) =>
    featuresLoading.value
      ? (previous ?? null)
      : trackFacts(tracks.value, trackFeatures.features.value),
  )

  // ── Which tracks are in the set ──────────────────────────────────────────────────
  // Best fit runs in a worker and `selectTracks` is synchronous, so the selection is
  // made from the best-fit answers at hand. A pick without an answer is worked out in
  // the worker and the selection is made again; answers are kept by what they depend
  // on, so only a change to that asks again.
  const answers = useRecent<FitAnswer>(KEPT_RESULTS)
  /** Work that failed. It is not tried again until the input changes or `retry` is called. */
  const failure = shallowRef<{ key: string; message: string } | null>(null)
  const resolution = computed<Resolution | null>((previous) => {
    const known = facts.value
    if (!hasSet.value || !known || featuresLoading.value) return previous ?? null
    let order: readonly string[] | null = null
    let missing: Resolution['missing'] = null
    const { selection } = selectForSet(
      {
        playlists: playlists.value,
        marks: marks.value,
        ruleTrackIds: ruleIds.value,
        trackData: known.data,
      },
      (request) => {
        const key = fitKey(request, rules.value, order)
        const answer = answers.get(key)
        // Playlists pick in turn; each hands its order on to the next (decision 31).
        if (answer) order = answer.order
        else missing = { key, request, order }
        return answer?.picked
      },
    )
    return { selection, missing }
  })
  /**
   * Each track's status and reason, the counts per playlist and the tracks in the set.
   * While best-fit picks are worked out the last one stays (`picking` is true); null
   * until the first is known. A track without a status is still being looked up.
   */
  const selection = computed<Selection | null>((previous) => {
    const current = resolution.value
    return current && !current.missing ? current.selection : (previous ?? null)
  })
  /** Best-fit picks are being worked out. */
  const picking = computed(() => {
    const missing = resolution.value?.missing
    return missing != null && failure.value?.key !== missing.key
  })

  // ── Problems that need no solver ─────────────────────────────────────────────────
  const mixTracks = computed(() => {
    const current = resolution.value
    const known = facts.value
    if (!current || !known) return null
    const inSet = new Set(current.selection.inSet)
    return {
      inSet: current.selection.inSet.flatMap((trackId) => known.mixTracks.get(trackId) ?? []),
      leftOut: [...known.mixTracks.values()].filter((track) => !inSet.has(track.id)),
    }
  })
  /** "Bloodstream (2A · E♭ minor)" where the key is known, else the title. */
  const nameOf = computed(() => {
    const known = facts.value?.mixTracks ?? new Map<string, MixTrack>()
    const withKey = trackNamer([...known.values()])
    return (trackId: string): string =>
      known.has(trackId)
        ? withKey(trackId)
        : (tracks.value.get(trackId)?.title ?? 'A track that is no longer in the set')
  })
  /**
   * Checked on whatever selection is at hand, also a draft: the tracks a rule names and
   * the must-include tracks never wait for a pick, so these show at once.
   */
  const inputProblems = computed<WorkspaceProblem[]>(() => {
    const current = resolution.value
    const mixable = mixTracks.value
    if (!current || !mixable) return []
    const name = nameOf.value
    const excluded = excludedInRules(marks.value, rules.value)
    const { blockers } = current.selection
    // The mixer would call these unknown tracks; here they have a better explanation.
    const explained = new Set([...excluded.map((problem) => problem.trackId), ...blockers])
    const errors = validateConstraints(mixable.inSet, ruleConstraints(rules.value)).filter(
      (error) => !(error.kind === 'unknown-track' && explained.has(error.id)),
    )
    const problems: WorkspaceProblem[] = [
      ...excluded.map((problem) => ({
        kind: 'excludedInRule' as const,
        ...problem,
        message: describeExcludedInRule(problem, name),
      })),
      ...blockers.map((trackId) => ({
        kind: 'needsData' as const,
        trackId,
        message: describeBlocker(trackId, marks.value, rules.value, name),
      })),
      ...errors.map((error) => ({
        kind: 'rule' as const,
        error,
        message: describeConstraintError(error, name),
      })),
    ]
    if (problems.length > 0 || current.missing || current.selection.inSet.length > 0)
      return problems
    const counts = { playlists: playlists.value.length, pool: current.selection.pool }
    return [{ kind: 'empty', message: describeEmptySet(counts) }]
  })

  // ── The mix ──────────────────────────────────────────────────────────────────────
  const outcomes = useRecent<SolveOutcome>(KEPT_RESULTS)
  const mixer = useMixer(options.solverClient ?? useSolverClient())
  const fitter = useFitter(options.fitClient ?? useFitClient())

  const solve = computed<{ key: string; request: WorkerSolveRequest } | null>(() => {
    const current = resolution.value
    const mixable = mixTracks.value
    if (!current || current.missing || !mixable || inputProblems.value.length > 0) return null
    const request = solveRequest(mixable.inSet, mixable.leftOut, rules.value, arc.value)
    return { key: solveKey(request, arc.value), request }
  })

  /** What has to be worked out before the current input has its result. */
  const need = computed<Work | null>(() => {
    const current = resolution.value
    const known = facts.value
    if (!hasSet.value || !current || !known || featuresLoading.value) return null
    const { missing } = current
    if (missing) {
      if (failure.value?.key === missing.key) return null
      return {
        key: missing.key,
        async start() {
          await fitter.run(fitRequest(missing.request, rules.value, known.mixTracks, missing.order))
          const result = fitter.result.value
          if (fitter.status.value !== 'done' || !result) return { failed: fitter.error.value ?? '' }
          const answer = {
            picked: result.picked.map((track) => track.id),
            order: result.order.map((track) => track.id),
          }
          return {
            keep() {
              answers.set(missing.key, answer)
            },
          }
        },
      }
    }
    const plan = solve.value
    if (!plan || outcomes.get(plan.key) || failure.value?.key === plan.key) return null
    return {
      key: plan.key,
      async start() {
        await mixer.run(plan.request)
        const outcome = mixer.outcome.value
        if (mixer.status.value !== 'done' || !outcome) return { failed: mixer.error.value ?? '' }
        return {
          keep() {
            outcomes.set(plan.key, outcome)
          },
        }
      },
    }
  })

  /** The result for the current input, once there is one. */
  const ready = computed<{ view: SettledView; mixKey: string | null } | null>(() => {
    const current = resolution.value
    if (!current || featuresLoading.value) return null
    const problems = (found: readonly WorkspaceProblem[]) => ({
      view: { kind: 'problems' as const, problems: found },
      mixKey: null,
    })
    const failed = (why: string) =>
      problems([
        { kind: 'failed', message: `The mix couldn’t be worked out${why && ` (${why})`}.` },
      ])
    if (inputProblems.value.length > 0) return problems(inputProblems.value)
    if (current.missing) {
      return failure.value?.key === current.missing.key ? failed(failure.value.message) : null
    }
    const plan = solve.value
    if (!plan) return null
    if (failure.value?.key === plan.key) return failed(failure.value.message)
    const outcome = outcomes.get(plan.key)
    if (!outcome) return null
    const name = nameOf.value
    switch (outcome.kind) {
      case 'solved':
        return outcome.candidates.length > 0
          ? { view: { kind: 'mix', alternatives: outcome.candidates }, mixKey: plan.key }
          : problems([{ kind: 'noMix', diagnostic: null, message: NO_MIX }])
      case 'infeasible':
        return problems(
          outcome.diagnostics.length > 0
            ? outcome.diagnostics.map((diagnostic) => ({
                kind: 'noMix' as const,
                diagnostic,
                message: describeDiagnostic(diagnostic, name, {
                  leftOut: 'Left-out tracks',
                  maxOptions: NAMED_OPTIONS,
                }),
              }))
            : [{ kind: 'noMix', diagnostic: null, message: NO_MIX }],
        )
      case 'invalid':
        return problems(
          outcome.errors.map((error) => ({
            kind: 'rule' as const,
            error,
            message: describeConstraintError(error, name),
          })),
        )
      case 'empty':
        return problems([
          {
            kind: 'empty',
            message: describeEmptySet({
              playlists: playlists.value.length,
              pool: current.selection.pool,
            }),
          },
        ])
    }
  })

  // One piece of work at a time: the fit a selection waits for, then the solve. Edits
  // are gathered for a moment first; the first result and the solve that follows a fit
  // start at once.
  let active: { key: string; timer: ReturnType<typeof setTimeout> | null } | null = null
  function stop() {
    if (active?.timer != null) clearTimeout(active.timer)
    active = null
    fitter.cancel()
    mixer.cancel()
  }
  function advance(chained = false) {
    const work = need.value
    if (active?.key === work?.key) return
    stop()
    if (!work) return
    const mine: NonNullable<typeof active> = { key: work.key, timer: null }
    active = mine
    const run = async () => {
      mine.timer = null
      const done = await work.start()
      // Superseded while it ran: whatever came back belongs to nobody.
      if (active !== mine) return
      active = null
      if ('failed' in done) failure.value = { key: work.key, message: done.failed }
      else done.keep()
      advance(true)
    }
    const wait = chained || settled.value === null ? 0 : (options.debounceMs ?? DEBOUNCE_MS)
    if (wait === 0) void run()
    else mine.timer = setTimeout(() => void run(), wait)
  }

  // ── What is shown: the last settled result, and what it changed ──────────────────
  const settled = shallowRef<{
    view: SettledView
    state: SettledState
    /** False while no selection was known yet: nothing to compare the next result with. */
    complete: boolean
    mixKey: string | null
  } | null>(null)
  const shownIndex = shallowRef(0)
  /** What the last update changed (spec W4). Null until a second result is there. */
  const summary = shallowRef<ChangeSummary | null>(null)
  let hadMix = false

  const stateOf = (shown: EvaluatedMix | null): SettledState =>
    settledState(selection.value, shown && { order: orderOf(shown), cost: shown.totalCost })

  watch(
    ready,
    (next) => {
      if (!next) return
      const previous = settled.value
      let shown: EvaluatedMix | null = null
      if (next.view.kind === 'mix') {
        const orders = next.view.alternatives.map(orderOf)
        if (next.mixKey !== previous?.mixKey) {
          // Other alternatives. The stored mix is shown when the set is opened and it
          // is still one of them; after a change to the set, the best one is (§8.5).
          const stored = hadMix ? null : chosenIndex(set.value?.chosenMix ?? null, orders)
          shownIndex.value = stored ?? 0
          hadMix = true
        }
        shown = next.view.alternatives[shownIndex.value] ?? null
        // A stored mix that is not what is shown is no longer the chosen one.
        const stored = set.value?.chosenMix
        if (stored && !sameOrder(stored.order, orders[shownIndex.value] ?? [])) {
          sets.update(setId, (current) => withChosenMix(current, null))
        }
      }
      const state = stateOf(shown)
      if (previous?.complete) {
        const change = summariseChange(previous.state, state)
        // An update that changes nothing shown leaves the last summary standing.
        if (change.changed) summary.value = change
      }
      settled.value = { ...next, state, complete: selection.value !== null }
    },
    { immediate: true },
  )
  watch(
    need,
    () => {
      advance()
    },
    { immediate: true },
  )
  onScopeDispose(stop)

  /**
   * The mix, or the problems in its place. It is never empty between two results: the
   * last one stays until the next is ready (`updating` says so).
   */
  const view = computed<WorkspaceView>(() => {
    const current = settled.value
    if (!current) return { kind: 'opening' }
    if (current.view.kind !== 'mix') return current.view
    const { alternatives } = current.view
    const shown = alternatives[shownIndex.value]
    if (!shown) return { kind: 'opening' }
    const stored = set.value?.chosenMix
    return {
      kind: 'mix',
      alternatives,
      shownIndex: shownIndex.value,
      shown,
      chosen: stored != null && sameOrder(stored.order, orderOf(shown)),
    }
  })
  /** A newer result than the one in `view` is being worked out. */
  const updating = computed(
    () =>
      settled.value !== null &&
      hasSet.value &&
      (featuresLoading.value || ready.value === null || need.value !== null),
  )

  // ── Playlists changed in Spotify ─────────────────────────────────────────────────
  const changes = usePlaylistChanges(setId)
  // "Opening a set checks each of its playlists" (§8.2): once, when the set is there.
  watch(
    hasSet,
    (there) => {
      if (there) void changes.check()
    },
    { immediate: true },
  )

  // ── Edits: each is written to the set at once (the store saves as you go) ────────
  const edit = (change: (current: MixSet) => MixSet) => {
    sets.update(setId, change)
  }

  // ── The set's playlists (U13) ────────────────────────────────────────────────────
  const reads = useReadPlaylists()
  /**
   * Reads the playlists as they are in Spotify now and adds them to the set, all or
   * none: false when one couldn't be read (`adding` says which; calling again reads
   * only what is still missing) or the set is gone. A playlist the set has is skipped.
   */
  async function addPlaylists(chosen: readonly { id: string; name: string }[]): Promise<boolean> {
    const copies = await reads.readAll(chosen)
    if (!copies || !sets.get(setId)) return false
    for (const copy of copies) sets.addPlaylist(setId, copy)
    return true
  }
  /** What removing a playlist takes with it (§8.2); null when the set doesn't have it. */
  function removalOf(playlistId: string): Dropped | null {
    const current = set.value
    if (!current?.playlists.some((playlist) => playlist.playlistId === playlistId)) return null
    return playlistRemoval(current, playlistId)
  }

  // ── Saving to Spotify (§8.5) ─────────────────────────────────────────────────────
  /** What a save would write now: a new playlist named after the set, in mix order. */
  const saveInput = computed(() => {
    const current = set.value
    const shown = view.value.kind === 'mix' ? view.value.shown : null
    if (!current || !shown) return null
    const arcChoice = current.mix.arc === 'none' ? null : current.mix.arc
    return {
      name: current.name,
      description: mixDescription(shown, DEFAULT_PROFILE, arcChoice, current.name),
      uris: shown.order.flatMap((track) => tracks.value.get(track.id)?.uri ?? []),
      order: orderOf(shown),
    }
  })

  return {
    status,
    statusMessage,
    set,

    tracks,
    features,
    featuresLoading,
    /** ReccoBeats failed for some tracks; they have no data until `retryFeatures`. */
    providerError: trackFeatures.providerError,
    retryFeatures: () => {
      void trackFeatures.retry()
    },

    selection,
    picking,

    view,
    updating,
    summary: computed(() => summary.value),
    /** Tries again after a `failed` problem. */
    retry: () => {
      failure.value = null
    },

    /** Per playlist ID: what the check against Spotify found (§8.2). */
    notices: computed(() => changes.notices.value),
    /** Checks the set's playlists against Spotify again. */
    checkPlaylists: () => changes.check(),
    /** Applies a `changed` notice; returns the marks and rules that went with removed tracks. */
    updatePlaylist: (playlistId: string) => changes.update(playlistId),

    /** Reading the playlists being added: idle, which one is read, or which one failed. */
    adding: reads.state,
    addPlaylists,
    /** Abandons an add in flight and forgets a failed one. */
    cancelAdd: () => {
      reads.reset()
    },
    removalOf,
    /** Removes a playlist with what `removalOf` announced; returns that. */
    removePlaylist: (playlistId: string): Dropped | null => {
      const dropped = removalOf(playlistId)
      if (dropped) edit((current) => removePlaylist(current, playlistId))
      return dropped
    },

    /** A blank name is ignored. */
    rename: (name: string) => {
      sets.rename(setId, name)
    },

    saveInput,
    /** Never saved, saved as it is now, or changed since the last save. */
    saveState: computed(() => (set.value ? saveState(set.value) : 'never')),
    /**
     * Records that the shown mix was just saved to Spotify as a new playlist at `url`.
     * False when there is no mix to have saved.
     */
    recordSave: (url: string): boolean => {
      const saved = saveInput.value
      if (!saved) return false
      const save = { url, savedAt: deps.now(), name: saved.name, order: saved.order }
      edit((current) => withSave(current, save))
      return true
    },

    /** The track being pointed at in any view, for highlighting it in the others (W6). */
    pointedTrackId: shallowRef<string | null>(null),

    setBpmRange: (playlistId: string, range: { min: number | null; max: number | null }) => {
      edit((current) => withBpmRange(current, playlistId, range))
    },
    setLimit: (playlistId: string, limit: number | null) => {
      edit((current) => withLimit(current, playlistId, limit))
    },
    setPickMethod: (playlistId: string, method: PickMethod) => {
      edit((current) => withPickMethod(current, playlistId, method))
    },
    /** Draws a playlist's random picks again. */
    reshuffle: (playlistId: string) => {
      sets.reshuffle(setId, playlistId)
    },
    /** Must-include or exclude; null removes the mark. Mix rules are left as they are. */
    setMark: (trackId: string, mark: TrackMark | null) => {
      edit((current) => withMark(current, trackId, mark))
    },
    /** The row's toggle group (§9.1): one of opener, closer, must-include, exclude, or none. */
    setRole: (trackId: string, role: TrackRole | null) => {
      edit((current) => withRole(current, trackId, role))
    },
    setOpener: (trackId: string | null) => {
      edit((current) => withOpener(current, trackId))
    },
    setCloser: (trackId: string | null) => {
      edit((current) => withCloser(current, trackId))
    },
    addFollow: (from: string, to: string) => {
      edit((current) => withFollow(current, from, to))
    },
    /** "`from` is followed by `to`", in place of whatever followed `from` before (§9.1). */
    setFollower: (from: string, to: string) => {
      edit((current) => withFollower(current, from, to))
    },
    removeFollow: (from: string, to: string) => {
      edit((current) => withoutFollow(current, from, to))
    },
    setArc: (choice: SetArc) => {
      edit((current) => withArc(current, choice))
    },
    /** Shows another alternative and stores it in the set as the chosen mix (§8.5). */
    chooseAlternative: (index: number) => {
      const current = settled.value
      const mix = current?.view.kind === 'mix' ? current.view.alternatives[index] : undefined
      if (!current || !mix) return
      shownIndex.value = index
      settled.value = { ...current, state: stateOf(mix) }
      edit((stored) => withChosenMix(stored, orderOf(mix)))
    },
  }
}

const NO_MIX = 'No clash-free order was found for these tracks and rules.'

export type SetWorkspace = ReturnType<typeof useSetWorkspace>
