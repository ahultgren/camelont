import { describe, expect, it } from 'vitest'
import {
  roleOf,
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
  withIncompleteSave,
  withRole,
  withSave,
  withShape,
} from './edits'
import { saveState } from './set'
import { addPlaylist, newSet, type PlaylistCopy } from './set'
import type { MixSet } from './types'

const copy = (playlistId: string, trackIds: string[]): PlaylistCopy => ({
  playlistId,
  name: `Playlist ${playlistId}`,
  imageUrl: null,
  tracks: trackIds.map((trackId) => ({
    trackId,
    uri: `spotify:track:${trackId}`,
    title: trackId.toUpperCase(),
    artists: ['Artist'],
    durationMs: 200_000,
    imageUrl: null,
  })),
  snapshotId: null,
  readAt: 50,
  skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
})

const base: MixSet = [copy('a', ['t1', 't2', 't3']), copy('b', ['t4'])].reduce(
  (set, playlist, i) => addPlaylist(set, playlist, i + 1),
  newSet({ id: 's1', name: 'Friday', now: 100 }),
)

const choicesOf = (set: MixSet, playlistId: string) =>
  set.playlists.find((playlist) => playlist.playlistId === playlistId)?.choices

describe('track choices', () => {
  it('sets a BPM range on one playlist and leaves the other alone', () => {
    const set = withBpmRange(base, 'a', { min: 85, max: 110 })
    expect(choicesOf(set, 'a')).toMatchObject({ bpmMin: 85, bpmMax: 110 })
    expect(choicesOf(set, 'b')).toEqual(choicesOf(base, 'b'))
    expect(set.playlists[1]).toBe(base.playlists[1])
  })

  it('leaves an end of the range open', () => {
    const set = withBpmRange(base, 'a', { min: null, max: 110 })
    expect(choicesOf(set, 'a')).toMatchObject({ bpmMin: null, bpmMax: 110 })
    expect(choicesOf(withBpmRange(set, 'a', { min: Number.NaN, max: null }), 'a')).toMatchObject({
      bpmMin: null,
      bpmMax: null,
    })
  })

  it('sets and removes a limit, as a whole number that is not negative', () => {
    expect(choicesOf(withLimit(base, 'a', 2), 'a')?.limit).toBe(2)
    expect(choicesOf(withLimit(base, 'a', 2.9), 'a')?.limit).toBe(2)
    expect(choicesOf(withLimit(base, 'a', -1), 'a')?.limit).toBe(0)
    expect(choicesOf(withLimit(base, 'a', Number.NaN), 'a')?.limit).toBeNull()
    expect(choicesOf(withLimit(withLimit(base, 'a', 2), 'a', null), 'a')?.limit).toBeNull()
  })

  it('chooses the pick method and keeps the seed', () => {
    const set = withPickMethod(base, 'a', 'bestFit')
    expect(choicesOf(set, 'a')).toMatchObject({ pick: 'bestFit', seed: 1 })
  })

  it('returns the same set when nothing changes or the playlist is unknown', () => {
    expect(withBpmRange(base, 'a', { min: null, max: null })).toBe(base)
    expect(withLimit(base, 'a', null)).toBe(base)
    expect(withPickMethod(base, 'a', 'random')).toBe(base)
    expect(withLimit(base, 'nope', 3)).toBe(base)
  })
})

describe('marks', () => {
  it('sets, changes and clears a track mark', () => {
    const marked = withMark(base, 't1', 'exclude')
    expect(marked.marks).toEqual({ t1: 'exclude' })
    expect(withMark(marked, 't1', 'mustInclude').marks).toEqual({ t1: 'mustInclude' })
    expect(withMark(marked, 't1', null).marks).toEqual({})
  })

  it('returns the same set when the mark is already so', () => {
    const marked = withMark(base, 't1', 'exclude')
    expect(withMark(marked, 't1', 'exclude')).toBe(marked)
    expect(withMark(base, 't1', null)).toBe(base)
  })

  it('keeps the mix rules as they are', () => {
    const opened = withOpener(base, 't1')
    expect(withMark(opened, 't1', 'exclude').mix).toBe(opened.mix)
  })
})

