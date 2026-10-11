import { describe, expect, it } from 'vitest'
import { armBlock, followBlock, followerOf, leaderOf, withFollower } from './follow'
import { newSet } from './set'
import type { MixSet } from './types'

const rules = (
  follows: [string, string][],
  opener: string | null = null,
  closer: string | null = null,
) => ({
  opener,
  closer,
  follows,
})
const setWith = (follows: [string, string][]): MixSet => {
  const set = newSet({ id: 's', name: 'S', now: 1 })
  return { ...set, mix: { ...set.mix, follows } }
}

describe('follow pairs', () => {
  it('finds a track’s follower and leader', () => {
    const follows: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
    ]
    expect(followerOf(follows, 'a')).toBe('b')
    expect(followerOf(follows, 'c')).toBeNull()
    expect(leaderOf(follows, 'c')).toBe('b')
    expect(leaderOf(follows, 'a')).toBeNull()
  })

  it('lets any track follow one that is free', () => {
    expect(followBlock(rules([]), 'a', 'b')).toBeNull()
    // Extending a chain from its last track.
    expect(followBlock(rules([['a', 'b']]), 'b', 'c')).toBeNull()
  })

  it('refuses a track following itself or what it follows already', () => {
    expect(followBlock(rules([]), 'a', 'a')).toBe('self')
    expect(followBlock(rules([['a', 'b']]), 'a', 'b')).toBe('already')
  })

  it('refuses a second leader for a track', () => {
    expect(followBlock(rules([['a', 'b']]), 'c', 'b')).toBe('hasLeader')
  })

  it('refuses closing a chain on itself', () => {
    const chain = rules([
      ['a', 'b'],
      ['b', 'c'],
    ])
    expect(followBlock(chain, 'c', 'a')).toBe('cycle')
    expect(followBlock(rules([['a', 'b']]), 'b', 'a')).toBe('cycle')
  })

  it('doesn’t count the follower that would be replaced', () => {
    // a → b → c; giving a the follower c drops a → b, and c still follows b.
    const chain = rules([
      ['a', 'b'],
      ['b', 'c'],
    ])
    expect(followBlock(chain, 'a', 'c')).toBe('hasLeader')
    // a → b: giving a another follower is allowed, it replaces b.
    expect(followBlock(rules([['a', 'b']]), 'a', 'c')).toBeNull()
  })

  it('keeps the opener first and the closer last', () => {
    expect(followBlock(rules([], 'o'), 'a', 'o')).toBe('opener')
    expect(armBlock(rules([], null, 'z'), 'z')).toBe('closer')
    expect(armBlock(rules([], 'o', 'z'), 'o')).toBeNull()
  })

  it('gives a track its follower, replacing the one it had', () => {
    const set = setWith([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(withFollower(set, 'a', 'x').mix.follows).toEqual([
      ['c', 'd'],
      ['a', 'x'],
    ])
    expect(withFollower(set, 'e', 'f').mix.follows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ])
    expect(withFollower(set, 'a', 'b')).toBe(set)
  })
})
