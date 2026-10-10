import type { CamelotKey } from '@/shared/music'
import type { PickMethod, TrackChoices, TrackMark } from './types'

/**
 * Which tracks are in a set (spec §8.2–8.4). The rule table of §8.3 lives here and
 * nowhere else: a track's fate is decided by the first rule that applies.
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
  /** The tracks that passed rules 1–5, in playlist order. */
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
  /** The track belongs to an earlier playlist; it is decided there. */
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
  /** Every pool track's status in the playlist it belongs to. */
  statusByTrack: ReadonlyMap<string, TrackStatus>
  /** The tracks in the set, in pool order (playlists as added, tracks as listed). */
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
  const required = new Set(input.ruleTrackIds)
  const mixable = (trackId: string): PickTrack | null => {
    const { camelot = null, bpm = null } = input.trackData.get(trackId) ?? {}
    return camelot !== null && bpm !== null ? { trackId, camelot, bpm } : null
  }

  // Rules 2–5 and 7 for a track in the playlist it belongs to. Null: a pick decides.
  const settle = (trackId: string, choices: TrackChoices): TrackStatus | null => {
    const mark = input.marks[trackId]
    if (mark === 'exclude') return EXCLUDED
    if (mark === 'mustInclude' || required.has(trackId)) return MUST_INCLUDE
    const track = mixable(trackId)
    if (!track) return NEEDS_DATA
    if (!inRange(track.bpm, choices)) return OUTSIDE_RANGE
    return choices.limit === null ? IN : null
  }

  // First pass: who owns each track (rule 1), and every status that needs no pick.
  const owner = new Map<string, number>()
  const statusByTrack = new Map<string, TrackStatus>()
  const poolOrder: string[] = []
  const drafts = input.playlists.map((playlist, index) => {
    const trackIds = [...new Set(playlist.tracks.map((track) => track.trackId))]
    const candidates: string[] = []
    let mustInclude = 0
    for (const trackId of trackIds) {
      if (owner.has(trackId)) continue
      owner.set(trackId, index)
      poolOrder.push(trackId)
      const status = settle(trackId, playlist.choices)
      if (status === null) candidates.push(trackId)
      else statusByTrack.set(trackId, status)
      if (status === MUST_INCLUDE) mustInclude++
    }
    // Must-include tracks count toward the limit (§8.4). With room for every candidate
    // they are all in, and with room for none they are all out: no pick either way.
    const places = (playlist.choices.limit ?? Infinity) - mustInclude
    const needsPick = places > 0 && candidates.length > places
    if (!needsPick) {
      for (const trackId of candidates) statusByTrack.set(trackId, places > 0 ? IN : NOT_PICKED)
    }
    return { playlist, trackIds, mustInclude, places, toPick: needsPick ? candidates : [] }
  })

  // Second pass: the other limited playlists pick, in the order they were added (rule 6).
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
  const inSet = poolOrder.filter((trackId) => statusOf(trackId).inSet)
  return {
    playlists: drafts.map(({ playlist, trackIds, mustInclude }, index) => {
      const tracks = trackIds.map((trackId) => {
        const first = input.playlists[owner.get(trackId) ?? index]
        const status: TrackStatus =
          first === undefined || first === playlist
            ? statusOf(trackId)
            : { inSet: false, reason: 'duplicate', ownerPlaylistId: first.playlistId }
        return { trackId, status }
      })
      const { limit } = playlist.choices
      return {
        playlistId: playlist.playlistId,
        tracks,
        counts: countByReason(tracks.map((row) => row.status)),
        limitFilled: limit !== null && mustInclude > 0 && mustInclude >= limit,
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
