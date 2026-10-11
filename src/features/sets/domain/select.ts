import type { CamelotKey } from '@/shared/music'
import type { PickMethod, TrackChoices, TrackMark } from './types'

/**
 * Which tracks are in a set (spec §8.2–8.4). These rules live here and nowhere else.
 *
 * Marks belong to the track: an excluded track is left out in every playlist that has
 * it, and a must-include track (marked, or named in a mix rule) is let in by every one.
 * Otherwise a playlist lets a track in when the track has a key and a BPM and the BPM
 * is inside that playlist's range.
 *
 * A track is in a set at most once, so one playlist decides it: the first that lets it
 * in and has no limit, or failing that the first that lets it in, where it counts
 * toward the limit or competes for a place. The other playlists that would take it
 * show it as a duplicate; a playlist that would not take it shows its own reason.
 */

/** A playlist as the selection sees it; `SetPlaylist` fits. */
export interface SelectPlaylist {
  playlistId: string
  tracks: readonly { trackId: string }[]
  choices: TrackChoices
}

/** A track's saved key and BPM; null when unknown. */
export interface TrackData {
  camelot: CamelotKey | null
  bpm: number | null
}

/** A track that can be mixed: it has a key and a BPM. */
export interface PickTrack {
  trackId: string
  camelot: CamelotKey
  bpm: number
}

export interface PickRequest {
  playlistId: string
  method: PickMethod
  seed: number
  /** How many tracks to pick; always fewer than the candidates. */
  count: number
  /** The tracks this playlist decides that compete for its places, in playlist order. */
  candidates: readonly PickTrack[]
  /**
   * The tracks already in the set, in pool order: the ones no pick decides, plus the
   * picks of playlists added earlier. Must-include tracks without key or BPM are not
   * listed (they block the mix anyway).
   */
  inSet: readonly PickTrack[]
}

/** Picks `count` of the candidates by their track IDs (§8.4). */
export type PickFn = (request: PickRequest) => readonly string[]

export interface SelectInput {
  /** In the order they were added. */
  playlists: readonly SelectPlaylist[]
  marks: Readonly<Record<string, TrackMark>>
  /** Tracks named in a mix rule; they count as must-include (§5.4). */
  ruleTrackIds: Iterable<string>
  /** Key and BPM per track ID. A missing entry means both are unknown. */
  trackData: ReadonlyMap<string, TrackData>
  pick: PickFn
}

export type TrackStatus =
  | { inSet: true; reason: 'in' | 'mustInclude' | 'picked' }
  | { inSet: false; reason: 'excluded' | 'outsideRange' | 'notPicked' | 'needsData' }
  /** This playlist would take the track, but another one decides it. */
  | { inSet: false; reason: 'duplicate'; ownerPlaylistId: string }

export type StatusReason = TrackStatus['reason']

export interface PlaylistCounts {
  /** Different tracks in the playlist. */
  tracks: number
  inSet: number
  byReason: Record<StatusReason, number>
}

export interface PlaylistSelection {
  playlistId: string
  /** One row per track in playlist order; a repeated track is listed once. */
  tracks: { trackId: string; status: TrackStatus }[]
  counts: PlaylistCounts
  /** The must-include tracks alone reach or exceed the limit, so nothing is picked. */
  limitFilled: boolean
}

export interface Selection {
  playlists: PlaylistSelection[]
  /**
   * Every pool track's status in the playlist that decides it. For a track no playlist
   * lets in: the reason of the first playlist that has it.
   */
  statusByTrack: ReadonlyMap<string, TrackStatus>
  /**
   * The tracks in the set, in pool order: playlists as added, tracks as listed, each
   * track at its place in the playlist that decides it.
   */
  inSet: string[]
  /** Must-include tracks without key or BPM: they block the mix until fixed (§8.3). */
  blockers: string[]
  /** Different tracks across all playlists. */
  pool: number
}

