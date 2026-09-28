import { camelotParts, keyHue, type CamelotKey } from '@/shared/music'

/** Chip background for a key: the wheel hue, lighter for minor (A), from theme tokens. */
export function keyColor(key: CamelotKey): string {
  const { mode } = camelotParts(key)
  return `hsl(${keyHue(key)} var(--chip-s) ${mode === 'B' ? 'var(--chip-l)' : 'var(--chip-la)'})`
}
