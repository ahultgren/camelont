import { describe, expect, it, vi } from 'vitest'
import { randomPick } from './random-pick'
import type { PickRequest, SelectPlaylist, TrackData } from './select'
import { selectForSet } from './select-set'
import type { TrackChoices } from './types'

const playlist = (
  playlistId: string,
  trackIds: string[],
  over: Partial<TrackChoices> = {},
): SelectPlaylist => ({
  playlistId,
  tracks: trackIds.map((trackId) => ({ trackId })),
  choices: { bpmMin: null, bpmMax: null, limit: null, pick: 'random', seed: 7, ...over },
})

const known = (...trackIds: string[]): Map<string, TrackData> =>
  new Map(trackIds.map((id) => [id, { camelot: '8A', bpm: 100 }]))

const input = (playlists: SelectPlaylist[], trackIds: string[]) => ({
  playlists,
  marks: {},
  ruleTrackIds: [],
  trackData: known(...trackIds),
})

const noAnswers = () => undefined

describe('selectForSet', () => {
  it('needs no answers for a set without best-fit picks', () => {
    const bestFit = vi.fn(noAnswers)
    const { selection, missing } = selectForSet(
      input([playlist('a', ['t1', 't2'])], ['t1', 't2']),
      bestFit,
    )
    expect(missing).toBeNull()
    expect(selection.inSet).toEqual(['t1', 't2'])
    expect(bestFit).not.toHaveBeenCalled()
  })

  it('makes random picks itself, with the playlist’s seed', () => {
    const tracks = ['t1', 't2', 't3', 't4', 't5']
    const { selection, missing } = selectForSet(
      input([playlist('a', tracks, { limit: 2 })], tracks),
      noAnswers,
    )
    const expected = randomPick({
      seed: 7,
      count: 2,
      candidates: tracks.map((trackId) => ({ trackId })),
    })
    expect(missing).toBeNull()
    expect([...selection.inSet].sort()).toEqual([...expected].sort())
  })

  it('uses a best-fit answer it is given', () => {
    const tracks = ['t1', 't2', 't3']
    const { selection, missing } = selectForSet(
      input([playlist('a', tracks, { limit: 1, pick: 'bestFit' })], tracks),
      () => ['t2'],
    )
    expect(missing).toBeNull()
    expect(selection.inSet).toEqual(['t2'])
  })

  it('reports the best-fit pick that has no answer yet, with what it was asked', () => {
    const { selection, missing } = selectForSet(
      input(
        [playlist('a', ['t1']), playlist('b', ['t2', 't3', 't4'], { limit: 2, pick: 'bestFit' })],
        ['t1', 't2', 't3', 't4'],
      ),
      noAnswers,
    )
    expect(missing).toMatchObject({ playlistId: 'b', method: 'bestFit', count: 2 })
    expect(missing?.candidates.map((track) => track.trackId)).toEqual(['t2', 't3', 't4'])
    expect(missing?.inSet.map((track) => track.trackId)).toEqual(['t1'])
    // The draft: every track that needs no pick has its final status.
    expect(selection.inSet).toEqual(['t1'])
  })

  it('stops asking after the first pick without an answer', () => {
    const asked: PickRequest[] = []
    const { missing } = selectForSet(
      input(
        [
          playlist('a', ['t1', 't2'], { limit: 1, pick: 'bestFit' }),
          playlist('b', ['t3', 't4'], { limit: 1, pick: 'bestFit' }),
        ],
        ['t1', 't2', 't3', 't4'],
      ),
      (request) => {
        asked.push(request)
        return undefined
      },
    )
    expect(asked.map((request) => request.playlistId)).toEqual(['a'])
    expect(missing?.playlistId).toBe('a')
  })

  it('asks the next playlist with the earlier answer in the set', () => {
    const asked: PickRequest[] = []
    const answers: Record<string, string[]> = { a: ['t2'] }
    const { missing } = selectForSet(
      input(
        [
          playlist('a', ['t1', 't2'], { limit: 1, pick: 'bestFit' }),
          playlist('b', ['t3', 't4'], { limit: 1, pick: 'bestFit' }),
        ],
        ['t1', 't2', 't3', 't4'],
      ),
      (request) => {
        asked.push(request)
        return answers[request.playlistId]
      },
    )
    expect(missing?.playlistId).toBe('b')
    expect(missing?.inSet.map((track) => track.trackId)).toEqual(['t2'])
    expect(asked).toHaveLength(2)
  })

  it('keeps blockers in the draft: they never wait for a pick', () => {
    const { selection, missing } = selectForSet(
      {
        playlists: [playlist('a', ['t1', 't2', 'nodata'], { limit: 1, pick: 'bestFit' })],
        marks: { nodata: 'mustInclude' },
        ruleTrackIds: [],
        trackData: known('t1', 't2'),
      },
      noAnswers,
    )
    expect(missing).toBeNull() // the must-include track fills the limit
    expect(selection.blockers).toEqual(['nodata'])
  })
})
