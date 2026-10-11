import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createMemoryStore, type KeyValueStore } from '@/shared/storage'
import type { PlaylistCopy } from '../domain/set'
import type { MixSet } from '../domain/types'
import { installSets } from './deps'
import { useSetsStore } from './sets-store'

const SAVE_DELAY_MS = 300

const copy = (playlistId: string, trackIds: string[] = ['t1', 't2']): PlaylistCopy => ({
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
  snapshotId: `snap-${playlistId}`,
  readAt: 500,
  skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
})

/** The app's sets store on a given storage, as after a page load. */
function open(storage: KeyValueStore = createMemoryStore(), idPrefix = 'set') {
  const clock = { now: 1000 }
  let ids = 0
  let seeds = 0
  const app = createApp({ render: () => null })
  app.use(createPinia())
  installSets(app, {
    store: storage,
    now: () => clock.now,
    newId: () => `${idPrefix}-${++ids}`,
    newSeed: () => ++seeds * 100,
    saveDelayMs: SAVE_DELAY_MS,
  })
  const sets = app.runWithContext(() => useSetsStore())
  return { sets, storage, clock }
}

/** What a fresh page load would read from the same storage. */
async function reopened(storage: KeyValueStore) {
  const { sets } = open(storage)
  await sets.ready
  return sets
}

const storedSet = async (storage: KeyValueStore, id: string) =>
  ((await storage.get(id)) as { data: MixSet } | undefined)?.data

/** Storage that counts writes and can be made slow or failing. */
function instrumented() {
  const inner = createMemoryStore()
  const state = { writes: 0, failing: false, gate: null as Promise<unknown> | null }
  const storage: KeyValueStore = {
    ...inner,
    async set(key, value) {
      state.writes++
      if (state.gate) await state.gate
      if (state.failing) throw new Error('The disk is full')
      await inner.set(key, value)
    },
  }
  return { storage, state }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sets store: listing', () => {
  it('starts empty and says when it has loaded', async () => {
    const { sets } = open()
    expect(sets.loaded).toBe(false)
    await sets.ready
    expect(sets.loaded).toBe(true)
    expect(sets.list).toEqual([])
    expect(sets.unreadable).toEqual([])
  })

  it('lists the stored sets, newest edit first', async () => {
    const { sets, storage, clock } = open()
    const first = sets.create({ name: 'First', playlists: [copy('a')] })
    clock.now = 2000
    const second = sets.create({ name: 'Second', playlists: [copy('a')] })
    clock.now = 3000
    sets.rename(first.id, 'First, edited')
    await sets.flush()
    expect(sets.list.map((s) => s.name)).toEqual(['First, edited', 'Second'])

    const later = await reopened(storage)
    expect(later.list.map((s) => s.name)).toEqual(['First, edited', 'Second'])
    expect(later.get(second.id)).toEqual(second)
  })

  it('reports a stored set it can’t read instead of dropping it', async () => {
    const storage = createMemoryStore({ broken: { v: 1, data: { id: 'broken', name: 'Old set' } } })
    const { sets } = open(storage)
    sets.create({ name: 'Good', playlists: [copy('a')] })
    await sets.ready
    expect(sets.list.map((s) => s.name)).toEqual(['Good'])
    expect(sets.unreadable).toHaveLength(1)
    expect(sets.unreadable[0]).toMatchObject({ id: 'broken', name: 'Old set' })
    await sets.flush()
    expect(await storage.get('broken')).toEqual({ v: 1, data: { id: 'broken', name: 'Old set' } })
  })

  it('says so when the stored sets can’t be loaded, and still works', async () => {
    const storage: KeyValueStore = {
      ...createMemoryStore(),
      entries: () => Promise.reject(new Error('IndexedDB is not available')),
    }
    const { sets } = open(storage)
    await sets.ready
    expect(sets.loaded).toBe(true)
    expect(sets.loadError).toBe('IndexedDB is not available')
    sets.create({ name: 'Anyway', playlists: [copy('a')] })
    expect(sets.list.map((s) => s.name)).toEqual(['Anyway'])
  })
})

