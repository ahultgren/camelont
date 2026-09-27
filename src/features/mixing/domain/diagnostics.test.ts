import { describe, expect, it } from 'vitest'
import { WCS_TRACKS, wcsId } from '@/test/wcs'
import { NO_CONSTRAINTS, type MixConstraints } from './constraints'
import { describeDiagnostic, diagnose, trackNamer, type Diagnostic } from './diagnostics'
import { mixTracks } from './evaluate'
import { DEFAULT_PROFILE } from './profile'
import { solveMix } from './solver/solve'
import type { MixTrack } from './types'

const tracks = mixTracks(WCS_TRACKS)
const name = trackNamer(tracks)
const brother = wcsId('Brother')
const counting = wcsId('Counting Stars')
const bloodstream = wcsId('Bloodstream')
const stolen = wcsId('Stolen Dance')

const run = (c: Partial<MixConstraints>) => {
  const constraints = { ...NO_CONSTRAINTS, ...c }
  const outcome = solveMix({ tracks, constraints, profile: DEFAULT_PROFILE })
  return { outcome, diagnostics: diagnose(tracks, constraints) }
}

describe('diagnose on the WCS set', () => {
  // Bloodstream (2A) can only follow Counting Stars (12A) or Stolen Dance (1B) here.
  it('explains that Bloodstream has no track to follow when both are unavailable', () => {
    const { outcome, diagnostics } = run({ start: brother, end: stolen, excluded: [counting] })
    expect(outcome.kind).toBe('infeasible')
    const d = diagnostics.find((x) => x.kind === 'no-predecessor' && x.id === bloodstream)
    expect(d).toMatchObject({ excludedOptions: [counting] })
    if (!d) return
    const message = describeDiagnostic(d, name)
    expect(message).toMatch(/^Bloodstream \(2A · E♭ minor\) can’t follow any included track/)
    expect(message).toContain('12A')
    expect(message).toContain('Excluded tracks that would fit: Counting Stars (12A · C♯ minor)')
  })

  it('flags a track with no neighbour at all', () => {
    const { outcome, diagnostics } = run({ excluded: [counting, stolen] })
    expect(outcome.kind).toBe('infeasible')
    expect(diagnostics).toContainEqual({
      kind: 'isolated',
      id: bloodstream,
      excludedOptions: [stolen, counting].sort(
        (a, b) => WCS_TRACKS.findIndex((t) => t.id === a) - WCS_TRACKS.findIndex((t) => t.id === b),
      ),
    })
  })

  it('reports nothing for a feasible set', () => {
    expect(diagnose(tracks, NO_CONSTRAINTS)).toEqual([
      { kind: 'no-order-found', tightest: expect.any(Array) as unknown },
    ])
  })
})

describe('diagnose bottlenecks', () => {
  const t = (id: string, camelot: MixTrack['camelot']): MixTrack => ({
    id,
    label: id,
    camelot,
    bpm: 100,
    energy: null,
  })

  it('finds tracks competing for the same only predecessor', () => {
    // 1A, 5A and 9A can each only follow 2A here.
    const set = [t('a', '1A'), t('p', '2A'), t('b', '5A'), t('c', '9A')]
    const constraints = NO_CONSTRAINTS
    expect(solveMix({ tracks: set, constraints, profile: DEFAULT_PROFILE }).kind).toBe('infeasible')
    expect(diagnose(set, constraints)).toContainEqual({
      kind: 'shared-predecessor',
      ids: ['a', 'b', 'c'],
      predecessor: 'p',
    })
  })
})

describe('describeDiagnostic', () => {
  const plain = (id: string) => id

  it.each<[Diagnostic, string]>([
    [
      { kind: 'too-many-openers', ids: ['A', 'B'] },
      'A and B can’t follow any other included track',
    ],
    [{ kind: 'too-many-closers', ids: ['A', 'B', 'C'] }, 'A, B and C can’t precede'],
    [
      { kind: 'shared-predecessor', ids: ['A', 'B'], predecessor: 'P' },
      'A and B can only follow P; only one of them can.',
    ],
    [{ kind: 'shared-successor', ids: ['A', 'B'], successor: 'S' }, 'A and B can only precede S'],
    [
      { kind: 'no-successor', id: 'A', keys: ['1B', '2A'], excludedOptions: [] },
      'It needs a track in 1B or 2A after it.',
    ],
    [
      { kind: 'isolated', id: 'A', excludedOptions: [] },
      'A can’t follow or precede any other included track',
    ],
    [
      { kind: 'no-order-found', tightest: [{ id: 'A', predecessors: ['P'], successors: ['S'] }] },
      'A can only follow P and precede S',
    ],
  ])('%j', (diagnostic, expected) => {
    expect(describeDiagnostic(diagnostic, plain)).toContain(expected)
  })
})
