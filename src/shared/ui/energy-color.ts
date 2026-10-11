import { energyHue, energyLevel } from '@/shared/music'

/**
 * Chip background for an energy (0..1): the hue of its level, at the tone of a major
 * key's chip, so the same ink reads on it in both themes.
 */
export function energyColor(energy: number): string {
  return `hsl(${String(energyHue(energyLevel(energy)))} var(--chip-s) var(--chip-l))`
}
