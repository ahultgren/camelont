import type { MixSet, SetPlaylist } from '../domain/types'

/** How many different tracks the playlists hold: a track counts once (spec §8.2). */
export function poolSize(playlists: readonly SetPlaylist[]): number {
  return new Set(playlists.flatMap((playlist) => playlist.tracks.map((track) => track.trackId)))
    .size
}

const plural = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count === 1 ? '' : 's'}`

/**
 * A set's size without its key and BPM data: the chosen mix when there is one,
 * otherwise the pool, each named as what it is.
 */
export function trackCountLabel(set: MixSet): string {
  return set.chosenMix
    ? `${plural(set.chosenMix.order.length, 'track')} in the mix`
    : `${plural(poolSize(set.playlists), 'track')} in the pool`
}