const IN: TrackStatus = { inSet: true, reason: 'in' }
const MUST_INCLUDE: TrackStatus = { inSet: true, reason: 'mustInclude' }
const PICKED: TrackStatus = { inSet: true, reason: 'picked' }
const EXCLUDED: TrackStatus = { inSet: false, reason: 'excluded' }
const OUTSIDE_RANGE: TrackStatus = { inSet: false, reason: 'outsideRange' }
const NOT_PICKED: TrackStatus = { inSet: false, reason: 'notPicked' }
const NEEDS_DATA: TrackStatus = { inSet: false, reason: 'needsData' }

const inRange = (bpm: number, { bpmMin, bpmMax }: TrackChoices): boolean =>
  (bpmMin === null || bpm >= bpmMin) && (bpmMax === null || bpm <= bpmMax)

export function selectTracks(input: SelectInput): Selection {
  const { playlists } = input
  const required = new Set(input.ruleTrackIds)
  const mixable = (trackId: string): PickTrack | null => {
    const { camelot = null, bpm = null } = input.trackData.get(trackId) ?? {}
    return camelot !== null && bpm !== null ? { trackId, camelot, bpm } : null
  }
  const mustInclude = (trackId: string): boolean =>
    input.marks[trackId] === 'mustInclude' || required.has(trackId)

  /** Why a playlist doesn't let a track in; null when it does. */
  const refusal = (trackId: string, choices: TrackChoices): TrackStatus | null => {
    if (mustInclude(trackId)) return null
    const track = mixable(trackId)
    if (!track) return NEEDS_DATA
    return inRange(track.bpm, choices) ? null : OUTSIDE_RANGE
  }

  // Each playlist's tracks once, and for each track the playlists that have it.
  const listed = playlists.map((playlist) => [
    ...new Set(playlist.tracks.map((track) => track.trackId)),
  ])
  const holders = new Map<string, number[]>()
  listed.forEach((trackIds, index) => {
    for (const trackId of trackIds) holders.set(trackId, [...(holders.get(trackId) ?? []), index])
  })

  // Which playlist decides each track: the first without a limit that lets it in, else
  // the first that lets it in. A track nobody decides sits with the first that has it.
  const decider = new Map<string, number>()
  const home = new Map<string, number>()
  for (const [trackId, indexes] of holders) {
    const willing =
      input.marks[trackId] === 'exclude'
        ? []
        : indexes.filter((i) => {
            const choices = playlists[i]?.choices
            return choices !== undefined && refusal(trackId, choices) === null
          })
    const decides = willing.find((i) => playlists[i]?.choices.limit === null) ?? willing[0]
    if (decides !== undefined) decider.set(trackId, decides)
    home.set(trackId, decides ?? indexes[0] ?? 0)
  }

  // First pass: every status that needs no pick, in pool order.
  const statusByTrack = new Map<string, TrackStatus>()
  const poolOrder: string[] = []
  const drafts = playlists.map((playlist, index) => {
    const { choices } = playlist
    const candidates: string[] = []
    let mustIncluded = 0
    for (const trackId of listed[index] ?? []) {
      if (home.get(trackId) !== index) continue
      poolOrder.push(trackId)
      if (decider.get(trackId) !== index) {
        const excluded = input.marks[trackId] === 'exclude'
        statusByTrack.set(trackId, excluded ? EXCLUDED : (refusal(trackId, choices) ?? NEEDS_DATA))
      } else if (mustInclude(trackId)) {
        statusByTrack.set(trackId, MUST_INCLUDE)
        mustIncluded++
      } else if (choices.limit === null) statusByTrack.set(trackId, IN)
      else candidates.push(trackId)
    }
    // Must-include tracks count toward the limit (§8.4). With room for every candidate
    // they are all in, and with room for none they are all out: no pick either way.
    const places = (choices.limit ?? Infinity) - mustIncluded
    const needsPick = places > 0 && candidates.length > places
    if (!needsPick) {
      for (const trackId of candidates) statusByTrack.set(trackId, places > 0 ? IN : NOT_PICKED)
    }
    return { playlist, mustIncluded, places, toPick: needsPick ? candidates : [] }
  })

  // Second pass: the other limited playlists pick, in the order they were added. A
  // track that isn't picked is not passed on to a later playlist.
  for (const { playlist, places, toPick } of drafts) {
    if (toPick.length === 0) continue
    const picked = sanitise(
      input.pick({
        playlistId: playlist.playlistId,
        method: playlist.choices.pick,
        seed: playlist.choices.seed,
        count: places,
        candidates: toPick.flatMap((trackId) => mixable(trackId) ?? []),
        inSet: poolOrder.flatMap((trackId) =>
          statusByTrack.get(trackId)?.inSet ? (mixable(trackId) ?? []) : [],
        ),
      }),
      toPick,
      places,
    )
    for (const trackId of toPick) {
      statusByTrack.set(trackId, picked.has(trackId) ? PICKED : NOT_PICKED)
    }
  }

  const statusOf = (trackId: string): TrackStatus => statusByTrack.get(trackId) ?? NEEDS_DATA
  /** What a playlist's row shows for a track it has. */
  const rowStatus = (trackId: string, index: number, choices: TrackChoices): TrackStatus => {
    const decides = decider.get(trackId)
    if (decides === index || input.marks[trackId] === 'exclude') return statusOf(trackId)
    const owner = decides === undefined ? undefined : playlists[decides]
    return (
      refusal(trackId, choices) ??
      (owner
        ? { inSet: false, reason: 'duplicate', ownerPlaylistId: owner.playlistId }
        : statusOf(trackId))
    )
  }

  const inSet = poolOrder.filter((trackId) => statusOf(trackId).inSet)
  return {
    playlists: drafts.map(({ playlist, mustIncluded }, index) => {
      const tracks = (listed[index] ?? []).map((trackId) => ({
        trackId,
        status: rowStatus(trackId, index, playlist.choices),
      }))
      const { limit } = playlist.choices
      return {
        playlistId: playlist.playlistId,
        tracks,
        counts: countByReason(tracks.map((row) => row.status)),
        limitFilled: limit !== null && mustIncluded > 0 && mustIncluded >= limit,
      }
    }),
    statusByTrack,
    inSet,
    blockers: inSet.filter((trackId) => mixable(trackId) === null),
    pool: poolOrder.length,
  }
}

