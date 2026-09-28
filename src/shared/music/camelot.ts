/**
 * The Camelot kernel: the one implementation of Camelot keys, key names and key hues.
 * See docs/domain/camelot-chart.md.
 */

export type WheelNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
/** `A` = minor, `B` = major. */
export type CamelotMode = 'A' | 'B'
/** e.g. `8A` (A minor), `8B` (C major). */
export type CamelotKey = `${WheelNumber}${CamelotMode}`
/** Spotify/ReccoBeats mode: 1 = major, 0 = minor. */
export type PitchMode = 0 | 1

const WHEEL: readonly WheelNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export const ALL_CAMELOT_KEYS: readonly CamelotKey[] = (['A', 'B'] as const).flatMap((mode) =>
  WHEEL.map((n) => makeCamelot(n, mode)),
)

const CAMELOT_RE = /^(1[0-2]|[1-9])([AB])$/

export function makeCamelot(n: WheelNumber, mode: CamelotMode): CamelotKey {
  return `${n}${mode}`
}

export function parseCamelot(input: string): CamelotKey | null {
  const match = CAMELOT_RE.exec(input.trim().toUpperCase())
  if (!match) return null
  return makeCamelot(Number(match[1]) as WheelNumber, match[2] as CamelotMode)
}

export function isCamelotKey(value: unknown): value is CamelotKey {
  return typeof value === 'string' && parseCamelot(value) === value
}

export function camelotParts(key: CamelotKey): { n: WheelNumber; mode: CamelotMode } {
  return { n: Number(key.slice(0, -1)) as WheelNumber, mode: key.slice(-1) as CamelotMode }
}

const modeOffset = (mode: PitchMode) => (mode === 1 ? 8 : 5)

/** Pitch class (0 = C … 11 = B) + mode → Camelot. `null` for unknown (e.g. −1). */
export function fromPitchClass(pitchClass: number, mode: PitchMode): CamelotKey | null {
  if (!Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) return null
  const n = (pitchClass * 7 + modeOffset(mode)) % 12 || 12
  return makeCamelot(n as WheelNumber, mode === 1 ? 'B' : 'A')
}

export function toPitchClass(key: CamelotKey): { pitchClass: number; mode: PitchMode } {
  const { n, mode } = camelotParts(key)
  const pitchMode: PitchMode = mode === 'B' ? 1 : 0
  // 7 is its own inverse mod 12, so pitchClass = (n − offset) × 7 mod 12.
  const pitchClass = (((((n % 12) - modeOffset(pitchMode)) * 7) % 12) + 12) % 12
  return { pitchClass, mode: pitchMode }
}

// Spelling as on the approved reference charts (docs/reference/charts/) and the WCS
// fixture: flats, except F♯ major and C♯/F♯ minor.
const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

/** e.g. `11B` → `A major`. */
export function keyName(key: CamelotKey): string {
  const { pitchClass, mode } = toPitchClass(key)
  const names = mode === 1 ? MAJOR_NAMES : MINOR_NAMES
  return `${names[pitchClass] ?? '?'} ${mode === 1 ? 'major' : 'minor'}`
}

/** Both notations, e.g. `11B · A major`. */
export function formatKey(key: CamelotKey): string {
  return `${key} · ${keyName(key)}`
}

/** Hue derived from the wheel position; A and B share it. */
export function keyHue(key: CamelotKey): number {
  const { n } = camelotParts(key)
  return ((n - 1) * 30 + 330) % 360
}
