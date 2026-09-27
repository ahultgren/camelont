import { describe, expect, it } from 'vitest'
import { WCS_TRACKS, wcsId } from '@/test/wcs'
import {
  describeConstraintError,
  describeTrack,
  NO_CONSTRAINTS,
  validateConstraints,
  type ConstraintError,
  type MixConstraints,
} from './constraints'
import { mixTracks } from './evaluate'

const tracks = mixTracks(WCS_TRACKS)
const id = wcsId
const brother = id('Brother')
const loveIs = id('Love Is')
const girl = id('Girl on Fire')
const bloodstream = id('Bloodstream')
const dance = id('I Wanna Dance')
const counting = id('Counting Stars')
const stolen = id('Stolen Dance')

const validate = (c: Partial<MixConstraints>) =>
  validateConstraints(tracks, { ...NO_CONSTRAINTS, ...c })

describe('validateConstraints', () => {
  it('accepts no constraints and a valid chain', () => {
    expect(validate({})).toEqual([])
    expect(
      validate({
        start: brother,
        end: id('Safe and Sound'),
        follows: [
          [counting, bloodstream],
          [bloodstream, stolen],
        ],
        excluded: [girl],
      }),
    ).toEqual([])
  })

  it('reports unknown and excluded tracks used in constraints', () => {
    expect(validate({ start: 'nope' })).toEqual([{ kind: 'unknown-track', id: 'nope' }])
    expect(validate({ end: girl, excluded: [girl] })).toEqual([
      { kind: 'excluded-in-constraint', id: girl },
    ])
  })

  it('rejects the same start and end', () => {
    expect(validate({ start: girl, end: girl })).toContainEqual({ kind: 'start-is-end', id: girl })
  })

  it('rejects a pair that is a clash', () => {
    // 2A → 3B is not on the chart
    expect(validate({ follows: [[bloodstream, dance]] })).toEqual([
      { kind: 'clash-pair', from: bloodstream, to: dance },
    ])
  })

  it('rejects branching and self-follows', () => {
    expect(
      validate({
        follows: [
          [brother, loveIs],
          [brother, girl],
        ],
      }),
    ).toContainEqual({ kind: 'branch-out', from: brother, to: [loveIs, girl] })
    expect(
      validate({
        follows: [
          [loveIs, girl],
          [brother, girl],
        ],
      }),
    ).toContainEqual({ kind: 'branch-in', to: girl, from: [loveIs, brother] })
    expect(validate({ follows: [[girl, girl]] })).toEqual([{ kind: 'self-follow', id: girl }])
  })

  it('rejects cycles once', () => {
    const errors = validate({
      follows: [
        [loveIs, girl],
        [girl, loveIs],
      ],
    })
    expect(errors.filter((e) => e.kind === 'cycle')).toHaveLength(1)
  })

  it('rejects a start with a required predecessor and an end with a successor', () => {
    expect(validate({ start: girl, follows: [[loveIs, girl]] })).toContainEqual({
      kind: 'start-has-predecessor',
      id: girl,
      predecessor: loveIs,
    })
    expect(validate({ end: loveIs, follows: [[loveIs, girl]] })).toContainEqual({
      kind: 'end-has-successor',
      id: loveIs,
      successor: girl,
    })
  })

  it('rejects a chain that joins start to end before the other tracks', () => {
    expect(validate({ start: loveIs, end: girl, follows: [[loveIs, girl]] })).toContainEqual({
      kind: 'chain-closes-early',
      ids: [loveIs, girl],
    })
  })
})

describe('describeConstraintError', () => {
  const name = (trackId: string) =>
    describeTrack(
      tracks.find((t) => t.id === trackId),
      trackId,
    )

  it('names tracks in both key notations', () => {
    expect(
      describeConstraintError({ kind: 'clash-pair', from: bloodstream, to: dance }, name),
    ).toBe(
      'Bloodstream (2A · E♭ minor) → I Wanna Dance with Somebody (Who Loves Me) (3B · D♭ major) is a clash on the chart, so it can’t be a required pair.',
    )
  })

  it('describes every kind', () => {
    const all: ConstraintError[] = [
      { kind: 'unknown-track', id: 'x' },
      { kind: 'excluded-in-constraint', id: girl },
      { kind: 'start-is-end', id: girl },
      { kind: 'self-follow', id: girl },
      { kind: 'branch-out', from: girl, to: [loveIs, brother] },
      { kind: 'branch-in', to: girl, from: [loveIs, brother] },
      { kind: 'cycle', ids: [girl, loveIs] },
      { kind: 'start-has-predecessor', id: girl, predecessor: loveIs },
      { kind: 'end-has-successor', id: girl, successor: loveIs },
      { kind: 'chain-closes-early', ids: [girl, loveIs] },
    ]
    for (const error of all) expect(describeConstraintError(error, name)).toMatch(/\S/)
    expect(describeConstraintError({ kind: 'unknown-track', id: 'x' }, name)).toContain(
      'an unknown track (x)',
    )
  })
})
