/**
 * A track's energy. It is stored as the provider reports it (0..1) and shown and edited
 * as a level, a whole number from 0 to 10. This is the one implementation of the
 * conversion between the two, of the words for a level, and of its hue.
 */

export const MAX_ENERGY_LEVEL = 10

/** Stored energy (0..1) → the level shown (0–10). */
export function energyLevel(energy: number): number {
  return Math.round(Math.min(1, Math.max(0, energy)) * MAX_ENERGY_LEVEL)
}

/** A level as entered (0–10) → the stored energy (0..1). */
export function energyFromLevel(level: number): number {
  return level / MAX_ENERGY_LEVEL
}

export const isEnergyLevel = (level: number): boolean =>
  Number.isInteger(level) && level >= 0 && level <= MAX_ENERGY_LEVEL

/** "Energy 7 of 10", or "Energy unknown". */
export function describeEnergy(energy: number | null): string {
  return energy === null
    ? 'Energy unknown'
    : `Energy ${String(energyLevel(energy))} of ${String(MAX_ENERGY_LEVEL)}`
}

/** The hue of the calmest level; the scale runs from here down to red (0). */
const CALM_HUE = 220

/** Hue of a level: blue for calm (0), through green and yellow, to red for intense (10). */
export function energyHue(level: number): number {
  return Math.round(CALM_HUE * (1 - level / MAX_ENERGY_LEVEL))
}
