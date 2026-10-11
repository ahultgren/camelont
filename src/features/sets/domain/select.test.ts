import { describe, expect, it, vi } from 'vitest'
import {
  selectTracks,
  statusLabel,
  type PickFn,
  type PickRequest,
  type SelectInput,
  type SelectPlaylist,
  type Selection,
  type TrackData,
} from './select'
import type { TrackChoices, TrackMark } from './types'

const choices = (over: Partial<TrackChoices> = {}): TrackChoices => ({
  bpmMin: null,
  bpmMax: null,
  limit: null,
  pick: 'random',
  seed: 1,
  ...over,
})

const playlist = (
  playlistId: string,
  trackIds: string[],
  over: Partial<TrackChoices> = {},
): SelectPlaylist => ({
  playlistId,
  tracks: trackIds.map((trackId) => ({ trackId })),
  choices: choices(over),
})

/** Every track gets 8A; the BPM is given per track (null = unknown). */
const bpms = (byTrack: Record<string, number | null>): Map<string, TrackData> =>
  new Map(Object.entries(byTrack).map(([id, bpm]) => [id, { camelot: '8A', bpm }]))

/** 100 BPM in 8A for each of the given tracks. */
const known = (...trackIds: string[]): Map<string, TrackData> =>
  bpms(Object.fromEntries(trackIds.map((id) => [id, 100])))

/** A pick method for tests: the first candidates in playlist order. */
const firstFew: PickFn = ({ candidates, count }) =>
  candidates.slice(0, count).map((track) => track.trackId)

const select = (input: Partial<SelectInput> & Pick<SelectInput, 'playlists' | 'trackData'>) =>
  selectTracks({ marks: {}, ruleTrackIds: [], pick: firstFew, ...input })

const statuses = (selection: Selection, playlistId: string): Record<string, string> => {
  const found = selection.playlists.find((p) => p.playlistId === playlistId)
  return Object.fromEntries(
    (found?.tracks ?? []).map((row) => [
      row.trackId,
      row.status.reason === 'duplicate'
        ? `duplicate of ${row.status.ownerPlaylistId}`
        : row.status.reason,
    ]),
  )
}

const marks = (byTrack: Record<string, TrackMark>) => byTrack

describe('selectTracks: one playlist', () => {
  it('lets every track through when there are no choices (§8.1)', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'c'])],
      trackData: known('a', 'b', 'c'),
    })
    expect(selection.inSet).toEqual(['a', 'b', 'c'])
    expect(statuses(selection, 'p')).toEqual({ a: 'in', b: 'in', c: 'in' })
    expect(selection.blockers).toEqual([])
    expect(selection.pool).toBe(3)
  })

  it('leaves out a track without a key or a BPM, without blocking the rest', () => {
    const trackData = new Map<string, TrackData>([
      ['a', { camelot: '8A', bpm: 100 }],
      ['noBpm', { camelot: '8A', bpm: null }],
      ['noKey', { camelot: null, bpm: 100 }],
    ])
    const selection = select({
      playlists: [playlist('p', ['a', 'noBpm', 'noKey', 'unknown'])],
      trackData,
    })
    expect(statuses(selection, 'p')).toEqual({
      a: 'in',
      noBpm: 'needsData',
      noKey: 'needsData',
      unknown: 'needsData',
    })
    expect(selection.inSet).toEqual(['a'])
    expect(selection.blockers).toEqual([])
  })

  it('applies the BPM range inclusively, with either end open', () => {
    const trackData = bpms({ slow: 84.9, low: 85, mid: 100, high: 110, fast: 110.1 })
    const ids = ['slow', 'low', 'mid', 'high', 'fast']
    const both = select({ playlists: [playlist('p', ids, { bpmMin: 85, bpmMax: 110 })], trackData })
    expect(both.inSet).toEqual(['low', 'mid', 'high'])
    expect(statuses(both, 'p')).toMatchObject({ slow: 'outsideRange', fast: 'outsideRange' })

    const minOnly = select({ playlists: [playlist('p', ids, { bpmMin: 85 })], trackData })
    expect(minOnly.inSet).toEqual(['low', 'mid', 'high', 'fast'])

    const maxOnly = select({ playlists: [playlist('p', ids, { bpmMax: 110 })], trackData })
    expect(maxOnly.inSet).toEqual(['slow', 'low', 'mid', 'high'])
  })

  it('collapses a track that repeats inside the playlist (§8.2)', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'a', 'a'])],
      trackData: known('a', 'b'),
    })
    expect(selection.playlists[0]?.tracks.map((row) => row.trackId)).toEqual(['a', 'b'])
    expect(selection.inSet).toEqual(['a', 'b'])
    expect(selection.playlists[0]?.counts.tracks).toBe(2)
  })
})

