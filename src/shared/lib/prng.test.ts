import { describe, expect, it } from 'vitest'
import { createPrng } from './prng'

describe('createPrng', () => {
  it('is deterministic for a seed', () => {
    const a = createPrng(42)
    const b = createPrng(42)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('differs between seeds', () => {
    expect(createPrng(1).next()).not.toBe(createPrng(2).next())
  })

  it('stays in [0, 1)', () => {
    const rng = createPrng(7)
    for (let i = 0; i < 1000; i++) {
      const x = rng.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('int(n) covers 0..n−1', () => {
    const rng = createPrng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(rng.int(4))
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })

  it('shuffle keeps the elements and does not mutate', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = createPrng(9).shuffle(input)
    expect(out).not.toBe(input)
    expect([...out].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })
})
