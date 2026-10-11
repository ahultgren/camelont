import { camelotParts, type CamelotKey } from '@/shared/music'
import type { TrackStatus } from './select'

/**
 * The one track list of a set (spec W7): which of a playlist's rows are shown, and in
 * what order. Rows stay grouped by playlist; the filter and the sort work inside each.
 */

export type StatusFilter = 'all' | 'inSet' | 'leftOut' | 'needsData'
export type SortBy = 'playlist' | 'bpm' | 'key'

export interface ListFilter {
  /** Matched against title and artists; blank matches everything. */
  text: string
  status: StatusFilter
  sort: SortBy
}

export const NO_FILTER: ListFilter = { text: '', status: 'all', sort: 'playlist' }

/** A playlist's row as the list sees it. A track without a status is still looked up. */
export interface ListRow {
  trackId: string
  status: TrackStatus | null
}

export interface RowFacts {
  title: string
  artists: readonly string[]
  camelot: CamelotKey | null
  bpm: number | null
}

/** Lower case without accents, so "beyonce" finds "Beyoncé". */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const matchesStatus = (status: TrackStatus | null, filter: StatusFilter): boolean => {
  switch (filter) {
    case 'all':
      return true
    case 'inSet':
      return status?.inSet === true
    case 'leftOut':
      return status?.inSet === false
    case 'needsData':
      return status?.reason === 'needsData'
  }
}

/** Wheel order: 1A, 1B, 2A … 12B. */
const keyRank = (key: CamelotKey): number => {
  const { n, mode } = camelotParts(key)
  return n * 2 + (mode === 'B' ? 1 : 0)
}

/** Ascending, rows without the value last, otherwise in playlist order. */
function sorted<Row extends ListRow>(
  rows: readonly Row[],
  rank: (row: Row) => number | null,
): Row[] {
  return rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort(
      (a, b) =>
        (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY) ||
        a.index - b.index,
    )
    .map(({ row }) => row)
}

export function visibleRows<Row extends ListRow>(
  rows: readonly Row[],
  facts: (trackId: string) => RowFacts | undefined,
  filter: ListFilter,
): Row[] {
  const words = fold(filter.text).split(/\s+/).filter(Boolean)
  const kept = rows.filter((row) => {
    if (!matchesStatus(row.status, filter.status)) return false
    if (words.length === 0) return true
    const known = facts(row.trackId)
    const text = fold([known?.title ?? '', ...(known?.artists ?? [])].join(' '))
    return words.every((word) => text.includes(word))
  })
  switch (filter.sort) {
    case 'playlist':
      return kept
    case 'bpm':
      return sorted(kept, (row) => facts(row.trackId)?.bpm ?? null)
    case 'key':
      return sorted(kept, (row) => {
        const key = facts(row.trackId)?.camelot
        return key ? keyRank(key) : null
      })
  }
}

export const isFiltering = (filter: ListFilter): boolean =>
  filter.text.trim() !== '' || filter.status !== 'all'
