import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@/shared/storage'
import { addPlaylist, newSet } from '../domain/set'
import type { MixSet } from '../domain/types'
import { createSetsRepo } from './repository'

const fullSet = (id: string, name = 'Friday social'): MixSet => ({
  ...addPlaylist(
    newSet({ id, name, now: 100 }),
    {
      playlistId: 'p1',
      name: 'WCS favourites',
      imageUrl: 'https://i.scdn.co/image/x',
      tracks: ['t1', 't2', 't3'].map((trackId) => ({
        trackId,
        uri: `spotify:track:${trackId}`,
        title: trackId.toUpperCase(),
        artists: ['Artist', 'Guest'],
        durationMs: 200_000,
        imageUrl: null,
      })),
      snapshotId: 'snap-1',
      readAt: 90,
    },
    42,
  ),
  marks: { t1: 'mustInclude', t3: 'exclude' },
  mix: { opener: 't1', closer: null, follows: [['t1', 't2']], arc: 'twoWaves' },
  chosenMix: { order: ['t1', 't2'] },
  lastSave: {
    url: 'https://open.spotify.com/playlist/abc',
    savedAt: 150,
    name: 'Friday social',
    order: ['t1', 't2'],
  },
})

const stored = (set: unknown) => ({ v: 1, data: set })

describe('sets repository', () => {
  it('reads back a set exactly as it was stored', async () => {
    const repo = createSetsRepo(createMemoryStore())
    const set = fullSet('s1')
    const limited: MixSet = {
      ...set,
      playlists: set.playlists.map((p) => ({
        ...p,
        choices: { bpmMin: 85, bpmMax: null, limit: 2, pick: 'bestFit', seed: 7 },
      })),
    }
    await repo.put(set)
    await repo.put({ ...limited, id: 's2' })
    const { sets, unreadable } = await repo.all()
    expect(unreadable).toEqual([])
    expect(sets.find((s) => s.id === 's1')).toEqual(set)
    expect(sets.find((s) => s.id === 's2')).toEqual({ ...limited, id: 's2' })
  })

  it('stores records as { v: 1, data } under the set’s ID', async () => {
    const store = createMemoryStore()
    await createSetsRepo(store).put(fullSet('s1'))
    expect(await store.get('s1')).toEqual(stored(fullSet('s1')))
  })

  it('replaces a set that is stored again and removes one that is deleted', async () => {
    const repo = createSetsRepo(createMemoryStore())
    await repo.put(fullSet('s1'))
    await repo.put({ ...fullSet('s1'), name: 'Renamed' })
    await repo.put(fullSet('s2'))
    expect((await repo.all()).sets.map((s) => s.name).sort()).toEqual(['Friday social', 'Renamed'])
    await repo.remove('s1')
    expect((await repo.all()).sets.map((s) => s.id)).toEqual(['s2'])
  })

  it('reports a stored set that fails validation, with its ID, and reads the others (§6)', async () => {
    const broken = fullSet('broken', 'Half a set')
    const store = createMemoryStore({
      good: stored(fullSet('good')),
      broken: stored({
        ...broken,
        playlists: [{ ...broken.playlists[0], choices: { limit: 'two' } }],
      }),
    })
    const { sets, unreadable } = await createSetsRepo(store).all()
    expect(sets.map((s) => s.id)).toEqual(['good'])
    expect(unreadable).toHaveLength(1)
    expect(unreadable[0]).toMatchObject({ id: 'broken', name: 'Half a set' })
    expect(unreadable[0]?.problem).toContain('playlists.0.choices')
  })

  it('reports every kind of record it can’t read', async () => {
    const store = createMemoryStore({
      future: { v: 2, data: { ...fullSet('future'), extra: true } },
      junk: 'not a record',
      empty: stored({}),
      elsewhere: stored(fullSet('another-id')),
      badMark: stored({ ...fullSet('badMark'), marks: { t1: 'maybe' } }),
    })
    const { sets, unreadable } = await createSetsRepo(store).all()
    expect(sets).toEqual([])
    const byId = Object.fromEntries(unreadable.map((u) => [u.id, u]))
    expect(Object.keys(byId).sort()).toEqual(['badMark', 'elsewhere', 'empty', 'future', 'junk'])
    expect(byId.future).toMatchObject({ name: 'Friday social' })
    expect(byId.future?.problem).toContain('version 2')
    expect(byId.junk).toMatchObject({ name: null })
    expect(byId.empty).toMatchObject({ name: null })
    expect(byId.elsewhere?.problem).toContain('another-id')
    expect(byId.badMark?.problem).toContain('marks.t1')
  })

  it('never drops or rewrites what it can’t read', async () => {
    const initial = { junk: 'not a record', future: { v: 2, data: { id: 'future' } } }
    const store = createMemoryStore(initial)
    const repo = createSetsRepo(store)
    await repo.all()
    await repo.put(fullSet('s1'))
    expect(await store.get('junk')).toBe('not a record')
    expect(await store.get('future')).toEqual(initial.future)
    expect((await repo.all()).unreadable.map((u) => u.id).sort()).toEqual(['future', 'junk'])
  })

  it('removes an unreadable set only when asked to', async () => {
    const store = createMemoryStore({ junk: 'not a record' })
    const repo = createSetsRepo(store)
    await repo.remove('junk')
    expect(await repo.all()).toEqual({ sets: [], unreadable: [] })
  })

  it('refuses to store a set it could not read back', async () => {
    const store = createMemoryStore({ s1: stored(fullSet('s1')) })
    const repo = createSetsRepo(store)
    const invalid = { ...fullSet('s1'), marks: { t1: 'maybe' } } as unknown as MixSet
    await expect(repo.put(invalid)).rejects.toThrow()
    expect(await store.get('s1')).toEqual(stored(fullSet('s1')))
  })
})