describe('selectTracks: marks and mix rules', () => {
  it('excludes a marked track, and nothing overrides that', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b'])],
      trackData: known('a', 'b'),
      marks: marks({ a: 'exclude' }),
      ruleTrackIds: ['a'],
    })
    expect(statuses(selection, 'p')).toEqual({ a: 'excluded', b: 'in' })
    expect(selection.inSet).toEqual(['b'])
  })

  it('keeps a must-include track whatever its BPM', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b'], { bpmMin: 85, bpmMax: 110 })],
      trackData: bpms({ a: 140, b: 140 }),
      marks: marks({ a: 'mustInclude' }),
    })
    expect(statuses(selection, 'p')).toEqual({ a: 'mustInclude', b: 'outsideRange' })
  })

  it('treats a track named in a mix rule as must-include (§5.4)', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b'], { bpmMax: 110 })],
      trackData: bpms({ a: 140, b: 140 }),
      ruleTrackIds: new Set(['a']),
    })
    expect(statuses(selection, 'p')).toEqual({ a: 'mustInclude', b: 'outsideRange' })
  })

  it('reports a must-include track without key or BPM as a blocker (§8.3)', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'c'])],
      trackData: bpms({ a: null, c: 100 }),
      marks: marks({ a: 'mustInclude' }),
      ruleTrackIds: ['b'],
    })
    expect(statuses(selection, 'p')).toEqual({ a: 'mustInclude', b: 'mustInclude', c: 'in' })
    expect(selection.inSet).toEqual(['a', 'b', 'c'])
    expect(selection.blockers).toEqual(['a', 'b'])
  })

  it('ignores marks and rules for tracks that are not in any playlist', () => {
    const selection = select({
      playlists: [playlist('p', ['a'])],
      trackData: known('a', 'gone'),
      marks: marks({ gone: 'mustInclude' }),
      ruleTrackIds: ['gone'],
    })
    expect(selection.inSet).toEqual(['a'])
    expect(selection.blockers).toEqual([])
  })
})

