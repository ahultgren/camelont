import { describe, expect, it } from 'vitest'
import wcs from '@/test/fixtures/wcs-set.json'
import {
  ALL_CAMELOT_KEYS,
  camelotParts,
  formatKey,
  fromPitchClass,
  keyHue,
  keyName,
  makeCamelot,
  parseCamelot,
  toPitchClass,
} from './camelot'

describe('parseCamelot', () => {
  it.each([
    ['8A', '8A'],
    ['12b', '12B'],
    [' 1A ', '1A'],
    ['01B', null],
    ['13A', null],
    ['0A', null],
    ['8C', null],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(parseCamelot(input)).toBe(expected)
  })
})

describe('ALL_CAMELOT_KEYS', () => {
  it('has the 24 distinct keys', () => {
    expect(new Set(ALL_CAMELOT_KEYS).size).toBe(24)
    expect(ALL_CAMELOT_KEYS.every((k) => parseCamelot(k) === k)).toBe(true)
  })
})

describe('camelotParts / makeCamelot', () => {
  it('round-trips', () => {
    for (const key of ALL_CAMELOT_KEYS) {
      const { n, mode } = camelotParts(key)
      expect(makeCamelot(n, mode)).toBe(key)
    }
  })
})

describe('fromPitchClass', () => {
  it.each([
    [9, 0, '8A'], // A minor
    [0, 1, '8B'], // C major
    [1, 0, '12A'], // C# minor
    [11, 1, '1B'], // B major
    [3, 0, '2A'], // Eb minor
    [8, 1, '4B'], // Ab major
  ] as const)('(%i, mode %i) → %s', (pitchClass, mode, expected) => {
    expect(fromPitchClass(pitchClass, mode)).toBe(expected)
  })

  it('returns null for unknown keys', () => {
    expect(fromPitchClass(-1, 1)).toBeNull()
    expect(fromPitchClass(12, 0)).toBeNull()
    expect(fromPitchClass(2.5, 0)).toBeNull()
  })

  it('is the inverse of toPitchClass', () => {
    for (const key of ALL_CAMELOT_KEYS) {
      const { pitchClass, mode } = toPitchClass(key)
      expect(fromPitchClass(pitchClass, mode)).toBe(key)
    }
  })
})

describe('keyName', () => {
  it('names keys like the approved reference charts', () => {
    expect(keyName('11B')).toBe('A major')
    expect(keyName('8A')).toBe('A minor')
    expect(keyName('3B')).toBe('D♭ major')
    expect(keyName('12A')).toBe('C♯ minor')
    expect(keyName('2B')).toBe('F♯ major')
    expect(keyName('1A')).toBe('A♭ minor')
  })

  it('agrees with every track in the WCS fixture', () => {
    for (const track of wcs.tracks) {
      const key = parseCamelot(track.camelot)
      expect(key).not.toBeNull()
      if (key) expect(keyName(key)).toBe(track.key.replace('b ', '♭ ').replace('#', '♯'))
    }
  })
})

describe('formatKey', () => {
  it('shows both notations', () => {
    expect(formatKey('11B')).toBe('11B · A major')
  })
})

describe('keyHue', () => {
  it('follows ((n − 1) × 30 + 330) mod 360, shared by A and B', () => {
    expect(keyHue('1A')).toBe(330)
    expect(keyHue('1B')).toBe(330)
    expect(keyHue('2A')).toBe(0)
    expect(keyHue('12B')).toBe(300)
  })
})
