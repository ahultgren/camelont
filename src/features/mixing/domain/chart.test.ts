import { describe, expect, it } from 'vitest'
import chartJson from '@/test/fixtures/camelot-chart.json'
import { ALL_CAMELOT_KEYS, parseCamelot, type CamelotKey } from '@/shared/music'
import { MOVE_META, MOVES, moveBetween, predecessorKeys, successorKeys, type Move } from './chart'

const k = (s: string): CamelotKey => {
  const key = parseCamelot(s)
  if (!key) throw new Error(s)
  return key
}

/** The JSON's answer for a pair, or null for a clash. */
function jsonMove(from: CamelotKey, to: CamelotKey): Move | null {
  const row = (chartJson.chart as Record<string, Record<string, string[]>>)[from] ?? {}
  const hits = Object.entries(row).filter(([, targets]) => targets.includes(to))
  expect(hits.length).toBeLessThanOrEqual(1)
  return (hits[0]?.[0] as Move | undefined) ?? null
}

describe('the chart', () => {
  it('lists the same moves as the JSON', () => {
    expect([...MOVES]).toEqual(chartJson.moves)
  })

  it('equals docs/domain/camelot-chart.json for all 576 pairs', () => {
    let pairs = 0
    for (const from of ALL_CAMELOT_KEYS) {
      for (const to of ALL_CAMELOT_KEYS) {
        expect(moveBetween(from, to), `${from} → ${to}`).toBe(jsonMove(from, to))
        pairs++
      }
    }
    expect(pairs).toBe(576)
  })

  it.each([
    ['1A', '12B', 'perfect'],
    ['1A', '2A', 'boost1'],
    ['1A', '10A', 'boost2'],
    ['1A', '3A', 'boost3'],
    ['1A', '8A', 'boost3Alt'],
    ['1A', '12A', 'drop1'],
    ['1A', '4A', 'drop2'],
    ['1A', '11A', 'drop3'],
    ['1A', '6A', 'drop3Alt'],
    ['1A', '4B', 'mood'],
    ['12A', '11B', 'perfect'],
    ['12B', '1A', 'perfect'],
    ['1B', '2A', 'perfect'],
    ['1B', '2B', 'boost1'],
    ['1B', '10B', 'boost2'],
    ['1B', '3B', 'boost3'],
    ['1B', '8B', 'boost3Alt'],
    ['1B', '1A', 'drop1'],
    ['1B', '12B', 'drop1'],
    ['1B', '4B', 'drop2'],
    ['1B', '11B', 'drop3'],
    ['1B', '6B', 'drop3Alt'],
    ['1B', '10A', 'mood'],
    ['7B', '4A', 'mood'],
    ['8A', '8B', 'boost1'],
    ['8B', '8A', 'drop1'],
  ])('spot check %s → %s is %s', (from, to, move) => {
    expect(moveBetween(k(from), k(to))).toBe(move)
  })

  it('treats 2A → 3B as a clash (directional, not textbook)', () => {
    expect(moveBetween('2A', '3B')).toBeNull()
  })

  it('finds neighbour keys in both directions', () => {
    expect(successorKeys('2A')).toContain('1B')
    expect(successorKeys('2A')).not.toContain('3B')
    expect(predecessorKeys('2A')).toContain('12A')
    for (const key of ALL_CAMELOT_KEYS) {
      expect(successorKeys(key)).toHaveLength(12)
      expect(predecessorKeys(key)).toHaveLength(12)
    }
  })

  it('has a symbol, label and tone for every move', () => {
    expect(MOVE_META.perfect).toMatchObject({ symbol: '=', tone: 'perfect' })
    expect(MOVE_META.boost3Alt.symbol).toBe('(+++)')
    expect(MOVE_META.drop2.symbol).toBe('−−')
    expect(MOVE_META.mood).toMatchObject({ symbol: '~', tone: 'mood' })
    expect(MOVE_META.clash).toMatchObject({ symbol: '✗', tone: 'clash' })
  })
})
