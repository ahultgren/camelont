import { describe, expect, it } from 'vitest'
import {
  describeChange,
  diffPlaylist,
  playlistRemoval,
  removePlaylist,
  updatePlaylist,
  type Dropped,
} from './playlist-diff'
import { addPlaylist, newSet, ruleTrackIds, type PlaylistCopy } from './set'
import type { MixSet, MixSettings, SetTrack, TrackMark } from './types'

const track = (trackId: string): SetTrack => ({
  trackId,
  uri: `spotify:track:${trackId}`,
  title: trackId.toUpperCase(),
  artists: ['Artist'],
  durationMs: 200_000,
  imageUrl: null,
})
const tracks = (...trackIds: string[]) => trackIds.map(track)

const copy = (playlistId: string, trackIds: string[], over: Partial<PlaylistCopy> = {}) => ({
  playlistId,
  name: `Playlist ${playlistId}`,
  imageUrl: null,
  tracks: tracks(...trackIds),
  snapshotId: `snap-${playlistId}-1`,
  readAt: 10,
  skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
  ...over,
})

const setOf = (
  playlists: Record<string, string[]>,
  marks: Record<string, TrackMark> = {},
  mix: Partial<MixSettings> = {},
): MixSet => {
  const empty = newSet({ id: 's1', name: 'Friday social', now: 1 })
  const withPlaylists = Object.entries(playlists).reduce(
    (set, [playlistId, trackIds], i) => addPlaylist(set, copy(playlistId, trackIds), i + 1),
    empty,
  )
  return { ...withPlaylists, marks, mix: { ...withPlaylists.mix, ...mix } }
}

const ids = (list: readonly SetTrack[]) => list.map((t) => t.trackId)
const NOTHING: Dropped = { tracks: [], marks: [], rules: [] }

/** No mark and no mix rule names a track outside the pool. */
const expectNoStrays = (set: MixSet) => {
  const pool = new Set(set.playlists.flatMap((p) => ids(p.tracks)))
  const named = [...Object.keys(set.marks), ...ruleTrackIds(set.mix)]
  expect(named.filter((trackId) => !pool.has(trackId))).toEqual([])
}

