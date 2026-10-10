import { describe, expect, it } from 'vitest'
import { hashString } from './hash'

describe('hashString', () => {
  it('is the 32-bit FNV-1a hash', () => {
    expect(hashString('')).toBe(0x811c9dc5)
    expect(hashString('a')).toBe(0xe40c292c)
    expect(hashString('foobar')).toBe(0xbf9cf968)
  })

  it('gives the same number for the same text and tells similar texts apart', () => {
    expect(hashString('7:track-a')).toBe(hashString('7:track-a'))
    expect(hashString('7:track-a')).not.toBe(hashString('7:track-b'))
    expect(hashString('7:track-a')).not.toBe(hashString('8:track-a'))
  })

  it('stays an unsigned 32-bit integer', () => {
    for (const text of ['x', 'Bloodstream', '4uLU6hMCjMI75M1A2tKUQC', 'åäö ✓']) {
      const hash = hashString(text)
      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThan(2 ** 32)
    }
  })
})