describe('selectTracks: a track in several playlists (§8.2)', () => {
  it('is in the set once, in the first playlist that lets it in', () => {
    const selection = select({
      playlists: [playlist('first', ['a', 'shared']), playlist('second', ['shared', 'b'])],
      trackData: known('a', 'b', 'shared'),
    })
    expect(statuses(selection, 'first')).toEqual({ a: 'in', shared: 'in' })
    expect(statuses(selection, 'second')).toEqual({ shared: 'duplicate of first', b: 'in' })
    expect(selection.inSet).toEqual(['a', 'shared', 'b'])
    expect(selection.pool).toBe(3)
    expect(selection.statusByTrack.get('shared')).toEqual({ inSet: true, reason: 'in' })
  })

  it('is in the set through a later playlist when an earlier one’s range leaves it out', () => {
    const selection = select({
      playlists: [
        playlist('ranged', ['slow', 'shared'], { bpmMin: 85, bpmMax: 110 }),
        playlist('open', ['b', 'shared']),
      ],
      trackData: bpms({ slow: 100, shared: 120, b: 100 }),
    })
    expect(statuses(selection, 'ranged')).toEqual({ slow: 'in', shared: 'outsideRange' })
    expect(statuses(selection, 'open')).toEqual({ b: 'in', shared: 'in' })
    expect(selection.statusByTrack.get('shared')).toEqual({ inSet: true, reason: 'in' })
    // It sits where the playlist that decides it has it.
    expect(selection.inSet).toEqual(['slow', 'b', 'shared'])
    expect(selection.pool).toBe(3)
    expect(selection.playlists[0]?.counts).toMatchObject({ tracks: 2, inSet: 1 })
    expect(selection.playlists[0]?.counts.byReason.outsideRange).toBe(1)
  })

  it('shows "already in" in every other playlist that would take it', () => {
    const selection = select({
      playlists: [
        playlist('ranged', ['shared'], { bpmMax: 110 }),
        playlist('decides', ['shared']),
        playlist('after', ['shared']),
        playlist('afterRanged', ['shared'], { bpmMax: 100 }),
      ],
      trackData: bpms({ shared: 120 }),
    })
    expect(statuses(selection, 'ranged')).toEqual({ shared: 'outsideRange' })
    expect(statuses(selection, 'decides')).toEqual({ shared: 'in' })
    expect(statuses(selection, 'after')).toEqual({ shared: 'duplicate of decides' })
    expect(statuses(selection, 'afterRanged')).toEqual({ shared: 'outsideRange' })
    expect(selection.inSet).toEqual(['shared'])
  })

  it('prefers a playlist without a limit to an earlier one with a limit', () => {
    const pick = vi.fn(firstFew)
    const selection = select({
      playlists: [
        playlist('limited', ['shared', 'a', 'b', 'c'], { limit: 2 }),
        playlist('whole', ['x', 'shared']),
      ],
      trackData: known('shared', 'a', 'b', 'c', 'x'),
      pick,
    })
    expect(statuses(selection, 'limited')).toEqual({
      shared: 'duplicate of whole',
      a: 'picked',
      b: 'picked',
      c: 'notPicked',
    })
    expect(statuses(selection, 'whole')).toEqual({ x: 'in', shared: 'in' })
    // Not a candidate of the limited playlist, and not one of its two places.
    const request = pick.mock.calls[0]?.[0]
    expect(request?.candidates.map((t) => t.trackId)).toEqual(['a', 'b', 'c'])
    expect(request?.count).toBe(2)
    expect(request?.inSet.map((t) => t.trackId)).toEqual(['x', 'shared'])
    expect(selection.inSet).toEqual(['a', 'b', 'x', 'shared'])
  })

  it('does not count a track an earlier playlist took toward a later limit', () => {
    const pick = vi.fn(firstFew)
    const selection = select({
      playlists: [
        playlist('first', ['shared']),
        playlist('second', ['shared', 'b', 'c', 'd'], { limit: 2 }),
      ],
      trackData: known('shared', 'b', 'c', 'd'),
      pick,
    })
    expect(statuses(selection, 'second')).toEqual({
      shared: 'duplicate of first',
      b: 'picked',
      c: 'picked',
      d: 'notPicked',
    })
    expect(pick.mock.calls[0]?.[0].candidates.map((t) => t.trackId)).toEqual(['b', 'c', 'd'])
  })

  it('lets the first of two limited playlists decide, and does not pass a loser on', () => {
    const requests: PickRequest[] = []
    const lastFew: PickFn = (request) => {
      requests.push(request)
      return request.candidates.slice(-request.count).map((t) => t.trackId)
    }
    const selection = select({
      playlists: [
        playlist('one', ['shared', 'a', 'b'], { limit: 1 }),
        playlist('two', ['shared', 'c', 'd', 'e'], { limit: 2 }),
      ],
      trackData: known('shared', 'a', 'b', 'c', 'd', 'e'),
      pick: lastFew,
    })
    expect(statuses(selection, 'one')).toEqual({ shared: 'notPicked', a: 'notPicked', b: 'picked' })
    expect(statuses(selection, 'two')).toEqual({
      shared: 'duplicate of one',
      c: 'notPicked',
      d: 'picked',
      e: 'picked',
    })
    expect(requests.map((r) => r.candidates.map((t) => t.trackId))).toEqual([
      ['shared', 'a', 'b'],
      ['c', 'd', 'e'],
    ])
    expect(selection.statusByTrack.get('shared')).toEqual({ inSet: false, reason: 'notPicked' })
    expect(selection.inSet).toEqual(['b', 'd', 'e'])
  })

  it('falls back to a limited playlist when the unlimited one’s range leaves the track out', () => {
    const selection = select({
      playlists: [
        playlist('limited', ['shared', 'a'], { limit: 1 }),
        playlist('ranged', ['shared'], { bpmMax: 90 }),
      ],
      trackData: bpms({ shared: 120, a: 120 }),
    })
    expect(statuses(selection, 'limited')).toEqual({ shared: 'picked', a: 'notPicked' })
    expect(statuses(selection, 'ranged')).toEqual({ shared: 'outsideRange' })
  })

  it('excludes a marked track in every playlist that has it', () => {
    const selection = select({
      playlists: [
        playlist('first', ['shared']),
        playlist('second', ['shared', 'b'], { limit: 1 }),
        playlist('third', ['shared'], { bpmMax: 90 }),
      ],
      trackData: bpms({ shared: 120, b: 100 }),
      marks: marks({ shared: 'exclude' }),
      ruleTrackIds: ['shared'],
    })
    expect(statuses(selection, 'first')).toEqual({ shared: 'excluded' })
    expect(statuses(selection, 'second')).toEqual({ shared: 'excluded', b: 'in' })
    expect(statuses(selection, 'third')).toEqual({ shared: 'excluded' })
    expect(selection.statusByTrack.get('shared')).toEqual({ inSet: false, reason: 'excluded' })
    expect(selection.inSet).toEqual(['b'])
    expect(selection.pool).toBe(2)
    expect(selection.playlists.map((p) => p.counts.byReason.excluded)).toEqual([1, 1, 1])
  })

  it('takes a must-include track through a playlist without a limit, sparing the limited one', () => {
    const pick = vi.fn(firstFew)
    const selection = select({
      playlists: [
        playlist('limited', ['must', 'a', 'b'], { limit: 1 }),
        playlist('whole', ['must'], { bpmMax: 90 }),
      ],
      trackData: bpms({ must: 120, a: 100, b: 100 }),
      marks: marks({ must: 'mustInclude' }),
      pick,
    })
    expect(statuses(selection, 'limited')).toEqual({
      must: 'duplicate of whole',
      a: 'picked',
      b: 'notPicked',
    })
    expect(statuses(selection, 'whole')).toEqual({ must: 'mustInclude' })
    expect(pick.mock.calls[0]?.[0].count).toBe(1)
    expect(selection.playlists[0]?.limitFilled).toBe(false)
    expect(selection.playlists[0]?.counts.byReason.mustInclude).toBe(0)
    expect(selection.inSet).toEqual(['a', 'must'])
  })

  it('counts a must-include track toward the first limit when every playlist has one', () => {
    const pick = vi.fn(firstFew)
    const selection = select({
      playlists: [
        playlist('one', ['must', 'a', 'b'], { limit: 1 }),
        playlist('two', ['must', 'c', 'd'], { limit: 1 }),
      ],
      trackData: known('must', 'a', 'b', 'c', 'd'),
      ruleTrackIds: ['must'],
      pick,
    })
    expect(statuses(selection, 'one')).toEqual({
      must: 'mustInclude',
      a: 'notPicked',
      b: 'notPicked',
    })
    expect(statuses(selection, 'two')).toEqual({
      must: 'duplicate of one',
      c: 'picked',
      d: 'notPicked',
    })
    expect(selection.playlists.map((p) => p.limitFilled)).toEqual([true, false])
    expect(pick).toHaveBeenCalledTimes(1)
    expect(pick.mock.calls[0]?.[0]).toMatchObject({ playlistId: 'two', count: 1 })
  })

  it('says "needs key/BPM" in every playlist for a track without data', () => {
    const selection = select({
      playlists: [
        playlist('first', ['noData', 'a']),
        playlist('second', ['noData'], { limit: 1, bpmMax: 90 }),
      ],
      trackData: bpms({ noData: null, a: 100 }),
    })
    expect(statuses(selection, 'first')).toEqual({ noData: 'needsData', a: 'in' })
    expect(statuses(selection, 'second')).toEqual({ noData: 'needsData' })
    expect(selection.statusByTrack.get('noData')).toEqual({ inSet: false, reason: 'needsData' })
    expect(selection.inSet).toEqual(['a'])
    expect(selection.pool).toBe(2)
  })

  it('gives each playlist its own reason when none lets the track in', () => {
    const selection = select({
      playlists: [
        playlist('slowOnly', ['fast'], { bpmMax: 90 }),
        playlist('midOnly', ['fast'], { bpmMin: 95, bpmMax: 110, limit: 1 }),
      ],
      trackData: bpms({ fast: 140 }),
    })
    expect(statuses(selection, 'slowOnly')).toEqual({ fast: 'outsideRange' })
    expect(statuses(selection, 'midOnly')).toEqual({ fast: 'outsideRange' })
    expect(selection.statusByTrack.get('fast')).toEqual({ inSet: false, reason: 'outsideRange' })
    expect(selection.inSet).toEqual([])
    expect(selection.pool).toBe(1)
  })

  it('reports a must-include track without data as a blocker once, where it is decided', () => {
    const selection = select({
      playlists: [playlist('limited', ['must'], { limit: 3 }), playlist('whole', ['must', 'a'])],
      trackData: bpms({ must: null, a: 100 }),
      marks: marks({ must: 'mustInclude' }),
    })
    expect(statuses(selection, 'limited')).toEqual({ must: 'duplicate of whole' })
    expect(statuses(selection, 'whole')).toEqual({ must: 'mustInclude', a: 'in' })
    expect(selection.blockers).toEqual(['must'])
    expect(selection.inSet).toEqual(['must', 'a'])
  })
})

