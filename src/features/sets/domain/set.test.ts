import { describe, expect, it } from 'vitest'
import {
  addPlaylist,
  defaultChoices,
  duplicateSet,
  newSet,
  NO_MIX_SETTINGS,
  ruleTrackIds,
  saveState,
  type PlaylistCopy,
} from './set'
import type { MixSet, SetTrack } from './types'

const track = (trackId: string): SetTrack => ({
  trackId,
  uri: `spotify:track:${trackId}`,
  title: trackId.toUpperCase(),
  artists: ['Artist'],
  durationMs: 200_000,
  imageUrl: null,
})

const copy = (playlistId: string, trackIds: string[]): PlaylistCopy => ({
  playlistId,
  name: `Playlist ${playlistId}`,
  imageUrl: null,
  tracks: trackIds.map(track),
  snapshotId: `snap-${playlistId}`,
  readAt: 50,
})

describe('newSet', () => {
  it('starts empty, with no marks, rules, mix or save', () => {
    expect(newSet({ id: 's1', name: '  Friday social ', now: 100 })).toEqual({
      id: 's1',
      name: 'Friday social',
      createdAt: 100,
      editedAt: 100,
      playlists: [],
      marks: {},
      mix: NO_MIX_SETTINGS,
      chosenMix: null,
      lastSave: null,
    })
  })

  it('names a set that was given no name', () => {
    expect(newSet({ id: 's1', name: '   ', now: 1 }).name).toBe('Untitled set')
  })
})

describe('addPlaylist', () => {
  it('appends playlists in the order they were added, with no track choices', () => {
    const empty = newSet({ id: 's1', name: 'Set', now: 1 })
    const set = addPlaylist(addPlaylist(empty, copy('a', ['t1']), 7), copy('b', ['t2']), 8)
    expect(set.playlists.map((p) => p.playlistId)).toEqual(['a', 'b'])
    expect(set.playlists[0]).toEqual({ ...copy('a', ['t1']), choices: defaultChoices(7) })
    expect(set.playlists[1]?.choices).toEqual({
      bpmMin: null,
      bpmMax: null,
      limit: null,
      pick: 'random',
      seed: 8,
    })
    expect(empty.playlists).toEqual([])
  })

  it('leaves the set alone when the playlist is already in it', () => {
    const set = addPlaylist(newSet({ id: 's1', name: 'Set', now: 1 }), copy('a', ['t1']), 7)
    expect(addPlaylist(set, copy('a', ['t1', 't2']), 9)).toBe(set)
  })
})

describe('duplicateSet', () => {
  const original: MixSet = {
    ...addPlaylist(newSet({ id: 's1', name: 'Friday social', now: 1 }), copy('a', ['t1', 't2']), 7),
    marks: { t1: 'mustInclude' },
    mix: { opener: 't1', closer: null, follows: [['t1', 't2']], arc: 'twoWaves' },
    chosenMix: { order: ['t1', 't2'] },
    lastSave: {
      url: 'https://open.spotify.com/playlist/x',
      savedAt: 5,
      name: 'Friday social',
      order: ['t1', 't2'],
    },
  }

  it('copies everything but the identity, the times and the save', () => {
    const duplicate = duplicateSet(original, { id: 's2', now: 200 })
    expect(duplicate).toEqual({
      ...original,
      id: 's2',
      name: 'Friday social copy',
      createdAt: 200,
      editedAt: 200,
      lastSave: null,
    })
  })

  it('shares nothing with the original', () => {
    const duplicate = duplicateSet(original, { id: 's2', now: 200 })
    duplicate.playlists[0]?.tracks.pop()
    duplicate.marks.t2 = 'exclude'
    duplicate.mix.follows.pop()
    expect(original.playlists[0]?.tracks).toHaveLength(2)
    expect(original.marks).toEqual({ t1: 'mustInclude' })
    expect(original.mix.follows).toEqual([['t1', 't2']])
  })
})

describe('ruleTrackIds', () => {
  it('lists each track named as opener, closer or in a follow pair once', () => {
    expect(
      ruleTrackIds({
        opener: 'a',
        closer: 'b',
        follows: [
          ['a', 'c'],
          ['c', 'd'],
        ],
        arc: 'none',
      }),
    ).toEqual(['a', 'b', 'c', 'd'])
    expect(ruleTrackIds(NO_MIX_SETTINGS)).toEqual([])
  })
})

describe('saveState', () => {
  const base = newSet({ id: 's1', name: 'Friday social', now: 1 })
  const saved: MixSet = {
    ...base,
    chosenMix: { order: ['a', 'b', 'c'] },
    lastSave: {
      url: 'https://open.spotify.com/playlist/x',
      savedAt: 5,
      name: 'Friday social',
      order: ['a', 'b', 'c'],
    },
  }

  it('is "never" until the set has been saved to Spotify', () => {
    expect(saveState(base)).toBe('never')
  })

  it('is "saved" while the set would be written as it was', () => {
    expect(saveState(saved)).toBe('saved')
    expect(saveState({ ...saved, editedAt: 99, marks: { z: 'exclude' } })).toBe('saved')
  })

  it('is "changed" when the mix or the name differs from what was written', () => {
    expect(saveState({ ...saved, chosenMix: { order: ['a', 'c', 'b'] } })).toBe('changed')
    expect(saveState({ ...saved, chosenMix: { order: ['a', 'b'] } })).toBe('changed')
    expect(saveState({ ...saved, chosenMix: null })).toBe('changed')
    expect(saveState({ ...saved, name: 'Saturday social' })).toBe('changed')
  })
})
