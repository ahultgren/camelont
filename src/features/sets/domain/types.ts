/**
 * A set: the unit of work (spec §8). The sets feature defines its own shapes; pages map
 * playlists, track features and mix results to and from them.
 */

/** A track in a playlist's stored copy. Sameness is the Spotify track ID. */
export interface SetTrack {
  trackId: string
  uri: string
  title: string
  artists: string[]
  durationMs: number
  imageUrl: string | null
}

export type PickMethod = 'random' | 'bestFit'

/** Playlist items that can't be mixed and were left out when the copy was read. */
export interface SkippedItems {
  localFiles: number
  episodes: number
  unavailable: number
}

export const NOTHING_SKIPPED: SkippedItems = { localFiles: 0, episodes: 0, unavailable: 0 }

/** What one playlist contributes (spec §8.3–8.4). */
export interface TrackChoices {
  /** Inclusive, on the saved BPM. Null leaves that end open. */
  bpmMin: number | null
  bpmMax: number | null
  /** The most tracks the playlist contributes. Null is no limit. */
  limit: number | null
  pick: PickMethod
  /** Seed of the random pick. Reshuffle is a new seed. */
  seed: number
}

export interface SetPlaylist {
  /** Spotify playlist ID. */
  playlistId: string
  name: string
  imageUrl: string | null
  /** The stored copy, as read from Spotify (a track may repeat). */
  tracks: SetTrack[]
  /** Spotify's `snapshot_id` when the copy was read; null if it wasn't given. */
  snapshotId: string | null
  readAt: number
  /** What the copy leaves out: items Spotify lists that aren't tracks to mix. */
  skipped: SkippedItems
  choices: TrackChoices
}

export type TrackMark = 'mustInclude' | 'exclude'

export type SetArc = 'none' | 'twoWaves' | 'steadyBuild'

/** Mix rules and the arc choice (spec §5.3–5.4). Tracks are named by track ID. */
export interface MixSettings {
  opener: string | null
  closer: string | null
  /** "A must be followed by B" pairs. */
  follows: [from: string, to: string][]
  arc: SetArc
}

/** The alternative the user chose: its track IDs in mix order. */
export interface ChosenMix {
  order: string[]
}

/** The last save to Spotify, with what was written so later changes can be told. */
export interface LastSave {
  /**
   * The Spotify playlist the save wrote: the only one a later save may replace. Null
   * for a save recorded before IDs were, when its link doesn't give one.
   */
  playlistId: string | null
  url: string
  savedAt: number
  name: string
  order: string[]
}

export interface MixSet {
  id: string
  name: string
  createdAt: number
  editedAt: number
  /** In the order they were added. */
  playlists: SetPlaylist[]
  /** Per track ID. A track is in a set at most once, so marks belong to the set. */
  marks: Record<string, TrackMark>
  mix: MixSettings
  chosenMix: ChosenMix | null
  lastSave: LastSave | null
}
