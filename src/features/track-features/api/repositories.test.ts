import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@/shared/storage'
import type { Override } from '../domain/features'
import {
  createFeaturesCache,
  createOverridesRepo,
  parseOverridesFile,
  serialiseOverrides,
} from './repositories'

const override: Override = {
  trackId: 't1',
  camelot: '6B',
  bpm: 88,
  energy: 0.4,
  note: 'Chordify',
  label: 'Lemon Tree',
  updatedAt: 5,
}
/** An override as it was stored and exported before energy could be set by hand. */
const withoutEnergy = {
  trackId: 't1',
  camelot: '6B',
  bpm: 88,
  note: 'Chordify',
  label: 'Lemon Tree',
  updatedAt: 5,
}

describe('features cache', () => {
  it('round-trips and ignores records with another schema version', async () => {
    const store = createMemoryStore({ old: { v: 0, data: {} }, junk: 'x' })
    const cache = createFeaturesCache(store)
    await cache.putMany([
      { trackId: 'a', found: true, camelot: '8A', bpm: 120, energy: null, fetchedAt: 1 },
      { trackId: 'b', found: false, fetchedAt: 1 },
    ])
    const got = await cache.getMany(['a', 'b', 'old', 'junk', 'none'])
    expect([...got.keys()]).toEqual(['a', 'b'])
    expect(got.get('a')).toMatchObject({ camelot: '8A', bpm: 120 })
  })
})

describe('overrides repo', () => {
  it('stores, lists and removes overrides', async () => {
    const repo = createOverridesRepo(
      createMemoryStore({ bad: { v: 1, data: { trackId: 'x', camelot: '13Z' } } }),
    )
    await repo.put(override)
    await repo.putMany([{ ...override, trackId: 't2' }])
    expect((await repo.all()).map((o) => o.trackId).sort()).toEqual(['t1', 't2'])
    await repo.remove('t1')
    expect((await repo.all()).map((o) => o.trackId)).toEqual(['t2'])
  })

  it('keeps an energy set by hand', async () => {
    const repo = createOverridesRepo(createMemoryStore())
    await repo.put(override)
    expect(await repo.all()).toEqual([override])
  })

  it('loads a record stored before energy could be set, with nothing lost', async () => {
    const repo = createOverridesRepo(createMemoryStore({ t1: { v: 1, data: withoutEnergy } }))
    expect(await repo.all()).toEqual([{ ...override, energy: null }])
  })

  it('reads a record with an energy off the scale as missing', async () => {
    const repo = createOverridesRepo(
      createMemoryStore({ t1: { v: 1, data: { ...override, energy: 7 } } }),
    )
    expect(await repo.all()).toEqual([])
  })
})

describe('import/export', () => {
  it('round-trips an export', () => {
    const text = serialiseOverrides([override], new Date('2026-09-27T00:00:00Z'))
    expect(parseOverridesFile(text)).toEqual({ ok: true, overrides: [override] })
  })

  it('imports a file exported before energy could be set, with nothing lost', () => {
    const text = JSON.stringify({
      app: 'camelont',
      kind: 'track-overrides',
      version: 1,
      exportedAt: '2026-09-27T00:00:00.000Z',
      overrides: [withoutEnergy],
    })
    expect(parseOverridesFile(text)).toEqual({
      ok: true,
      overrides: [{ ...override, energy: null }],
    })
  })

  it('rejects an energy off the 0..1 scale', () => {
    const wrong = parseOverridesFile(
      serialiseOverrides([{ ...override, energy: 7 }], new Date('2026-09-27T00:00:00Z')),
    )
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error).toContain('overrides.0.energy')
  })

  it('rejects files that are not JSON or not an export', () => {
    expect(parseOverridesFile('nope')).toEqual({ ok: false, error: 'This file isn’t JSON.' })
    const wrong = parseOverridesFile(
      JSON.stringify({
        app: 'camelont',
        kind: 'track-overrides',
        version: 1,
        exportedAt: 'x',
        overrides: [{ ...override, camelot: '13A' }],
      }),
    )
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error).toContain('overrides.0.camelot')
  })
})
