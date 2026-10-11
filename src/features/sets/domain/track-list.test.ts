import { describe, expect, it } from 'vitest'
import type { TrackStatus } from './select'
import { isFiltering, NO_FILTER, visibleRows, type RowFacts } from './track-list'

const IN: TrackStatus = { inSet: true, reason: 'in' }
const PICKED: TrackStatus = { inSet: true, reason: 'picked' }
const RANGE: TrackStatus = { inSet: false, reason: 'outsideRange' }
const NEEDS: TrackStatus = { inSet: false, reason: 'needsData' }

const tracks: Record<string, RowFacts & { status: TrackStatus | null }> = {
  a: { title: 'Brother', artists: ['Kodaline'], camelot: '12B', bpm: 78, status: IN },
  b: { title: 'Love Is', artists: ['Beyoncé', 'Someone'], camelot: '2A', bpm: 120, status: RANGE },
  c: { title: 'Lemon Tree', artists: ['Fools Garden'], camelot: null, bpm: null, status: NEEDS },
  d: { title: 'Price Tag', artists: ['Jessie J'], camelot: '2B', bpm: 88, status: PICKED },
  e: { title: 'New one', artists: ['Nobody'], camelot: '1A', bpm: 78, status: null },
}
const rows = Object.entries(tracks).map(([trackId, track]) => ({ trackId, status: track.status }))
const facts = (trackId: string) => tracks[trackId]
const ids = (filter: Partial<typeof NO_FILTER>) =>
  visibleRows(rows, facts, { ...NO_FILTER, ...filter }).map((row) => row.trackId)

describe('the track list', () => {
  it('shows every row in playlist order by default', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(isFiltering(NO_FILTER)).toBe(false)
  })

  it('filters by status; a track still being looked up is neither in nor out', () => {
    expect(ids({ status: 'inSet' })).toEqual(['a', 'd'])
    expect(ids({ status: 'leftOut' })).toEqual(['b', 'c'])
    expect(ids({ status: 'needsData' })).toEqual(['c'])
    expect(isFiltering({ ...NO_FILTER, status: 'inSet' })).toBe(true)
  })

  it('filters by words in the title or an artist, whatever the case or accents', () => {
    expect(ids({ text: 'beyonce' })).toEqual(['b'])
    expect(ids({ text: '  LEMON  fools ' })).toEqual(['c'])
    expect(ids({ text: 'tag jessie' })).toEqual(['d'])
    expect(ids({ text: 'zzz' })).toEqual([])
    expect(isFiltering({ ...NO_FILTER, text: '  ' })).toBe(false)
  })

  it('sorts by BPM, tracks without one last, ties in playlist order', () => {
    expect(ids({ sort: 'bpm' })).toEqual(['a', 'e', 'd', 'b', 'c'])
  })

  it('sorts by key in wheel order, minor before major, tracks without one last', () => {
    expect(ids({ sort: 'key' })).toEqual(['e', 'b', 'd', 'a', 'c'])
  })

  it('combines filter and sort, and leaves the rows it was given alone', () => {
    const before = rows.map((row) => row.trackId)
    expect(ids({ status: 'inSet', sort: 'bpm', text: 'e' })).toEqual(['a', 'd'])
    expect(rows.map((row) => row.trackId)).toEqual(before)
  })
})