describe('diffPlaylist', () => {
  it('finds nothing when the playlist is as it was stored', () => {
    const set = setOf({ a: ['t1', 't2', 't3'] })
    expect(diffPlaylist(set, 'a', tracks('t1', 't2', 't3'))).toEqual({
      added: [],
      removed: [],
      dropped: NOTHING,
    })
  })

  it('lists the tracks that are new and the ones that are gone', () => {
    const set = setOf({ a: ['t1', 't2', 't3'] })
    const diff = diffPlaylist(set, 'a', tracks('n1', 't1', 't3', 'n2'))
    expect(ids(diff.added)).toEqual(['n1', 'n2'])
    expect(diff.removed).toEqual(tracks('t2'))
    expect(ids(diff.dropped.tracks)).toEqual(['t2'])
  })

  it('does not count a new order or a repeated track as a change', () => {
    const set = setOf({ a: ['t1', 't2', 't2', 't3'] })
    const diff = diffPlaylist(set, 'a', tracks('t3', 't1', 't1', 't2'))
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  it('lists a track once, however often it was added or removed', () => {
    const set = setOf({ a: ['t1', 'gone', 'gone'] })
    const diff = diffPlaylist(set, 'a', tracks('t1', 'new', 'new'))
    expect(ids(diff.added)).toEqual(['new'])
    expect(ids(diff.removed)).toEqual(['gone'])
    expect(ids(diff.dropped.tracks)).toEqual(['gone'])
  })

  it('names the marks and mix rules a removal would drop (§8.2 Update)', () => {
    const set = setOf(
      { a: ['open', 'close', 'x', 'y', 'z', 'stay', 'kept'] },
      { x: 'mustInclude', y: 'exclude', stay: 'mustInclude' },
      {
        opener: 'open',
        closer: 'close',
        follows: [
          ['x', 'stay'],
          ['stay', 'z'],
          ['stay', 'kept'],
        ],
      },
    )
    const diff = diffPlaylist(set, 'a', tracks('stay', 'kept'))
    expect(ids(diff.removed)).toEqual(['open', 'close', 'x', 'y', 'z'])
    expect(diff.dropped.marks).toEqual([
      { trackId: 'x', mark: 'mustInclude' },
      { trackId: 'y', mark: 'exclude' },
    ])
    expect(diff.dropped.rules).toEqual([
      { kind: 'opener', trackId: 'open' },
      { kind: 'closer', trackId: 'close' },
      { kind: 'follow', from: 'x', to: 'stay' },
      { kind: 'follow', from: 'stay', to: 'z' },
    ])
  })

  it('drops nothing for a track that another playlist of the set still has', () => {
    const set = setOf(
      { a: ['shared', 'own'], b: ['shared', 'other'] },
      { shared: 'mustInclude' },
      { opener: 'shared' },
    )
    const diff = diffPlaylist(set, 'a', tracks('own'))
    expect(ids(diff.removed)).toEqual(['shared'])
    expect(diff.dropped).toEqual(NOTHING)
  })

  it('treats a playlist that is not in the set as all new', () => {
    const diff = diffPlaylist(setOf({ a: ['t1'] }), 'nope', tracks('t1', 't2'))
    expect(ids(diff.added)).toEqual(['t1', 't2'])
    expect(diff.removed).toEqual([])
    expect(diff.dropped).toEqual(NOTHING)
  })
})

describe('describeChange (the change notice, §8.2)', () => {
  const change = (added: string[], removed: string[]) =>
    describeChange({ added: tracks(...added), removed: tracks(...removed) })

  it('counts new and removed tracks', () => {
    expect(change(['n1', 'n2', 'n3'], ['t1'])).toBe('3 new, 1 removed')
    expect(change(['n1'], [])).toBe('1 new')
    expect(change([], ['t1', 't2'])).toBe('2 removed')
  })

  it('has nothing to say when the tracks are the same', () => {
    expect(change([], [])).toBeNull()
  })
})

describe('updatePlaylist', () => {
  const set = setOf(
    { a: ['t1', 't2', 't3'], b: ['t3', 'u1'] },
    { t2: 'mustInclude', t3: 'exclude', u1: 'mustInclude' },
    { opener: 't2', closer: 'u1', follows: [['t1', 't2']], arc: 'twoWaves' },
  )
  const fresh = copy('a', ['t1', 'n1'], { name: 'Renamed', snapshotId: 'snap-a-2', readAt: 99 })

  it('replaces the stored copy and keeps the playlist’s place and track choices', () => {
    const limited: MixSet = {
      ...set,
      playlists: set.playlists.map((p) =>
        p.playlistId === 'a' ? { ...p, choices: { ...p.choices, limit: 2, bpmMax: 110 } } : p,
      ),
    }
    const updated = updatePlaylist(limited, fresh)
    expect(updated.playlists.map((p) => p.playlistId)).toEqual(['a', 'b'])
    expect(updated.playlists[0]).toEqual({ ...fresh, choices: limited.playlists[0]?.choices })
    expect(updated.playlists[1]).toBe(limited.playlists[1])
  })

  it('drops exactly what the diff said it would', () => {
    const diff = diffPlaylist(set, 'a', fresh.tracks)
    expect(ids(diff.dropped.tracks)).toEqual(['t2'])
    expect(diff.dropped.marks).toEqual([{ trackId: 't2', mark: 'mustInclude' }])
    expect(diff.dropped.rules).toEqual([
      { kind: 'opener', trackId: 't2' },
      { kind: 'follow', from: 't1', to: 't2' },
    ])

    const updated = updatePlaylist(set, fresh)
    expect(updated.marks).toEqual({ t3: 'exclude', u1: 'mustInclude' })
    expect(updated.mix).toEqual({ opener: null, closer: 'u1', follows: [], arc: 'twoWaves' })
    expectNoStrays(updated)
    expect(diffPlaylist(updated, 'a', fresh.tracks)).toEqual({
      added: [],
      removed: [],
      dropped: NOTHING,
    })
  })

  it('leaves the set it was given untouched', () => {
    const before = structuredClone(set)
    updatePlaylist(set, fresh)
    expect(set).toEqual(before)
  })

  it('changes nothing for a playlist that is not in the set', () => {
    expect(updatePlaylist(set, copy('nope', ['x']))).toBe(set)
  })
})

describe('removing a playlist from a set (§8.2)', () => {
  const set = setOf(
    { a: ['a1', 'a2', 'shared'], b: ['shared', 'b1', 'b2'] },
    { a1: 'exclude', b1: 'mustInclude', shared: 'mustInclude' },
    {
      opener: 'b1',
      closer: 'a2',
      follows: [
        ['shared', 'b2'],
        ['a1', 'shared'],
      ],
    },
  )

  it('says what goes with it: its tracks, their marks and the rules naming them', () => {
    expect(playlistRemoval(set, 'b')).toEqual({
      tracks: tracks('b1', 'b2'),
      marks: [{ trackId: 'b1', mark: 'mustInclude' }],
      rules: [
        { kind: 'opener', trackId: 'b1' },
        { kind: 'follow', from: 'shared', to: 'b2' },
      ],
    })
  })

  it('removes the playlist and exactly those', () => {
    const removed = removePlaylist(set, 'b')
    expect(removed.playlists.map((p) => p.playlistId)).toEqual(['a'])
    expect(removed.marks).toEqual({ a1: 'exclude', shared: 'mustInclude' })
    expect(removed.mix).toEqual({
      opener: null,
      closer: 'a2',
      follows: [['a1', 'shared']],
      arc: 'none',
    })
    expectNoStrays(removed)
    expect(set.playlists).toHaveLength(2)
  })

  it('takes everything with the last playlist', () => {
    const one = setOf({ a: ['t1', 't2'] }, { t1: 'exclude' }, { opener: 't2' })
    expect(playlistRemoval(one, 'a')).toEqual({
      tracks: tracks('t1', 't2'),
      marks: [{ trackId: 't1', mark: 'exclude' }],
      rules: [{ kind: 'opener', trackId: 't2' }],
    })
    const removed = removePlaylist(one, 'a')
    expect(removed.playlists).toEqual([])
    expect(removed.marks).toEqual({})
    expect(removed.mix.opener).toBeNull()
  })

  it('finds nothing to remove for a playlist that is not in the set', () => {
    expect(playlistRemoval(set, 'nope')).toEqual(NOTHING)
    expect(removePlaylist(set, 'nope')).toBe(set)
  })
})
