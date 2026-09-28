import { describe, expect, it } from 'vitest'
import { wcsId, wcsOrder } from '@/test/wcs'
import { DEFAULT_ARC_WEIGHT } from './arc'
import { evaluateMix, mixTracks } from './evaluate'
import { DEFAULT_PROFILE, withArc } from './profile'

const handTuned = mixTracks(wcsOrder('hand_tuned'))
const greedy = mixTracks(wcsOrder('script_greedy'))
const original = mixTracks(wcsOrder('original'))

describe('evaluateMix on the WCS fixture', () => {
  it('scores the hand-tuned order as clash-free: 9 perfect, 7 boost, 3 drop', () => {
    const mix = evaluateMix(handTuned, DEFAULT_PROFILE)
    expect(mix.clashCount).toBe(0)
    expect(mix.transitions).toHaveLength(19)
    expect(mix.stats.toneCounts).toEqual({ perfect: 9, boost: 7, drop: 3, mood: 0, clash: 0 })
    // It used only perfect, +, − and +++ (research.md §3).
    const used = new Set(mix.transitions.map((t) => t.move))
    expect([...used].sort()).toEqual(['boost1', 'boost3', 'drop1', 'perfect'])
  })

  it('scores the greedy baseline as clash-free', () => {
    expect(evaluateMix(greedy, DEFAULT_PROFILE).clashCount).toBe(0)
  })

  it('counts and costs clashes in an unordered playlist', () => {
    const mix = evaluateMix(original, DEFAULT_PROFILE)
    expect(mix.clashCount).toBeGreaterThan(0)
    const clash = mix.transitions.find((t) => t.move === 'clash')
    expect(clash?.moveCost).toBe(DEFAULT_PROFILE.clashCost)
  })

  it('reports opener, closer, BPM range and peaks', () => {
    const { stats } = evaluateMix(handTuned, DEFAULT_PROFILE)
    expect(stats.opener).toBe(wcsId('Brother'))
    expect(stats.closer).toBe(wcsId('Safe and Sound'))
    expect(stats.bpmRange).toEqual({ min: 78, max: 127.4 })
    // Pompeii (wave 1), I Wanna Dance with Somebody (wave 2), Safe and Sound (close)
    expect(stats.peaks.map((p) => p.index)).toEqual([6, 11, 19])
  })

  it('reports the set tempo, range and peaks with half/double time folded', () => {
    const tracks = mixTracks([
      { id: 'a', label: 'A', camelot: '8A', bpm: 88, energy: null },
      { id: 'b', label: 'B', camelot: '8A', bpm: 184, energy: null },
      { id: 'c', label: 'C', camelot: '8A', bpm: 90, energy: null },
    ])
    const mix = evaluateMix(tracks, DEFAULT_PROFILE)
    expect(mix.tempo).toEqual([88, 92, 90])
    expect(mix.stats.bpmRange).toEqual({ min: 88, max: 92 })
    expect(mix.stats.peaks).toEqual([])
  })

  it('scores tempo gaps between set tempos', () => {
    const tracks = mixTracks(
      [78, 129.9, 175, 88, 96, 104, 112, 120].map((bpm, i) => ({
        id: String(i),
        label: String(bpm),
        camelot: '8A',
        bpm,
        energy: null,
      })),
    )
    const gaps = evaluateMix(tracks, DEFAULT_PROFILE).transitions.map((t) => t.tempoGap)
    // 129.9 is not a double-time 64.95 next to 78; 175 is a double-time 87.5.
    expect(gaps[0]).toBeCloseTo(51.9 / 129.9)
    expect(gaps[1]).toBeCloseTo(42.4 / 129.9)
    expect(gaps[2]).toBeCloseTo(0.5 / 88)
  })

  it('scores the arc on the set tempo, so a double-time track does not count as fast', () => {
    const profile = withArc(DEFAULT_PROFILE, { preset: 'steadyBuild', signal: 'bpm', weight: 10 })
    const tracks = mixTracks(
      [88, 92, 184, 96].map((bpm, i) => ({
        id: String(i),
        label: String(bpm),
        camelot: '8A',
        bpm,
        energy: null,
      })),
    )
    const mix = evaluateMix(tracks, profile)
    expect(mix.arc?.range).toEqual({ min: 88, max: 96 })
    // 184 is scored as 92, the middle of the range, not as the fastest track.
    const asNinetyTwo = evaluateMix(
      tracks.map((t) => (t.bpm === 184 ? { ...t, bpm: 92 } : t)),
      profile,
    )
    expect(mix.arc?.cost).toBeCloseTo(asNinetyTwo.arc?.cost ?? NaN)
  })

  it('sums move and tempo costs into the total', () => {
    const mix = evaluateMix(handTuned, DEFAULT_PROFILE)
    const sum = mix.transitions.reduce((s, t) => s + t.cost, 0)
    expect(mix.totalCost).toBeCloseTo(sum)
    expect(mix.arc).toBeNull()
    const first = mix.transitions[0]
    // Brother (12B, 78) → Love Is (11B, 88): drop1 + 20 × 10/88
    expect(first?.move).toBe('drop1')
    expect(first?.cost).toBeCloseTo(1 + (20 * 10) / 88)
  })

  it('adds the arc term, and two waves prefers the hand-tuned shape', () => {
    const profile = withArc(DEFAULT_PROFILE, {
      preset: 'twoWaves',
      signal: 'bpm',
      weight: DEFAULT_ARC_WEIGHT,
    })
    const tuned = evaluateMix(handTuned, profile)
    const base = evaluateMix(greedy, profile)
    expect(tuned.arc?.cost).toBeGreaterThan(0)
    expect(tuned.totalCost).toBeCloseTo(tuned.transitionCost + (tuned.arc?.cost ?? 0))
    expect(tuned.arc?.cost).toBeLessThan(base.arc?.cost ?? 0)
    expect(tuned.arc?.target).toHaveLength(20)
  })

  it('handles empty and single-track mixes', () => {
    expect(evaluateMix([], DEFAULT_PROFILE).totalCost).toBe(0)
    const one = evaluateMix(handTuned.slice(0, 1), DEFAULT_PROFILE)
    expect(one.transitions).toEqual([])
    expect(one.stats.peaks).toEqual([])
  })
})