describe('selectTracks: limits and picks (§8.4)', () => {
  it('leaves out the tracks that are not picked', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'c'], { limit: 1 })],
      trackData: known('a', 'b', 'c'),
    })
    expect(statuses(selection, 'p')).toEqual({ a: 'picked', b: 'notPicked', c: 'notPicked' })
    expect(selection.inSet).toEqual(['a'])
  })

  it('counts must-include tracks toward the limit and picks the rest', () => {
    const pick = vi.fn(firstFew)
    const selection = select({
      playlists: [
        playlist('p', ['a', 'b', 'must', 'c', 'd'], { limit: 3, pick: 'bestFit', seed: 9 }),
      ],
      trackData: known('a', 'b', 'must', 'c', 'd'),
      marks: marks({ must: 'mustInclude' }),
      pick,
    })
    expect(statuses(selection, 'p')).toEqual({
      a: 'picked',
      b: 'picked',
      must: 'mustInclude',
      c: 'notPicked',
      d: 'notPicked',
    })
    expect(pick).toHaveBeenCalledTimes(1)
    const request = pick.mock.calls[0]?.[0]
    expect(request).toMatchObject({ playlistId: 'p', method: 'bestFit', seed: 9, count: 2 })
    expect(request?.candidates.map((t) => t.trackId)).toEqual(['a', 'b', 'c', 'd'])
    expect(request?.inSet).toEqual([{ trackId: 'must', camelot: '8A', bpm: 100 }])
    expect(selection.playlists[0]?.limitFilled).toBe(false)
  })

  it('counts a track named in a mix rule toward the limit', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'c'], { limit: 2 })],
      trackData: known('a', 'b', 'c'),
      ruleTrackIds: ['c'],
    })
    expect(statuses(selection, 'p')).toEqual({ a: 'picked', b: 'notPicked', c: 'mustInclude' })
  })

  it('keeps every must-include track and picks nothing when they reach the limit', () => {
    const pick = vi.fn(firstFew)
    const ids = ['m1', 'm2', 'm3', 'm4', 'a']
    const all = marks({
      m1: 'mustInclude',
      m2: 'mustInclude',
      m3: 'mustInclude',
      m4: 'mustInclude',
    })
    const over = select({
      playlists: [playlist('p', ids, { limit: 3 })],
      trackData: known(...ids),
      marks: all,
      pick,
    })
    expect(over.inSet).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(statuses(over, 'p')).toMatchObject({ a: 'notPicked' })
    expect(over.playlists[0]?.limitFilled).toBe(true)
    expect(over.playlists[0]?.counts.byReason.mustInclude).toBe(4)

    const exact = select({
      playlists: [playlist('p', ids, { limit: 4 })],
      trackData: known(...ids),
      marks: all,
      pick,
    })
    expect(exact.inSet).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(exact.playlists[0]?.limitFilled).toBe(true)
    expect(pick).not.toHaveBeenCalled()
  })

  it('takes every available track when there are no more than the limit', () => {
    const pick = vi.fn(firstFew)
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'fast', 'out'], { limit: 3, bpmMax: 110 })],
      trackData: bpms({ a: 100, b: 100, fast: 140, out: 100 }),
      marks: marks({ out: 'exclude' }),
      pick,
    })
    expect(statuses(selection, 'p')).toEqual({
      a: 'in',
      b: 'in',
      fast: 'outsideRange',
      out: 'excluded',
    })
    expect(pick).not.toHaveBeenCalled()
    expect(selection.playlists[0]?.limitFilled).toBe(false)
  })

  it('only offers the tracks it decides as candidates', () => {
    const pick = vi.fn(firstFew)
    select({
      playlists: [
        playlist('first', ['shared']),
        playlist('p', ['shared', 'out', 'must', 'noData', 'fast', 'a', 'b', 'c'], {
          limit: 2,
          bpmMax: 110,
        }),
      ],
      trackData: bpms({
        shared: 100,
        out: 100,
        must: 100,
        noData: null,
        fast: 140,
        a: 100,
        b: 100,
        c: 100,
      }),
      marks: marks({ out: 'exclude', must: 'mustInclude' }),
      pick,
    })
    const request = pick.mock.calls[0]?.[0]
    expect(request?.candidates.map((t) => t.trackId)).toEqual(['a', 'b', 'c'])
    expect(request?.count).toBe(1)
  })

  it('picks in the order the playlists were added, each seeing the set so far', () => {
    const requests: PickRequest[] = []
    const lastFew: PickFn = (request) => {
      requests.push(request)
      return request.candidates.slice(-request.count).map((t) => t.trackId)
    }
    const selection = select({
      playlists: [
        playlist('odd', ['o1', 'o2', 'o3'], { limit: 1 }),
        playlist('whole', ['w1', 'w2']),
        playlist('more', ['m1', 'm2', 'm3', 'locked'], { limit: 2 }),
      ],
      trackData: known('o1', 'o2', 'o3', 'w1', 'w2', 'm1', 'm2', 'm3', 'locked'),
      marks: marks({ locked: 'mustInclude' }),
      pick: lastFew,
    })
    const seen = requests.map((r) => ({
      playlistId: r.playlistId,
      inSet: r.inSet.map((t) => t.trackId),
    }))
    // The first pick already sees the tracks that are in the set anyway (A10): the whole
    // playlist added later, and the must-include track of the limited one.
    expect(seen).toEqual([
      { playlistId: 'odd', inSet: ['w1', 'w2', 'locked'] },
      { playlistId: 'more', inSet: ['o3', 'w1', 'w2', 'locked'] },
    ])
    expect(selection.inSet).toEqual(['o3', 'w1', 'w2', 'm3', 'locked'])
  })

  it('shows a pick the tracks of a later limited playlist that are in anyway', () => {
    const pick = vi.fn(firstFew)
    select({
      playlists: [
        playlist('odd', ['o1', 'o2'], { limit: 1 }),
        playlist('roomy', ['r1', 'r2'], { limit: 5 }),
        playlist('full', ['f1', 'f2', 'locked'], { limit: 1 }),
      ],
      trackData: known('o1', 'o2', 'r1', 'r2', 'f1', 'f2', 'locked'),
      marks: marks({ locked: 'mustInclude' }),
      pick,
    })
    expect(pick).toHaveBeenCalledTimes(1)
    expect(pick.mock.calls[0]?.[0].inSet.map((t) => t.trackId)).toEqual(['r1', 'r2', 'locked'])
  })

  it('leaves a must-include track without key or BPM out of what a pick sees', () => {
    const pick = vi.fn(firstFew)
    select({
      playlists: [playlist('p', ['blocker', 'fixed', 'a', 'b'], { limit: 3 })],
      trackData: bpms({ blocker: null, fixed: 100, a: 100, b: 100 }),
      marks: marks({ blocker: 'mustInclude', fixed: 'mustInclude' }),
      pick,
    })
    expect(pick.mock.calls[0]?.[0].inSet.map((t) => t.trackId)).toEqual(['fixed'])
  })

  it('never lets a pick method exceed the limit or bring in other tracks', () => {
    const greedy: PickFn = () => ['excluded', 'b', 'b', 'elsewhere', 'a', 'c']
    const selection = select({
      playlists: [playlist('p', ['a', 'b', 'c', 'excluded'], { limit: 2 })],
      trackData: known('a', 'b', 'c', 'excluded'),
      marks: marks({ excluded: 'exclude' }),
      pick: greedy,
    })
    expect(statuses(selection, 'p')).toEqual({
      a: 'picked',
      b: 'picked',
      c: 'notPicked',
      excluded: 'excluded',
    })
  })

  it('contributes only must-include tracks with a limit of 0', () => {
    const selection = select({
      playlists: [playlist('p', ['a', 'must'], { limit: 0 })],
      trackData: known('a', 'must'),
      marks: marks({ must: 'mustInclude' }),
    })
    expect(selection.inSet).toEqual(['must'])
  })
})

