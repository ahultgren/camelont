import { describe, expect, it } from 'vitest'
import { wcsOrder } from '@/test/wcs'
import { mixDescription } from './describe'
import { evaluateMix, mixTracks } from './evaluate'
import { DEFAULT_PROFILE, NO_SHAPING } from './profile'

describe('saved playlist text', () => {
  const mix = evaluateMix(mixTracks(wcsOrder('hand_tuned')), DEFAULT_PROFILE)

  it('describes the moves, tempo range and profile', () => {
    expect(mixDescription(mix, DEFAULT_PROFILE, { ...NO_SHAPING, arc: 'twoWaves' }, 'WCS')).toBe(
      'Harmonic mix of “WCS” made with Camelont: 9 perfect, 7 boost, 3 drop, 78–127.4 BPM. Profile: Balanced; arc: Two waves.',
    )
  })

  it('says what else shapes the mix', () => {
    const shaped = {
      arc: 'twoWaves',
      arcSignal: 'energy',
      energySteps: true,
      keyLift: true,
    } as const
    expect(mixDescription(mix, DEFAULT_PROFILE, shaped, 'WCS')).toMatch(
      /arc: Two waves by energy, energy steps, key lift\.$/,
    )
    expect(mixDescription(mix, DEFAULT_PROFILE, { ...NO_SHAPING, keyLift: true }, 'WCS')).toMatch(
      /arc: key lift\.$/,
    )
    expect(mixDescription(mix, DEFAULT_PROFILE, NO_SHAPING, 'WCS')).toMatch(/arc: none\.$/)
  })

  it('stays within Spotify’s 300 characters', () => {
    expect(mixDescription(mix, DEFAULT_PROFILE, NO_SHAPING, 'x'.repeat(400)).length).toBe(300)
  })
})
