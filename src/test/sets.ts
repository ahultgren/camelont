import { addPlaylist, newSet, type MixSet, type PlaylistCopy } from '@/features/sets'
import { createMemoryStore, type KeyValueStore } from '@/shared/storage'

/** A playlist's stored copy with the given track IDs. */
export const playlistCopy = (
  playlistId: string,
  name: string,
  trackIds: string[],
): PlaylistCopy => ({
  playlistId,
  name,
  imageUrl: null,
  tracks: trackIds.map((trackId) => ({
    trackId,
    uri: `spotify:track:${trackId}`,
    title: trackId.toUpperCase(),
    artists: ['Artist'],
    durationMs: 200_000,
    imageUrl: null,
  })),
  snapshotId: null,
  readAt: 1,
  skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
})

/** A set as the store would have made it, last edited at `editedAt`. */
export function aSet(
  id: string,
  name: string,
  playlists: PlaylistCopy[],
  editedAt = 1,
  rest: Partial<MixSet> = {},
): MixSet {
  const set = playlists.reduce(
    (soFar, copy, i) => addPlaylist(soFar, copy, i + 1),
    newSet({ id, name, now: editedAt }),
  )
  return { ...set, ...rest }
}

/** Sets storage as a page load finds it; `raw` adds records exactly as given. */
export function setsStorage(sets: MixSet[], raw: Record<string, unknown> = {}): KeyValueStore {
  return createMemoryStore({
    ...Object.fromEntries(sets.map((set) => [set.id, { v: 1, data: set }])),
    ...raw,
  })
}
