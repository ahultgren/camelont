import { describe, expect, it } from 'vitest'
import { randomPick, randomRank } from './random-pick'
import { selectTracks, type SelectPlaylist, type TrackData } from './select'

const pool = (count: number, prefix = 'track') =>
  Array.from({ length: count }, (_, i) => ({ trackId: `${prefix}-${i}` }))

const pick = (seed: number, count: number, candidates: { trackId: string }[]) =>
  randomPick({ seed, count, candidates })

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 1)

describe('randomRank', () => {
  it('is the same for the same seed and track, in [0, 1)', () => {
    for (const seed of SEEDS) {
      const rank = randomRank(seed, 'track-1')
      expect(rank).toBe(randomRank(seed, 'track-1'))
      expect(rank).toBeGreaterThanOrEqual(0)
      expect(rank).toBeLessThan(1)
    }
  })
})

describe('randomPick', () => {
  it('picks the asked number of candidates', () => {
    const picked = pick(1, 5, pool(40))
    expect(picked).toHaveLength(5)
    expect(new Set(picked).size).toBe(5)
    expect(pool(40).map((t) => t.trackId)).toEqual(expect.arrayContaining(picked))
  })

  it('gives the same picks for the same seed, whatever order the candidates come in', () => {
    const candidates = pool(40)
    expect(pick(3, 5, candidates)).toEqual(pick(3, 5, candidates))
    expect(pick(3, 5, [...candidates].reverse())).toEqual(pick(3, 5, candidates))
  })

  it('draws again with a new seed (reshuffle)', () => {
    const draws = new Set(SEEDS.map((seed) => pick(seed, 5, pool(40)).join()))
    expect(draws.size).toBe(SEEDS.length)
  })

  it('takes everything when asked for more than there is, and nothing when asked for none', () => {
    expect(pick(1, 9, pool(3)).sort()).toEqual(['track-0', 'track-1', 'track-2'])
    expect(pick(1, 0, pool(3))).toEqual([])
    expect(pick(1, 2, [])).toEqual([])
  })

  it('gives every candidate about the same chance', () => {
    const seeds = Array.from({ length: 2000 }, (_, i) => i + 1)
    const wins = new Map<string, number>()
    for (const seed of seeds) {
      for (const id of pick(seed, 3, pool(10))) wins.set(id, (wins.get(id) ?? 0) + 1)
    }
    // Expected 600 each; five standard deviations is about 100.
    for (const { trackId } of pool(10)) {
      expect(wins.get(trackId)).toBeGreaterThan(500)
      expect(wins.get(trackId)).toBeLessThan(700)
    }
  })

  describe('a change in the candidates moves only the picks it has to (§8.4)', () => {
    it('keeps the picks when a candidate that was not picked leaves', () => {
      for (const seed of SEEDS) {
        const before = pick(seed, 5, pool(40))
        const leaving = pool(40).find((t) => !before.includes(t.trackId))?.trackId
        const after = pick(
          seed,
          5,
          pool(40).filter((t) => t.trackId !== leaving),
        )
        expect(after).toEqual(before)
      }
    })

    it('replaces only the pick that left', () => {
      for (const seed of SEEDS) {
        const before = pick(seed, 5, pool(40))
        for (const gone of before) {
          const after = pick(
            seed,
            5,
            pool(40).filter((t) => t.trackId !== gone),
          )
          const kept = before.filter((id) => id !== gone)
          expect(after.filter((id) => before.includes(id))).toEqual(kept)
          expect(after.filter((id) => !before.includes(id))).toHaveLength(1)
        }
      }
    })

    it('swaps at most one pick when a candidate joins', () => {
      let swaps = 0
      for (const seed of SEEDS) {
        const before = pick(seed, 5, pool(40))
        const after = pick(seed, 5, [...pool(40), { trackId: 'newcomer' }])
        const came = after.filter((id) => !before.includes(id))
        expect(came.length).toBeLessThanOrEqual(1)
        if (came.length === 1) {
          swaps++
          expect(came).toEqual(['newcomer'])
          expect(before.filter((id) => after.includes(id))).toHaveLength(4)
        } else expect(after).toEqual(before)
      }
      // 5 places among 41 candidates: the newcomer should win one now and then, not always.
      expect(swaps).toBeGreaterThan(0)
      expect(swaps).toBeLessThan(SEEDS.length / 2)
    })

    it('keeps earlier picks when the limit grows', () => {
      for (const seed of SEEDS) {
        expect(pick(seed, 6, pool(40)).slice(0, 5)).toEqual(pick(seed, 5, pool(40)))
      }
    })
  })
})

describe('randomPick as a set’s pick method', () => {
  const ids = (prefix: string, count: number) => pool(count, prefix).map((t) => t.trackId)
  const playlist = (
    playlistId: string,
    trackIds: string[],
    limit: number | null,
    bpmMax: number | null = null,
  ): SelectPlaylist => ({
    playlistId,
    tracks: trackIds.map((trackId) => ({ trackId })),
    choices: { bpmMin: null, bpmMax, limit, pick: 'random', seed: 11 },
  })
  const trackData = new Map<string, TrackData>(
    [...ids('whole', 20), ...ids('odd', 30)].map((id) => [id, { camelot: '8A', bpm: 100 }]),
  )
  const picks = (playlists: SelectPlaylist[]) =>
    selectTracks({ playlists, marks: {}, ruleTrackIds: [], trackData, pick: randomPick })
      .playlists.flatMap((p) => p.tracks)
      .filter((row) => row.status.reason === 'picked')
      .map((row) => row.trackId)

  it('keeps a playlist’s picks when another playlist’s choices change', () => {
    const before = picks([
      playlist('whole', ids('whole', 20), null),
      playlist('odd', ids('odd', 30), 2),
    ])
    expect(before).toHaveLength(2)
    const after = picks([
      playlist('whole', ids('whole', 20), 5, 90),
      playlist('odd', ids('odd', 30), 2),
    ])
    expect(after).toEqual(before)
  })
})