/** A pick method's answer, held to its contract: candidates only, each once, no more than asked. */
function sanitise(
  answer: readonly string[],
  candidates: readonly string[],
  count: number,
): ReadonlySet<string> {
  const allowed = new Set(candidates)
  const picked = new Set<string>()
  for (const trackId of answer) {
    if (picked.size >= count) break
    if (allowed.has(trackId)) picked.add(trackId)
  }
  return picked
}

function countByReason(statuses: readonly TrackStatus[]): PlaylistCounts {
  const byReason: Record<StatusReason, number> = {
    in: 0,
    mustInclude: 0,
    picked: 0,
    excluded: 0,
    outsideRange: 0,
    notPicked: 0,
    needsData: 0,
    duplicate: 0,
  }
  let inSet = 0
  for (const status of statuses) {
    byReason[status.reason]++
    if (status.inSet) inSet++
  }
  return { tracks: statuses.length, inSet, byReason }
}

/** A track's status and reason in words (§8.3), e.g. "left out · outside 85–110 BPM". */
export function statusLabel(
  status: TrackStatus,
  choices: Pick<TrackChoices, 'bpmMin' | 'bpmMax'>,
  playlistName: (playlistId: string) => string,
): string {
  switch (status.reason) {
    case 'in':
      return 'in the set'
    case 'mustInclude':
      return 'in the set · must include'
    case 'picked':
      return 'in the set · picked'
    case 'excluded':
      return 'left out · excluded'
    case 'outsideRange':
      return `left out · ${outsideRange(choices)}`
    case 'notPicked':
      return 'left out · not picked'
    case 'needsData':
      return 'left out · needs key/BPM'
    case 'duplicate':
      return `already in ${playlistName(status.ownerPlaylistId)}`
  }
}

function outsideRange({ bpmMin, bpmMax }: Pick<TrackChoices, 'bpmMin' | 'bpmMax'>): string {
  if (bpmMin === null) return bpmMax === null ? 'outside the BPM range' : `above ${bpmMax} BPM`
  return bpmMax === null ? `below ${bpmMin} BPM` : `outside ${bpmMin}–${bpmMax} BPM`
}