describe('selectTracks: counts', () => {
  it('counts each playlist’s tracks in the set and left out per reason (§8.3)', () => {
    const selection = select({
      playlists: [
        playlist('first', ['shared', 'x']),
        playlist('p', ['shared', 'must', 'out', 'noData', 'fast', 'a', 'b', 'c', 'c'], {
          limit: 2,
          bpmMax: 110,
        }),
      ],
      trackData: bpms({
        shared: 100,
        x: 100,
        must: 100,
        out: 100,
        noData: null,
        fast: 140,
        a: 100,
        b: 100,
        c: 100,
      }),
      marks: marks({ out: 'exclude', must: 'mustInclude' }),
    })
    expect(selection.playlists[1]?.counts).toEqual({
      tracks: 8,
      inSet: 2,
      byReason: {
        in: 0,
        mustInclude: 1,
        picked: 1,
        excluded: 1,
        outsideRange: 1,
        notPicked: 2,
        needsData: 1,
        duplicate: 1,
      },
    })
    expect(selection.playlists[0]?.counts).toMatchObject({ tracks: 2, inSet: 2 })
    expect(selection.pool).toBe(9)
    expect(selection.inSet).toEqual(['shared', 'x', 'must', 'a'])
  })

  it('handles a set without playlists', () => {
    expect(select({ playlists: [], trackData: new Map() })).toEqual({
      playlists: [],
      statusByTrack: new Map(),
      inSet: [],
      blockers: [],
      pool: 0,
    })
  })
})

