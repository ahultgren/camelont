import {
  ALL_CAMELOT_KEYS,
  camelotParts,
  type CamelotKey,
  type CamelotMode,
  type MoveTone,
} from '@/shared/music'

/**
 * The user's directional Camelot chart. Canonical spec: docs/domain/camelot-chart.json;
 * a test asserts this encoding equals it for all 576 pairs. Do not "fix" it toward
 * the textbook symmetric rule.
 */
export const MOVES = [
  'perfect',
  'boost1',
  'boost2',
  'boost3',
  'boost3Alt',
  'drop1',
  'drop2',
  'drop3',
  'drop3Alt',
  'mood',
] as const

export type Move = (typeof MOVES)[number]
/** A move, or `clash` for a pair not in the chart (only when evaluating given orders). */
export type MoveOrClash = Move | 'clash'

export interface MoveMeta {
  symbol: string
  label: string
  tone: MoveTone
}

export const MOVE_META: Record<MoveOrClash, MoveMeta> = {
  perfect: { symbol: '=', label: 'perfect match', tone: 'perfect' },
  boost1: { symbol: '+', label: 'energy +', tone: 'boost' },
  boost2: { symbol: '++', label: 'energy ++', tone: 'boost' },
  boost3: { symbol: '+++', label: 'energy +++', tone: 'boost' },
  boost3Alt: { symbol: '(+++)', label: 'energy (+++)', tone: 'boost' },
  drop1: { symbol: '−', label: 'energy −', tone: 'drop' },
  drop2: { symbol: '−−', label: 'energy −−', tone: 'drop' },
  drop3: { symbol: '−−−', label: 'energy −−−', tone: 'drop' },
  drop3Alt: { symbol: '(−−−)', label: 'energy (−−−)', tone: 'drop' },
  mood: { symbol: '~', label: 'mood change', tone: 'mood' },
  clash: { symbol: '✗', label: 'not in chart', tone: 'clash' },
}

/**
 * Wheel-arithmetic form of the chart: for a source mode, `${targetMode}${d}` → move,
 * where d = (n_target − n_source) mod 12. See the table in camelot-chart.md.
 */
const RULES: Record<CamelotMode, Partial<Record<string, Move>>> = {
  A: {
    A0: 'perfect',
    B11: 'perfect',
    B0: 'boost1',
    A1: 'boost1',
    A9: 'boost2',
    A2: 'boost3',
    A7: 'boost3Alt',
    A11: 'drop1',
    A3: 'drop2',
    A10: 'drop3',
    A5: 'drop3Alt',
    B3: 'mood',
  },
  B: {
    B0: 'perfect',
    A1: 'perfect',
    B1: 'boost1',
    B9: 'boost2',
    B2: 'boost3',
    B7: 'boost3Alt',
    A0: 'drop1',
    B11: 'drop1',
    B3: 'drop2',
    B10: 'drop3',
    B5: 'drop3Alt',
    A9: 'mood',
  },
}

/** The chart's move for `from → to`, or `null` for a clash. */
export function moveBetween(from: CamelotKey, to: CamelotKey): Move | null {
  const a = camelotParts(from)
  const b = camelotParts(to)
  const d = (((b.n - a.n) % 12) + 12) % 12
  return RULES[a.mode][`${b.mode}${d}`] ?? null
}

/** Keys a track in `key` may be followed by. */
export function successorKeys(key: CamelotKey): CamelotKey[] {
  return ALL_CAMELOT_KEYS.filter((to) => moveBetween(key, to) !== null)
}

/** Keys a track in `key` may follow. */
export function predecessorKeys(key: CamelotKey): CamelotKey[] {
  return ALL_CAMELOT_KEYS.filter((from) => moveBetween(from, key) !== null)
}
