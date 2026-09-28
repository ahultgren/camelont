import { describe, expect, it } from 'vitest'
import { wcsOrder } from '@/test/wcs'
import { mixDescription, mixPlaylistName } from './describe'
import { evaluateMix, mixTracks } from './evaluate'
import { DEFAULT_PROFILE } from './profile'

describe('saved playlist text', () => {
  const mix = evaluateMix(mixTracks(wcsOrder('hand_tuned')), DEFAULT_PROFILE)

  it('names the new playlist after the source', () => {
    expect(mixPlaylistName('WCS')).toBe('WCS · Camelot mix')
  })

  it('describes the moves, tempo range and profile', () => {
    expect(mixDescription(mix, DEFAULT_PROFILE, 'twoWaves', 'WCS')).toBe(
      'Harmonic mix of “WCS” made with Camelont: 9 perfect, 7 boost, 3 drop, 78–127.4 BPM. Profile: Balanced; arc: Two waves.',
    )
  })

  it('stays within Spotify’s 300 characters', () => {
    expect(mixDescription(mix, DEFAULT_PROFILE, null, 'x'.repeat(400)).length).toBe(300)
  })
})
