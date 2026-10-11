import type { MixRules } from './set'
import type { MixSet } from './types'

/**
 * Follow pairs as the workspace makes them (spec §9.1): "A is followed by B", one
 * follower and one leader per track, so pairs form chains and never branch or loop.
 */

type Follows = MixRules['follows']

export const followerOf = (follows: Follows, trackId: string): string | null =>
  follows.find(([from]) => from === trackId)?.[1] ?? null

export const leaderOf = (follows: Follows, trackId: string): string | null =>
  follows.find(([, to]) => to === trackId)?.[0] ?? null

/** Why a track can't be given a follower at all. */
export function armBlock(rules: MixRules, from: string): 'closer' | null {
  return rules.closer === from ? 'closer' : null
}

export type FollowBlock =
  /** A track can't follow itself. */
  | 'self'
  /** It already follows `from`: nothing would change. */
  | 'already'
  /** It already follows another track; a track has one leader. */
  | 'hasLeader'
  /** It leads up to `from` through other pairs: the chain would close on itself. */
  | 'cycle'
  /** The opening track follows nothing. */
  | 'opener'

/**
 * Why `to` can't be made the follower of `from`; null when it can. `from`'s present
 * follower doesn't count: a new one replaces it.
 */
export function followBlock(rules: MixRules, from: string, to: string): FollowBlock | null {
  if (from === to) return 'self'
  if (rules.opener === to) return 'opener'
  const leader = leaderOf(rules.follows, to)
  if (leader === from) return 'already'
  if (leader !== null) return 'hasLeader'
  const others = rules.follows.filter(([leaderId]) => leaderId !== from)
  const seen = new Set<string>()
  for (let at: string | null = to; at !== null && !seen.has(at); at = followerOf(others, at)) {
    if (at === from) return 'cycle'
    seen.add(at)
  }
  return null
}

/** "`from` is followed by `to`", in place of whatever followed `from` before. */
export function withFollower(set: MixSet, from: string, to: string): MixSet {
  if (followerOf(set.mix.follows, from) === to) return set
  const follows: MixSet['mix']['follows'] = [
    ...set.mix.follows.filter(([leader]) => leader !== from),
    [from, to],
  ]
  return { ...set, mix: { ...set.mix, follows } }
}
