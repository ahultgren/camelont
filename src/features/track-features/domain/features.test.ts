import { describe, expect, it } from 'vitest'
import {
  isMixable,
  isValidBpm,
  isValidEnergy,
  mergeFeatures,
  needsFetch,
  NOT_FOUND_TTL_MS,
  type Override,
} from './features'

const fetched = {
  trackId: 't',
  found: true as const,
  camelot: '8B' as const,
  bpm: 175,
  energy: 0.7,
  fetchedAt: 0,
}
const override = (o: Partial<Override>): Override => ({
  trackId: 't',
  camelot: null,
  bpm: null,
  energy: null,
  note: null,
  label: null,
  updatedAt: 1,
  ...o,
})

describe('mergeFeatures', () => {
  it('uses fetched values with their source', () => {
    const f = mergeFeatures('t', fetched, undefined)
    expect(f.camelot).toEqual({ value: '8B', source: 'reccobeats' })
    expect(f.bpm).toEqual({ value: 175, source: 'reccobeats' })
    expect(f.energy).toEqual({ value: 0.7, source: 'reccobeats' })
    expect(f.overridden).toBe(false)
  })

  it('lets an override win field by field', () => {
    const f = mergeFeatures('t', fetched, override({ bpm: 87.5, note: 'half-time' }))
    expect(f.camelot).toEqual({ value: '8B', source: 'reccobeats' })
    expect(f.bpm).toEqual({ value: 87.5, source: 'manual' })
    expect(f.energy).toEqual({ value: 0.7, source: 'reccobeats' })
    expect(f.note).toBe('half-time')
    expect(f.overridden).toBe(true)
  })

  it('lets an energy set by hand win, and leaves key and BPM as fetched', () => {
    const f = mergeFeatures('t', fetched, override({ energy: 0.3 }))
    expect(f.energy).toEqual({ value: 0.3, source: 'manual' })
    expect(f.camelot).toEqual({ value: '8B', source: 'reccobeats' })
    expect(f.bpm).toEqual({ value: 175, source: 'reccobeats' })
    expect(f.overridden).toBe(true)
    // Zero is a value, not "not overridden".
    expect(mergeFeatures('t', fetched, override({ energy: 0 })).energy).toEqual({
      value: 0,
      source: 'manual',
    })
  })

  it('does not count a note alone as a value set by hand', () => {
    const f = mergeFeatures('t', fetched, override({ note: 'checked' }))
    expect(f.overridden).toBe(false)
    expect(f.note).toBe('checked')
  })

  it('has no energy where neither the provider nor the user gave one', () => {
    expect(mergeFeatures('t', { ...fetched, energy: null }, undefined).energy).toBeNull()
    expect(mergeFeatures('t', undefined, override({ energy: 0.6 })).energy).toEqual({
      value: 0.6,
      source: 'manual',
    })
  })

  it('fills in tracks the provider does not know', () => {
    const f = mergeFeatures(
      't',
      { trackId: 't', found: false, fetchedAt: 0 },
      override({ camelot: '6B', bpm: 88 }),
    )
    expect(isMixable(f)).toBe(true)
    expect(f.camelot?.source).toBe('manual')
  })

  it('marks tracks without key or BPM as not mixable', () => {
    expect(isMixable(mergeFeatures('t', undefined, undefined))).toBe(false)
    expect(isMixable(mergeFeatures('t', { ...fetched, camelot: null }, undefined))).toBe(false)
    expect(isMixable(undefined)).toBe(false)
  })
})

describe('needsFetch', () => {
  it('fetches unknown tracks and retries old not-found answers', () => {
    expect(needsFetch(undefined, 0)).toBe(true)
    expect(needsFetch(fetched, 1e12)).toBe(false)
    const missing = { trackId: 't', found: false as const, fetchedAt: 0 }
    expect(needsFetch(missing, NOT_FOUND_TTL_MS - 1)).toBe(false)
    expect(needsFetch(missing, NOT_FOUND_TTL_MS + 1)).toBe(true)
  })
})

describe('isValidEnergy', () => {
  it('accepts 0 to 1', () => {
    expect(isValidEnergy(0)).toBe(true)
    expect(isValidEnergy(0.73)).toBe(true)
    expect(isValidEnergy(1)).toBe(true)
    expect(isValidEnergy(1.01)).toBe(false)
    expect(isValidEnergy(-0.1)).toBe(false)
    expect(isValidEnergy(Number.NaN)).toBe(false)
  })
})

describe('isValidBpm', () => {
  it('accepts plausible tempos only', () => {
    expect(isValidBpm(120)).toBe(true)
    expect(isValidBpm(0)).toBe(false)
    expect(isValidBpm(Number.NaN)).toBe(false)
    expect(isValidBpm(400)).toBe(false)
  })
})
