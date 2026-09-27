export interface PlaylistSummary {
  id: string
  name: string
  imageUrl: string | null
  ownerName: string
  trackCount: number | null
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

export const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}
