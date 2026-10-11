import { describe, expect, it } from 'vitest'
import {
  describeBlocker,
  describeEmptySet,
  describeExcludedInRule,
  excludedInRules,
} from './mix-problems'
import { NO_MIX_SETTINGS } from './set'
import type { MixSettings } from './types'

const mix = (over: Partial<MixSettings>): MixSettings => ({ ...NO_MIX_SETTINGS, ...over })
const name = (trackId: string) => trackId.toUpperCase()

describe('excludedInRules (spec §5.4)', () => {
  it('finds nothing while no rule names an excluded track', () => {
    expect(
      excludedInRules({ t9: 'exclude', t1: 'mustInclude' }, mix({ opener: 't1', closer: 't2' })),
    ).toEqual([])
  })

  it('names the opening and the closing track rule', () => {
    const found = excludedInRules(
      { t1: 'exclude', t2: 'exclude' },
      mix({ opener: 't1', closer: 't2' }),
    )
    expect(found).toEqual([
      { trackId: 't1', rule: { kind: 'opener', trackId: 't1' } },
      { trackId: 't2', rule: { kind: 'closer', trackId: 't2' } },
    ])
    expect(found.map((problem) => describeExcludedInRule(problem, name))).toEqual([
      'T1 is excluded, but it is the opening track. Remove the exclusion or choose another opening track.',
      'T2 is excluded, but it is the closing track. Remove the exclusion or choose another closing track.',
    ])
  })

  it('names the follow pair, once for each excluded track in it', () => {
    const found = excludedInRules(
      { t1: 'exclude', t3: 'exclude' },
      mix({
        follows: [
          ['t1', 't2'],
          ['t2', 't3'],
          ['t4', 't5'],
        ],
      }),
    )
    expect(found).toEqual([
      { trackId: 't1', rule: { kind: 'follow', from: 't1', to: 't2' } },
      { trackId: 't3', rule: { kind: 'follow', from: 't2', to: 't3' } },
    ])
    expect(describeExcludedInRule(found[0] ?? fail(), name)).toBe(
      'T1 is excluded, but T1 must be followed by T2. Remove the exclusion or the pair.',
    )
  })

  it('reports both tracks of a pair when both are excluded', () => {
    expect(
      excludedInRules({ t1: 'exclude', t2: 'exclude' }, mix({ follows: [['t1', 't2']] })),
    ).toHaveLength(2)
  })
})

const fail = (): never => {
  throw new Error('expected a problem')
}

describe('describeBlocker (spec §8.3)', () => {
  it('says which mark or rule keeps a track without data in the set', () => {
    expect(describeBlocker('t1', { t1: 'mustInclude' }, NO_MIX_SETTINGS, name)).toBe(
      'T1 is marked must-include but has no key or BPM. Fill them in, or remove the mark.',
    )
    expect(describeBlocker('t1', {}, mix({ opener: 't1' }), name)).toBe(
      'T1 is the opening track but has no key or BPM. Fill them in, or choose another opening track.',
    )
    expect(describeBlocker('t1', {}, mix({ closer: 't1' }), name)).toBe(
      'T1 is the closing track but has no key or BPM. Fill them in, or choose another closing track.',
    )
    expect(describeBlocker('t2', {}, mix({ follows: [['t1', 't2']] }), name)).toBe(
      'T2 is in the pair T1 → T2 but has no key or BPM. Fill them in, or remove the pair.',
    )
  })
})

describe('describeEmptySet', () => {
  it('says why there is nothing to mix', () => {
    expect(describeEmptySet({ playlists: 0, pool: 0 })).toBe(
      'This set has no playlists yet. Add one to start mixing.',
    )
    expect(describeEmptySet({ playlists: 2, pool: 0 })).toBe(
      'The playlists in this set have no tracks that can be mixed.',
    )
    expect(describeEmptySet({ playlists: 1, pool: 12 })).toBe(
      'No track is in the set: all 12 are left out. Widen a BPM range, raise a limit, or fill in a key and BPM.',
    )
  })
})
