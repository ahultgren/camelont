import type { MixSet, MixSettings, SetPlaylist, TrackChoices } from './types'

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

/** The tracks named in a mix rule. They count as must-include (spec §5.4). */
export function ruleTrackIds(mix: MixSettings): string[] {
  const named = [mix.opener, mix.closer, ...mix.follows.flat()]
  return [...new Set(named.filter((id) => id !== null))]
}

export type SaveState = 'never' | 'saved' | 'changed'

/**
 * Whether the set has changed since it was saved to Spotify (spec §8.5): it has when
 * saving now would write another name or another track order than the last save did.
 */
export function saveState(set: MixSet): SaveState {
  const { lastSave, chosenMix } = set
  if (lastSave === null) return 'never'
  const order = chosenMix?.order ?? []
  const same =
    lastSave.name === set.name &&
    lastSave.order.length === order.length &&
    lastSave.order.every((trackId, i) => trackId === order[i])
  return same ? 'saved' : 'changed'
}
