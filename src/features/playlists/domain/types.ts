export interface PlaylistSummary {
  id: string
  name: string
  imageUrl: string | null
  ownerName: string
  trackCount: number | null
  /** The logged-in user owns it (a collaborative playlist of someone else's is not). */
  owned: boolean
  /** Owned or collaborative: Spotify returns items only for these. */
  canMix: boolean
  url: string | null
}

/** One entry in a playlist. Duplicates of a track are distinct entries. */
export interface PlaylistEntry {
  /** Position-independent: the track ID plus its occurrence, e.g. `abc…#2`. */
  entryId: string
  trackId: string
  uri: string
  title: string
  artists: string[]
  durationMs: number
  imageUrl: string | null
}

export interface SkippedItems {
  localFiles: number
  episodes: number
  unavailable: number
}

export interface PlaylistContents {
  entries: PlaylistEntry[]
  skipped: SkippedItems
}

/**
 * A playlist as it is in Spotify now, read for a set that keeps its own copy (spec §8.2).
 * `unchanged`: still at the snapshot the caller knows, so its tracks were not read.
 * `unreadable`: it is gone, or it is no longer mine (Spotify gives no tracks then).
 */
export type PlaylistReading =
  | { kind: 'unchanged' }
  | ({
      kind: 'read'
      name: string
      imageUrl: string | null
      /** Spotify's `snapshot_id`; null when it gave none. */
      snapshotId: string | null
    } & PlaylistContents)
  | { kind: 'unreadable'; reason: 'gone' | 'notYours' }

/** Whose a playlist is now, asked before it is written to. */
export type PlaylistAccess =
  | { kind: 'mine'; name: string; url: string | null }
  /** It exists, but the logged-in user doesn't own it. */
  | { kind: 'notYours' }
  /** Spotify no longer has it, or won't show it. */
  | { kind: 'gone' }

/** What a save writes: the playlist's name and description, and its tracks in order. */
export interface SaveRequest {
  name: string
  description: string
  uris: readonly string[]
}

/**
 * Why a write to Spotify didn't go through. `reason` is what Spotify (or the network)
 * said.
 * - `unavailable`: Spotify doesn't offer the route (404 or 405); nothing was written.
 * - `forbidden`: Spotify refused (403), e.g. the playlist is public now and the app may
 *   only change private ones; nothing was written.
 * - `failed`: anything else before the first write; nothing was written.
 * - `incomplete`: the playlist was written to, but not all of its tracks are in.
 */
export interface WriteFailure {
  ok: false
  kind: 'unavailable' | 'forbidden' | 'failed' | 'incomplete'
  reason: string
}

export type CreateOutcome =
  | { ok: true; id: string; url: string }
  /** `created`: the playlist exists in Spotify although the save fell short. */
  | (WriteFailure & { created: { id: string; url: string } | null })

export type ReplaceOutcome =
  /** `detailsFailed`: the tracks are in, but the name and description weren't taken. */
  { ok: true; detailsFailed: string | null } | WriteFailure

/** Why a playlist can't be mixed (followed, not owned). */
export const FOLLOWED_REASON =
  'Spotify only shares the tracks of playlists you own or collaborate on. Copy this playlist into one of your own in Spotify first.'

export function entryIds(trackIds: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return trackIds.map((id) => {
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    return n === 1 ? id : `${id}#${String(n)}`
  })
}