describe('statusLabel', () => {
  const name = (playlistId: string) => (playlistId === 'wcs' ? 'WCS favourites' : playlistId)
  const label = (status: Parameters<typeof statusLabel>[0], over: Partial<TrackChoices> = {}) =>
    statusLabel(status, choices(over), name)

  it('says the status and the reason in words (§8.3)', () => {
    expect(label({ inSet: true, reason: 'in' })).toBe('in the set')
    expect(label({ inSet: true, reason: 'mustInclude' })).toBe('in the set · must include')
    expect(label({ inSet: true, reason: 'picked' })).toBe('in the set · picked')
    expect(label({ inSet: false, reason: 'excluded' })).toBe('left out · excluded')
    expect(label({ inSet: false, reason: 'notPicked' })).toBe('left out · not picked')
    expect(label({ inSet: false, reason: 'needsData' })).toBe('left out · needs key/BPM')
    expect(label({ inSet: false, reason: 'duplicate', ownerPlaylistId: 'wcs' })).toBe(
      'already in WCS favourites',
    )
  })

  it('names the range a track fell outside', () => {
    const outside = { inSet: false, reason: 'outsideRange' } as const
    expect(label(outside, { bpmMin: 85, bpmMax: 110 })).toBe('left out · outside 85–110 BPM')
    expect(label(outside, { bpmMin: 85 })).toBe('left out · below 85 BPM')
    expect(label(outside, { bpmMax: 110.5 })).toBe('left out · above 110.5 BPM')
  })
})