describe('sets store: create, rename, duplicate, delete', () => {
  it('creates a set from a name and playlists, and stores it at once', async () => {
    const { sets, storage } = open()
    const set = sets.create({ name: ' Friday social ', playlists: [copy('a'), copy('b')] })
    expect(set).toMatchObject({
      id: 'set-1',
      name: 'Friday social',
      createdAt: 1000,
      editedAt: 1000,
    })
    expect(set.playlists.map((p) => p.playlistId)).toEqual(['a', 'b'])
    expect(set.playlists.map((p) => p.choices.seed)).toEqual([100, 200])
    expect(set.playlists[0]?.choices).toMatchObject({ bpmMin: null, bpmMax: null, limit: null })
    expect(sets.get(set.id)).toBe(set)
    await sets.flush()
    expect(await storedSet(storage, 'set-1')).toEqual(set)
  })

  it('renames a set and ignores a blank name', async () => {
    const { sets, storage, clock } = open()
    const set = sets.create({ name: 'Friday social', playlists: [copy('a')] })
    clock.now = 5000
    expect(sets.rename(set.id, '  Saturday social ')).toMatchObject({
      name: 'Saturday social',
      createdAt: 1000,
      editedAt: 5000,
    })
    expect(sets.rename(set.id, '   ')?.name).toBe('Saturday social')
    expect(sets.rename('nope', 'Name')).toBeNull()
    await sets.flush()
    expect((await storedSet(storage, set.id))?.name).toBe('Saturday social')
  })

  it('duplicates a set as an unsaved copy of its own', async () => {
    const { sets, storage, clock } = open()
    const original = sets.create({ name: 'Friday social', playlists: [copy('a')] })
    sets.update(original.id, (set) => ({
      ...set,
      marks: { t1: 'mustInclude' },
      lastSave: {
        playlistId: 'x',
        url: 'https://open.spotify.com/playlist/x',
        savedAt: 1,
        name: set.name,
        order: [],
      },
    }))
    clock.now = 7000
    const duplicate = sets.duplicate(original.id)
    expect(duplicate).toMatchObject({
      id: 'set-2',
      name: 'Friday social copy',
      createdAt: 7000,
      editedAt: 7000,
      marks: { t1: 'mustInclude' },
      lastSave: null,
    })
    expect(duplicate?.playlists).toEqual(sets.get(original.id)?.playlists)
    expect(sets.list.map((s) => s.id)).toEqual(['set-2', 'set-1'])
    expect(sets.duplicate('nope')).toBeNull()

    await sets.flush()
    expect((await reopened(storage)).list.map((s) => s.name)).toEqual([
      'Friday social copy',
      'Friday social',
    ])
  })

  it('deletes a set from the list and from storage', async () => {
    const { sets, storage } = open()
    const gone = sets.create({ name: 'Gone', playlists: [copy('a')] })
    const kept = sets.create({ name: 'Kept', playlists: [copy('a')] })
    await sets.remove(gone.id)
    expect(sets.list.map((s) => s.id)).toEqual([kept.id])
    expect(sets.get(gone.id)).toBeUndefined()
    expect((await reopened(storage)).list.map((s) => s.name)).toEqual(['Kept'])
  })

  it('does not bring a deleted set back with a change that was still waiting', async () => {
    const { sets, storage } = open()
    const set = sets.create({ name: 'Short-lived', playlists: [copy('a')] })
    sets.rename(set.id, 'Renamed')
    await sets.remove(set.id)
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2)
    await sets.flush()
    expect(await storage.entries()).toEqual([])
  })

  it('does not bring back a set that was deleted while the stored sets were loading', async () => {
    const earlier = open(createMemoryStore(), 'earlier')
    const old = earlier.sets.create({ name: 'Old', playlists: [copy('a')] })
    const staying = earlier.sets.create({ name: 'Staying', playlists: [copy('a')] })
    await earlier.sets.flush()

    const { sets, storage } = open(earlier.storage)
    const removing = sets.remove(old.id)
    const fresh = sets.create({ name: 'New', playlists: [copy('a')] })
    expect(sets.list.map((s) => s.id)).toEqual([fresh.id])
    await sets.ready
    await removing
    expect(sets.list.map((s) => s.id).sort()).toEqual([staying.id, fresh.id].sort())
    expect((await reopened(storage)).list.map((s) => s.name).sort()).toEqual(['New', 'Staying'])
  })

  it('deletes an unreadable set when asked to', async () => {
    const storage = createMemoryStore({ broken: 'junk' })
    const { sets } = open(storage)
    await sets.ready
    expect(sets.unreadable.map((u) => u.id)).toEqual(['broken'])
    await sets.remove('broken')
    expect(sets.unreadable).toEqual([])
    expect(await storage.entries()).toEqual([])
  })
})

