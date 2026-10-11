import type { ChosenMix, MixSet, MixSettings, SetPlaylist, TrackChoices } from './types'

export const NO_MIX_SETTINGS: MixSettings = { opener: null, closer: null, follows: [], arc: 'none' }

export const UNTITLED_SET = 'Untitled set'

/** A usable set name, or null when the input has none. */
export const cleanName = (name: string): string | null => name.trim() || null

/** No track choices: every track of the playlist passes (spec §8.1). */
export const defaultChoices = (seed: number): TrackChoices => ({
  bpmMin: null,
  bpmMax: null,
  limit: null,
  pick: 'random',
  seed,
})

export function newSet(init: { id: string; name: string; now: number }): MixSet {
  return {
    id: init.id,
    name: cleanName(init.name) ?? UNTITLED_SET,
    createdAt: init.now,
    editedAt: init.now,
    playlists: [],
    marks: {},
    mix: structuredClone(NO_MIX_SETTINGS),
    chosenMix: null,
    lastSave: null,
  }
}

/** A playlist as read from Spotify, before it has track choices. */
export type PlaylistCopy = Omit<SetPlaylist, 'choices'>

/** Adds a playlist after the others. A playlist is in a set once: adding it again changes nothing. */
export function addPlaylist(set: MixSet, copy: PlaylistCopy, seed: number): MixSet {
  if (set.playlists.some((p) => p.playlistId === copy.playlistId)) return set
  return { ...set, playlists: [...set.playlists, { ...copy, choices: defaultChoices(seed) }] }
}

/**
 * A copy to work on: same playlists, choices, marks, rules and chosen mix (so the same
 * picks and the same mix), but not yet saved to Spotify.
 */
export function duplicateSet(set: MixSet, init: { id: string; now: number }): MixSet {
  return {
    ...structuredClone(set),
    id: init.id,
    name: `${set.name} copy`,
    createdAt: init.now,
    editedAt: init.now,
    lastSave: null,
  }
}

/** The mix rules of a set: its mix settings without the arc. */
export type MixRules = Pick<MixSettings, 'opener' | 'closer' | 'follows'>

/** The tracks named in a mix rule. They count as must-include (spec §5.4). */
export function ruleTrackIds(mix: MixRules): string[] {
  const named = [mix.opener, mix.closer, ...mix.follows.flat()]
  return [...new Set(named.filter((id) => id !== null))]
}

/** Whether two mixes play the same tracks in the same order. */
export const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((trackId, index) => trackId === b[index])

/**
 * Which of the alternatives is the stored mix (spec §8.5): the one with exactly its
 * track order, or null. The stored mix is only ever used through this check, because
 * the tracks in the set can change without the set changing (an override made in
 * another set): a mix that is not among today's alternatives is not shown.
 */
export function chosenIndex(
  chosen: ChosenMix | null,
  alternatives: readonly (readonly string[])[],
): number | null {
  if (chosen === null) return null
  const index = alternatives.findIndex((order) => sameOrder(order, chosen.order))
  return index === -1 ? null : index
}

export type SaveState = 'never' | 'saved' | 'changed'

/**
 * Whether the mix has changed since it was saved to Spotify (spec §8.5): it has when
 * saving now would write another track order than the last save did. The playlist's
 * name is chosen in the save dialog and takes no part. A save that didn't write the
 * whole mix (its `order` is empty) always counts as changed.
 */
export function saveState(set: MixSet): SaveState {
  const { lastSave, chosenMix } = set
  if (lastSave === null) return 'never'
  if (lastSave.order.length === 0) return 'changed'
  return sameOrder(lastSave.order, chosenMix?.order ?? []) ? 'saved' : 'changed'
}
