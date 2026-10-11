import type { EvaluatedMix } from './evaluate'
import { describeShaping, type MixProfile, type MixShaping } from './profile'

/** Spotify's playlist description limit. */
const DESCRIPTION_MAX = 300

/** The saved playlist's description: what the mix is and the profile that made it. */
export function mixDescription(
  mix: EvaluatedMix,
  profile: MixProfile,
  shaping: MixShaping,
  source: string,
): string {
  const t = mix.stats.toneCounts
  const moves = [
    `${String(t.perfect)} perfect`,
    `${String(t.boost)} boost`,
    `${String(t.drop)} drop`,
    ...(t.mood ? [`${String(t.mood)} mood`] : []),
  ].join(', ')
  const range = mix.stats.bpmRange
    ? `, ${String(mix.stats.bpmRange.min)}–${String(mix.stats.bpmRange.max)} BPM`
    : ''
  const text = `Harmonic mix of “${source}” made with Camelont: ${moves}${range}. Profile: ${profile.name}; arc: ${describeShaping(shaping)}.`
  return text.length <= DESCRIPTION_MAX ? text : `${text.slice(0, DESCRIPTION_MAX - 1)}…`
}
