import { describe, expect, it } from 'vitest'
import type { Override } from './features'
import { buildExport, mergeOverrides } from './overrides'

const o = (trackId: string, bpm: number | null, extra: Partial<Override> = {}): Override => ({
  trackId,
  camelot: null,
  bpm,
  note: null,
  label: null,
  updatedAt: 1,
  ...extra,
})

describe('mergeOverrides', () => {
  it('lets incoming win and reports added, updated and unchanged', () => {
    const existing = new Map([
      ['a', o('a', 100)],
      ['b', o('b', 90)],
    ])
    const { changed, report } = mergeOverrides(existing, [
      o('a', 100, { updatedAt: 9 }),
      o('b', 95),
      o('c', 120),
    ])
    expect(report).toEqual({ added: 1, updated: 1, unchanged: 1 })
    expect(changed.map((x) => [x.trackId, x.bpm])).toEqual([
      ['b', 95],
      ['c', 120],
    ])
  })
})

describe('buildExport', () => {
  it('is versioned and sorted', () => {
    const file = buildExport([o('b', 1), o('a', 2)], new Date('2026-09-27T12:00:00Z'))
    expect(file).toMatchObject({
      app: 'camelont',
      kind: 'track-overrides',
      version: 1,
      exportedAt: '2026-09-27T12:00:00.000Z',
    })
    expect(file.overrides.map((x) => x.trackId)).toEqual(['a', 'b'])
  })
})
