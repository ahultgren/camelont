import { describe, expect, it } from 'vitest'
import { settledState, summariseChange, type SettledState } from './change-summary'
import { selectTracks, type SelectPlaylist, type TrackData } from './select'
import type { TrackChoices } from './types'

const state = (over: Partial<SettledState> = {}): SettledState => ({
  inSet: [],
  picks: new Map(),
  mix: null,
  ...over,
})

describe('summariseChange (W4)', () => {
  it('reports no change between two equal states', () => {
    const before = state({ inSet: ['a', 'b'], mix: { order: ['b', 'a'], cost: 12.5 } })
    const after = state({ inSet: ['a', 'b'], mix: { order: ['b', 'a'], cost: 12.5 } })
    expect(summariseChange(before, after)).toEqual({
      joined: [],
      left: [],
      picks: [],
      tracks: { before: 2, after: 2 },
      cost: { before: 12.5, after: 12.5 },
      reordered: false,
      changed: false,
    })
  })

  it('lists the tracks that joined and left, each in its own set order', () => {
    const summary = summariseChange(
      state({ inSet: ['a', 'b', 'c', 'd'] }),
      state({ inSet: ['f', 'a', 'e', 'd'] }),
    )
    expect(summary).toMatchObject({
      joined: ['f', 'e'],
      left: ['b', 'c'],
      tracks: { before: 4, after: 4 },
      changed: true,
    })
  })

  it('gives the cost of the shown mix before and after', () => {
    const summary = summariseChange(
      state({ inSet: ['a', 'b'], mix: { order: ['a', 'b'], cost: 34.3 } }),
      state({ inSet: ['a', 'b'], mix: { order: ['b', 'a'], cost: 32.5 } }),
    )
    expect(summary.cost).toEqual({ before: 34.3, after: 32.5 })
    expect(summary).toMatchObject({ reordered: true, changed: true, joined: [], left: [] })
  })

  it('has no cost on the side where a problem was shown instead of a mix', () => {
    const mixed = state({ inSet: ['a'], mix: { order: ['a'], cost: 0 } })
    const blocked = state({ inSet: ['a'] })
    expect(summariseChange(mixed, blocked)).toMatchObject({
      cost: { before: 0, after: null },
      reordered: false,
      changed: true,
    })
    expect(summariseChange(blocked, mixed)).toMatchObject({
      cost: { before: null, after: 0 },
      changed: true,
    })
    expect(summariseChange(blocked, blocked).changed).toBe(false)
  })

  it('names the picks that went out and came in, per playlist', () => {
    // The prototype's example: narrowing a range moves a pick of another playlist.
    const summary = summariseChange(
      state({
        inSet: ['shotgun', 'loveIs', 'priceTag', 'weAreYoung'],
        picks: new Map([['odd', ['priceTag', 'weAreYoung']]]),
      }),
      state({
        inSet: ['loveIs', 'weAreYoung', 'blankSpace'],
        picks: new Map([['odd', ['weAreYoung', 'blankSpace']]]),
      }),
    )
    expect(summary.left).toEqual(['shotgun', 'priceTag'])
    expect(summary.joined).toEqual(['blankSpace'])
    expect(summary.picks).toEqual([{ playlistId: 'odd', out: ['priceTag'], in: ['blankSpace'] }])
  })

  it('does not call a locked pick a pick that went out', () => {
    // Locking makes it must-include: it stays in the set, and the playlist picks one fewer.
    const summary = summariseChange(
      state({ inSet: ['a', 'b'], picks: new Map([['odd', ['a', 'b']]]) }),
      state({ inSet: ['a', 'b'], picks: new Map([['odd', ['b']]]) }),
    )
    expect(summary).toMatchObject({ picks: [], changed: false })
  })

  it('does not call tracks picks when a limit arrives or goes', () => {
    const unlimited = state({ inSet: ['a', 'b', 'c'] })
    const limited = state({ inSet: ['a', 'b'], picks: new Map([['p', ['a', 'b']]]) })
    expect(summariseChange(unlimited, limited)).toMatchObject({ left: ['c'], picks: [] })
    expect(summariseChange(limited, unlimited)).toMatchObject({ joined: ['c'], picks: [] })
  })

  it('reports a rejected pick and its replacement', () => {
    const summary = summariseChange(
      state({ inSet: ['a', 'b'], picks: new Map([['p', ['a', 'b']]]) }),
      state({ inSet: ['b', 'c'], picks: new Map([['p', ['b', 'c']]]) }),
    )
    expect(summary.picks).toEqual([{ playlistId: 'p', out: ['a'], in: ['c'] }])
  })

  it('lists playlists in the order of the new state, then ones that are gone', () => {
    const summary = summariseChange(
      state({
        inSet: ['a', 'b'],
        picks: new Map([
          ['gone', ['a']],
          ['kept', ['b']],
        ]),
      }),
      state({ inSet: ['c'], picks: new Map([['kept', ['c']]]) }),
    )
    expect(summary.picks).toEqual([
      { playlistId: 'kept', out: ['b'], in: ['c'] },
      { playlistId: 'gone', out: ['a'], in: [] },
    ])
  })
})

describe('settledState', () => {
  const choices = (over: Partial<TrackChoices> = {}): TrackChoices => ({
    bpmMin: null,
    bpmMax: null,
    limit: null,
    pick: 'random',
    seed: 1,
    ...over,
  })
  const playlist = (playlistId: string, ids: string[], over = {}): SelectPlaylist => ({
    playlistId,
    tracks: ids.map((trackId) => ({ trackId })),
    choices: choices(over),
  })
  const data = new Map<string, TrackData>(
    ['a', 'b', 'c', 'd', 'e'].map((id) => [id, { camelot: '8A', bpm: 100 }]),
  )

  it('takes the tracks in the set and each playlist’s picks from a selection', () => {
    const selection = selectTracks({
      playlists: [playlist('all', ['a', 'b']), playlist('some', ['c', 'd', 'e'], { limit: 2 })],
      marks: { e: 'mustInclude' },
      ruleTrackIds: [],
      trackData: data,
      pick: ({ candidates, count }) => candidates.slice(0, count).map((track) => track.trackId),
    })
    expect(settledState(selection, { order: ['c', 'a', 'b', 'e'], cost: 3 })).toEqual({
      inSet: ['a', 'b', 'c', 'e'],
      picks: new Map([['some', ['c']]]),
      mix: { order: ['c', 'a', 'b', 'e'], cost: 3 },
    })
  })

  it('is empty before anything was selected', () => {
    expect(settledState(null, null)).toEqual({ inSet: [], picks: new Map(), mix: null })
  })
})
