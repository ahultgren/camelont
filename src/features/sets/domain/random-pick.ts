import { createPrng, hashString } from '@/shared/lib'
import type { PickRequest } from './select'

/**
 * The random pick method (spec §8.4): a stable draw. Every track has a rank that
 * depends only on the seed and its track ID, and the lowest ranks win. So the same seed
 * always gives the same picks, and a track joining or leaving the candidates changes
 * at most one pick. Reshuffle is a new seed.
 */

/** A track's place in the draw: uniform in [0, 1), the same every time. */
export const randomRank = (seed: number, trackId: string): number =>
  createPrng(hashString(`${seed}:${trackId}`)).next()

/** The `count` candidates with the lowest ranks, lowest first. */
export function randomPick(request: {
  seed: PickRequest['seed']
  count: PickRequest['count']
  candidates: readonly { trackId: string }[]
}): string[] {
  return request.candidates
    .map(({ trackId }) => ({ trackId, rank: randomRank(request.seed, trackId) }))
    .sort((a, b) => a.rank - b.rank || (a.trackId < b.trackId ? -1 : 1))
    .slice(0, Math.max(0, request.count))
    .map((ranked) => ranked.trackId)
}
