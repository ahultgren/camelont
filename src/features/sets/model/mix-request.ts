import {
  DEFAULT_PROFILE,
  profileFor,
  toMixInput,
  type FitRequest,
  type MixConstraints,
  type MixTrack,
  type WorkerSolveRequest,
} from '@/features/mixing'
import type { TrackFeatures } from '@/features/track-features'
import type { PickRequest, PickTrack, TrackData } from '../domain/select'
import type { MixRules, MixShape } from '../domain/set'
import type { SetTrack } from '../domain/types'

/**
 * The set's tracks and rules in the mixing feature's terms. Pure mapping: a set names
 * tracks by track ID (it holds a track once), and that ID is the mixer's entry ID.
 */

/** What the pool's tracks are known to be, for the selection and for the mixer. */
export interface TrackFacts {
  /** Key and BPM of every pool track; null where unknown. */
  data: ReadonlyMap<string, TrackData>
  /** The pool tracks that can be mixed (key and BPM known), in pool order. */
  mixTracks: ReadonlyMap<string, MixTrack>
}

export function trackFacts(
  pool: ReadonlyMap<string, SetTrack>,
  features: ReadonlyMap<string, TrackFeatures>,
): TrackFacts {
  const entries = [...pool.values()].map((track) => ({
    entryId: track.trackId,
    trackId: track.trackId,
    title: track.title,
  }))
  const data = new Map<string, TrackData>()
  for (const { trackId } of entries) {
    const known = features.get(trackId)
    data.set(trackId, { camelot: known?.camelot?.value ?? null, bpm: known?.bpm?.value ?? null })
  }
  const { tracks } = toMixInput(entries, features)
  return { data, mixTracks: new Map(tracks.map((track) => [track.id, track])) }
}

/** The set's mix rules as solver constraints, with the tracks that are left out. */
const constraintsOf = (rules: MixRules, excluded: readonly string[] = []): MixConstraints => ({
  start: rules.opener,
  end: rules.closer,
  follows: rules.follows,
  excluded,
})

/** The rules alone, as the mixer checks them (cycles, branches, clashing pairs). */
export const ruleConstraints = (rules: MixRules): MixConstraints => constraintsOf(rules)

const describe = (track: MixTrack) => [
  track.id,
  track.camelot,
  track.bpm,
  track.energy,
  track.label,
]
const describePick = (track: PickTrack) => [track.trackId, track.camelot, track.bpm]

/**
 * Everything a best-fit answer depends on. `order` is part of it: the order handed on
 * from the playlist before decides whether the solver runs again, so an answer is only
 * reused where the same work would be done.
 */
export function fitKey(
  request: PickRequest,
  rules: MixRules,
  order: readonly string[] | null,
): string {
  return JSON.stringify([
    'fit',
    request.count,
    request.candidates.map(describePick),
    request.inSet.map(describePick),
    rules.opener,
    rules.closer,
    rules.follows,
    order,
  ])
}

/**
 * A pick request as best fit takes it (decision 31): the tracks already in the set are
 * fixed, and `order` is the previous playlist's result, so playlists picking in turn
 * share one solver run.
 */
export function fitRequest(
  request: PickRequest,
  rules: MixRules,
  mixTracks: ReadonlyMap<string, MixTrack>,
  order: readonly string[] | null,
): FitRequest {
  const toMixTrack = (track: PickTrack): MixTrack =>
    mixTracks.get(track.trackId) ?? {
      id: track.trackId,
      label: track.trackId,
      camelot: track.camelot,
      bpm: track.bpm,
      energy: null,
    }
  const previous = order?.flatMap((trackId) => mixTracks.get(trackId) ?? [])
  return {
    fixed: request.inSet.map(toMixTrack),
    candidates: request.candidates.map(toMixTrack),
    count: request.count,
    profile: DEFAULT_PROFILE,
    constraints: constraintsOf(rules),
    ...(previous ? { order: previous } : {}),
  }
}

/**
 * What the solver is asked. The tracks left out go in as excluded, so that when no mix
 * is possible the diagnostics can name the ones that would unblock it (spec U7).
 */
export function solveRequest(
  inSet: readonly MixTrack[],
  leftOut: readonly MixTrack[],
  rules: MixRules,
  shape: MixShape,
): WorkerSolveRequest {
  return {
    tracks: [...inSet, ...leftOut],
    constraints: constraintsOf(
      rules,
      leftOut.map((track) => track.id),
    ),
    profile: profileFor(shape),
  }
}

/** Two requests with the same key get the same answer: the solver is deterministic. */
export function solveKey(request: WorkerSolveRequest, shape: MixShape): string {
  const { start, end, follows, excluded } = request.constraints
  const { arc, arcSignal, energySteps, keyLift } = shape
  return JSON.stringify([
    'solve',
    request.tracks.map(describe),
    start,
    end,
    follows,
    excluded,
    [arc, arcSignal, energySteps, keyLift],
  ])
}