describe('sets store: saved as the user works (§8.6)', () => {
  it('writes a change shortly after it was made, with no save step', async () => {
    const { sets, storage, clock } = open()
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    await sets.flush()
    clock.now = 4000
    const changed = sets.update(set.id, (s) => ({ ...s, marks: { t1: 'exclude' } }))
    expect(changed).toMatchObject({ marks: { t1: 'exclude' }, editedAt: 4000 })
    expect(sets.get(set.id)).toBe(changed)
    expect((await storedSet(storage, set.id))?.marks).toEqual({})

    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(await storedSet(storage, set.id)).toEqual(changed)
  })

  it('keeps every one of several quick edits, in few writes', async () => {
    const { storage, state } = instrumented()
    const { sets } = open(storage)
    const set = sets.create({ name: 'Set', playlists: [copy('a', ['t1', 't2', 't3'])] })
    await sets.flush()
    state.writes = 0

    sets.update(set.id, (s) => ({ ...s, marks: { ...s.marks, t1: 'mustInclude' } }))
    sets.update(set.id, (s) => ({ ...s, marks: { ...s.marks, t2: 'exclude' } }))
    sets.rename(set.id, 'Renamed')
    sets.update(set.id, (s) => ({ ...s, mix: { ...s.mix, opener: 't1', arc: 'twoWaves' } }))
    for (let bpmMax = 140; bpmMax >= 110; bpmMax--) {
      sets.update(set.id, (s) => ({
        ...s,
        playlists: s.playlists.map((p) => ({ ...p, choices: { ...p.choices, bpmMax } })),
      }))
    }
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)

    expect(state.writes).toBe(1)
    const later = await reopened(storage)
    expect(later.get(set.id)).toEqual(sets.get(set.id))
    expect(later.get(set.id)).toMatchObject({
      name: 'Renamed',
      marks: { t1: 'mustInclude', t2: 'exclude' },
      mix: { opener: 't1', arc: 'twoWaves' },
    })
    expect(later.get(set.id)?.playlists[0]?.choices.bpmMax).toBe(110)
  })

  it('writes an edit made while an earlier write was still running', async () => {
    const { storage, state } = instrumented()
    const { sets } = open(storage)
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    await sets.flush()

    let release: () => void = () => undefined
    state.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    sets.rename(set.id, 'First edit')
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS) // the write starts and hangs
    sets.rename(set.id, 'Second edit')
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    release()
    state.gate = null
    await sets.flush()

    expect((await storedSet(storage, set.id))?.name).toBe('Second edit')
  })

  it('writes the waiting changes of several sets together', async () => {
    const { sets, storage } = open()
    const a = sets.create({ name: 'A', playlists: [copy('a')] })
    const b = sets.create({ name: 'B', playlists: [copy('a')] })
    sets.rename(a.id, 'A2')
    sets.rename(b.id, 'B2')
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect((await reopened(storage)).list.map((s) => s.name).sort()).toEqual(['A2', 'B2'])
  })

  it('does nothing for a change that changes nothing', async () => {
    const { storage, state } = instrumented()
    const { sets, clock } = open(storage)
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    await sets.flush()
    state.writes = 0
    clock.now = 9000
    expect(sets.update(set.id, (s) => s)).toBe(set)
    expect(sets.rename(set.id, 'Set')).toBe(set)
    expect(sets.update('nope', (s) => ({ ...s, name: 'x' }))).toBeNull()
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(state.writes).toBe(0)
    expect(sets.get(set.id)?.editedAt).toBe(1000)
  })

  it('keeps a set’s identity and creation time whatever a change returns', () => {
    const { sets } = open()
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    const changed = sets.update(set.id, (s) => ({ ...s, id: 'other', createdAt: 1, name: 'New' }))
    expect(changed).toMatchObject({ id: set.id, createdAt: 1000, name: 'New' })
    expect(sets.list).toHaveLength(1)
  })

  it('writes what is waiting when the page is hidden or left', async () => {
    const { sets, storage } = open()
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    await sets.flush()

    sets.rename(set.id, 'Before leaving')
    expect(vi.getTimerCount()).toBe(1)
    window.dispatchEvent(new Event('pagehide'))
    expect(vi.getTimerCount()).toBe(0)
    await sets.flush()
    expect((await storedSet(storage, set.id))?.name).toBe('Before leaving')

    sets.rename(set.id, 'Before hiding')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.restoreAllMocks()
    expect(vi.getTimerCount()).toBe(0)
    await sets.flush()
    expect((await storedSet(storage, set.id))?.name).toBe('Before hiding')
  })

  it('reports a failed write and stores the set with the next change', async () => {
    const { storage, state } = instrumented()
    const { sets } = open(storage)
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    await sets.flush()
    expect(sets.saveError).toBeNull()

    state.failing = true
    sets.rename(set.id, 'Not stored yet')
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)
    expect(sets.saveError).toBe('The disk is full')
    expect((await storedSet(storage, set.id))?.name).toBe('Set')
    expect(sets.get(set.id)?.name).toBe('Not stored yet')

    state.failing = false
    const other = sets.create({ name: 'Other', playlists: [copy('a')] })
    await sets.flush()
    expect(sets.saveError).toBeNull()
    expect((await storedSet(storage, set.id))?.name).toBe('Not stored yet')
    expect((await storedSet(storage, other.id))?.name).toBe('Other')
  })
})

describe('sets store: playlists', () => {
  it('adds a playlist with a seed of its own, once', () => {
    const { sets } = open()
    const set = sets.create({ name: 'Set', playlists: [copy('a')] })
    const added = sets.addPlaylist(set.id, copy('b'))
    expect(added?.playlists.map((p) => [p.playlistId, p.choices.seed])).toEqual([
      ['a', 100],
      ['b', 200],
    ])
    expect(sets.addPlaylist(set.id, copy('b'))).toBe(added)
  })

  it('reshuffles one playlist’s random picks with a new seed', async () => {
    const { sets, storage } = open()
    const set = sets.create({ name: 'Set', playlists: [copy('a'), copy('b')] })
    const reshuffled = sets.reshuffle(set.id, 'b')
    expect(reshuffled?.playlists.map((p) => p.choices.seed)).toEqual([100, 300])
    await sets.flush()
    expect((await storedSet(storage, set.id))?.playlists[1]?.choices.seed).toBe(300)
  })
})
