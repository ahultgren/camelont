import { sameOrder } from './set'
import type { LastSave, MixSet, PickMethod, SetArc, TrackChoices, TrackMark } from './types'

/**
 * Every edit the workspace makes to a set, as pure functions for the store's `update`.
 * Each returns the same set when nothing changes, so no edit is recorded for it. They
 * replace only what they change: a part of the set that keeps its identity is a part
 * nothing has to be worked out again for.
 */

function withChoices(
  set: MixSet,
  playlistId: string,
  change: Partial<Omit<TrackChoices, 'seed'>>,
): MixSet {
  const playlist = set.playlists.find((candidate) => candidate.playlistId === playlistId)
  if (!playlist) return set
  const choices = { ...playlist.choices, ...change }
  const same = (Object.keys(choices) as (keyof TrackChoices)[]).every(
    (key) => choices[key] === playlist.choices[key],
  )
  if (same) return set
  return {
    ...set,
    playlists: set.playlists.map((candidate) =>
      candidate === playlist ? { ...playlist, choices } : candidate,
    ),
  }
}

const numberOrNull = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null

/** The playlist's BPM range (spec §8.3): inclusive, either end may be left open. */
export const withBpmRange = (
  set: MixSet,
  playlistId: string,
  range: { min: number | null; max: number | null },
): MixSet =>
  withChoices(set, playlistId, {
    bpmMin: numberOrNull(range.min),
    bpmMax: numberOrNull(range.max),
  })

/** The most tracks the playlist contributes (spec §8.4); null is no limit. */
export function withLimit(set: MixSet, playlistId: string, limit: number | null): MixSet {
  const whole = numberOrNull(limit)
  return withChoices(set, playlistId, {
    limit: whole === null ? null : Math.max(0, Math.floor(whole)),
  })
}

export const withPickMethod = (set: MixSet, playlistId: string, pick: PickMethod): MixSet =>
  withChoices(set, playlistId, { pick })

/** A track's mark; null removes it. Marks belong to the track in every playlist (§8.2). */
export function withMark(set: MixSet, trackId: string, mark: TrackMark | null): MixSet {
  if ((set.marks[trackId] ?? null) === mark) return set
  const others = Object.entries(set.marks).filter(([marked]) => marked !== trackId)
  return {
    ...set,
    marks: Object.fromEntries(mark === null ? others : [...others, [trackId, mark]]),
  }
}

export const withOpener = (set: MixSet, trackId: string | null): MixSet =>
  set.mix.opener === trackId ? set : { ...set, mix: { ...set.mix, opener: trackId } }

export const withCloser = (set: MixSet, trackId: string | null): MixSet =>
  set.mix.closer === trackId ? set : { ...set, mix: { ...set.mix, closer: trackId } }

const isPair = (from: string, to: string) => (pair: readonly [string, string]) =>
  pair[0] === from && pair[1] === to

/** "`from` must be followed by `to`". A pair is in the rules once. */
export function withFollow(set: MixSet, from: string, to: string): MixSet {
  if (set.mix.follows.some(isPair(from, to))) return set
  return { ...set, mix: { ...set.mix, follows: [...set.mix.follows, [from, to]] } }
}

export function withoutFollow(set: MixSet, from: string, to: string): MixSet {
  const follows = set.mix.follows.filter((pair) => !isPair(from, to)(pair))
  return follows.length === set.mix.follows.length ? set : { ...set, mix: { ...set.mix, follows } }
}

export const withArc = (set: MixSet, arc: SetArc): MixSet =>
  set.mix.arc === arc ? set : { ...set, mix: { ...set.mix, arc } }

/** The alternative the user chose, by its track order; null forgets the choice (§8.5). */
export function withChosenMix(set: MixSet, order: readonly string[] | null): MixSet {
  if (order === null) return set.chosenMix === null ? set : { ...set, chosenMix: null }
  if (set.chosenMix && sameOrder(set.chosenMix.order, order)) return set
  return { ...set, chosenMix: { order: [...order] } }
}

/**
 * A save to Spotify (spec §8.5): what was written, where and when. The saved mix is
 * from then on the chosen one, so reopening the set shows what was saved.
 */
export const withSave = (set: MixSet, save: LastSave): MixSet => ({
  ...withChosenMix(set, save.order),
  lastSave: { ...save, order: [...save.order] },
})

/** The toggles on a track row, of which at most one is on (spec §9.1). */
export type TrackRole = 'opener' | 'closer' | TrackMark

/** The role a track row shows. A rule comes before a mark, should a track have both. */
export function roleOf(set: MixSet, trackId: string): TrackRole | null {
  if (set.mix.opener === trackId) return 'opener'
  if (set.mix.closer === trackId) return 'closer'
  return set.marks[trackId] ?? null
}

/**
 * Turns one of a track's toggles on (null: all off) and its others off, as one edit.
 * Another track that had the opener or closer role loses it; follow pairs are not roles
 * and stay.
 */
export function withRole(set: MixSet, trackId: string, role: TrackRole | null): MixSet {
  const opener = role === 'opener' ? trackId : set.mix.opener === trackId ? null : set.mix.opener
  const closer = role === 'closer' ? trackId : set.mix.closer === trackId ? null : set.mix.closer
  const mark = role === 'mustInclude' || role === 'exclude' ? role : null
  return withMark(withCloser(withOpener(set, opener), closer), trackId, mark)
}
