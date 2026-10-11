import { describe, expect, it } from 'vitest'
import { describeSkipped, skippedCount } from './skipped'

describe('skipped items', () => {
  it('names what was left out, each kind once', () => {
    expect(describeSkipped({ localFiles: 2, episodes: 1, unavailable: 0 })).toBe(
      '2 local files, 1 episode',
    )
    expect(describeSkipped({ localFiles: 0, episodes: 0, unavailable: 1 })).toBe(
      '1 unavailable track',
    )
  })

  it('says nothing when nothing was skipped', () => {
    expect(describeSkipped({ localFiles: 0, episodes: 0, unavailable: 0 })).toBe('')
    expect(skippedCount({ localFiles: 0, episodes: 0, unavailable: 0 })).toBe(0)
  })

  it('counts every kind', () => {
    expect(skippedCount({ localFiles: 2, episodes: 1, unavailable: 3 })).toBe(6)
  })
})