describe('mix rules', () => {
  it('sets and clears the opener and the closer', () => {
    const set = withCloser(withOpener(base, 't1'), 't3')
    expect(set.mix).toMatchObject({ opener: 't1', closer: 't3' })
    expect(withOpener(set, null).mix).toMatchObject({ opener: null, closer: 't3' })
    expect(withCloser(set, null).mix).toMatchObject({ opener: 't1', closer: null })
    expect(withOpener(set, 't1')).toBe(set)
  })

  it('adds follow pairs in the order given, each once', () => {
    const set = withFollow(withFollow(base, 't1', 't2'), 't2', 't4')
    expect(set.mix.follows).toEqual([
      ['t1', 't2'],
      ['t2', 't4'],
    ])
    expect(withFollow(set, 't1', 't2')).toBe(set)
  })

  it('removes a follow pair', () => {
    const set = withFollow(withFollow(base, 't1', 't2'), 't2', 't4')
    expect(withoutFollow(set, 't1', 't2').mix.follows).toEqual([['t2', 't4']])
    expect(withoutFollow(set, 't2', 't1')).toBe(set)
  })

  it('keeps the follow pairs when only the arc changes', () => {
    const set = withFollow(base, 't1', 't2')
    const arced = withArc(set, 'twoWaves')
    expect(arced.mix.arc).toBe('twoWaves')
    expect(arced.mix.follows).toBe(set.mix.follows)
    expect(withArc(arced, 'twoWaves')).toBe(arced)
  })

  it('changes what shapes the mix, a part at a time', () => {
    const byEnergy = withShape(base, { arc: 'twoWaves', arcSignal: 'energy' })
    expect(byEnergy.mix).toMatchObject({ arc: 'twoWaves', arcSignal: 'energy', keyLift: false })
    const lifted = withShape(byEnergy, { keyLift: true })
    expect(lifted.mix).toMatchObject({ arc: 'twoWaves', arcSignal: 'energy', keyLift: true })
    expect(withShape(lifted, { keyLift: true, arcSignal: 'energy' })).toBe(lifted)
  })
})

describe('chosen mix', () => {
  it('stores the order of the chosen alternative, and forgets it', () => {
    const chosen = withChosenMix(base, ['t2', 't1'])
    expect(chosen.chosenMix).toEqual({ order: ['t2', 't1'] })
    expect(withChosenMix(chosen, ['t2', 't1'])).toBe(chosen)
    expect(withChosenMix(chosen, null).chosenMix).toBeNull()
    expect(withChosenMix(base, null)).toBe(base)
  })

  it('records a save, with the saved mix as the chosen one', () => {
    const order = ['t2', 't1']
    const save = { playlistId: 'p1', url: 'https://x/y', savedAt: 9, name: 'Friday mix', order }
    const saved = withSave(base, save)
    expect(saved.lastSave).toEqual(save)
    expect(saved.chosenMix).toEqual({ order })
    expect(saveState(saved)).toBe('saved')
    // The stored order is the set's own copy.
    order.push('t3')
    expect(saved.lastSave?.order).toEqual(['t2', 't1'])
    expect(saveState(withChosenMix(saved, ['t1', 't2']))).toBe('changed')
  })

  it('remembers the playlist of a save that fell short, without calling any mix saved', () => {
    const chosen = withChosenMix(base, ['t1', 't2'])
    const short = withIncompleteSave(chosen, {
      playlistId: 'p1',
      url: 'https://x/y',
      savedAt: 9,
      name: 'Friday mix',
    })
    expect(short.lastSave).toMatchObject({ playlistId: 'p1', order: [] })
    expect(short.chosenMix).toBe(chosen.chosenMix)
    expect(saveState(short)).toBe('changed')
  })
})

describe('the one role a track row shows (spec §9.1)', () => {
  it('reads the opener, the closer or the mark', () => {
    const set = withMark(withCloser(withOpener(base, 't1'), 't2'), 't3', 'exclude')
    expect(['t1', 't2', 't3', 't4'].map((trackId) => roleOf(set, trackId))).toEqual([
      'opener',
      'closer',
      'exclude',
      null,
    ])
    expect(roleOf(withMark(base, 't4', 'mustInclude'), 't4')).toBe('mustInclude')
  })

  it('gives a track one role and takes its other ones away', () => {
    const excluded = withRole(base, 't1', 'exclude')
    expect(excluded.marks).toEqual({ t1: 'exclude' })
    const opener = withRole(excluded, 't1', 'opener')
    expect(opener.marks).toEqual({})
    expect(opener.mix.opener).toBe('t1')
    const closer = withRole(opener, 't1', 'closer')
    expect(closer.mix).toMatchObject({ opener: null, closer: 't1' })
    const included = withRole(closer, 't1', 'mustInclude')
    expect(included.mix).toMatchObject({ opener: null, closer: null })
    expect(included.marks).toEqual({ t1: 'mustInclude' })
    expect(withRole(included, 't1', null).marks).toEqual({})
  })

  it('moves the opener from another track without touching that track’s mark', () => {
    const set = withMark(withOpener(base, 't1'), 't2', 'mustInclude')
    const moved = withRole(set, 't3', 'opener')
    expect(moved.mix.opener).toBe('t3')
    expect(moved.marks).toEqual({ t2: 'mustInclude' })
  })

  it('leaves follow pairs alone, and changes nothing when the role is already so', () => {
    const set = withRole(withFollow(base, 't1', 't2'), 't1', 'opener')
    expect(set.mix.follows).toEqual([['t1', 't2']])
    expect(withRole(set, 't1', 'opener')).toBe(set)
    expect(withRole(base, 't1', null)).toBe(base)
  })
})
