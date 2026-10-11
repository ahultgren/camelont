import type { PlaylistCopy } from './set'
import type { MixSet, MixSettings, SetPlaylist, SetTrack, TrackMark } from './types'

/**
 * What a change to a set's playlists takes with it (spec §8.2): a track that leaves
 * the pool loses its mark, and every mix rule naming it goes too. The same answer
 * serves the notice ("this will be dropped") and the change itself.
 */

export type DroppedRule =
  | { kind: 'opener'; trackId: string }
  | { kind: 'closer'; trackId: string }
  | { kind: 'follow'; from: string; to: string }

export interface Dropped {
  /** Tracks that leave the pool: no other playlist of the set has them. */
  tracks: SetTrack[]
  marks: { trackId: string; mark: TrackMark }[]
  rules: DroppedRule[]
}

export interface PlaylistDiff {
  /** In the freshly read list but not in the stored copy, each once. */
  added: SetTrack[]
  /** In the stored copy but not in the freshly read list, each once. */
  removed: SetTrack[]
  /** What updating would drop. A removed track another playlist still has drops nothing. */
  dropped: Dropped
}

/** Each track once, at its first place. */
function uniqueTracks(tracks: readonly SetTrack[]): SetTrack[] {
  const seen = new Set<string>()
  return tracks.filter((track) => {
    if (seen.has(track.trackId)) return false
    seen.add(track.trackId)
    return true
  })
}

const trackIdsOf = (playlists: readonly { tracks: readonly SetTrack[] }[]): Set<string> =>
  new Set(playlists.flatMap((playlist) => playlist.tracks.map((track) => track.trackId)))

/** What goes when the set's playlists become `next`. */
function droppedBy(set: MixSet, next: readonly { tracks: readonly SetTrack[] }[]): Dropped {
  const staying = trackIdsOf(next)
  const tracks = uniqueTracks(set.playlists.flatMap((playlist) => playlist.tracks)).filter(
    (track) => !staying.has(track.trackId),
  )
  const leaving = new Set(tracks.map((track) => track.trackId))
  const { opener, closer, follows } = set.mix
  return {
    tracks,
    marks: Object.entries(set.marks)
      .filter(([trackId]) => leaving.has(trackId))
      .map(([trackId, mark]) => ({ trackId, mark })),
    rules: [
      ...(opener !== null && leaving.has(opener)
        ? [{ kind: 'opener', trackId: opener } as const]
        : []),
      ...(closer !== null && leaving.has(closer)
        ? [{ kind: 'closer', trackId: closer } as const]
        : []),
      ...follows
        .filter(([from, to]) => leaving.has(from) || leaving.has(to))
        .map(([from, to]) => ({ kind: 'follow', from, to }) as const),
    ],
  }
}

/** The set with new playlists, minus the marks and rules of the tracks that left. */
function withPlaylists(set: MixSet, playlists: SetPlaylist[]): MixSet {
  const leaving = new Set(droppedBy(set, playlists).tracks.map((track) => track.trackId))
  const keeps = (trackId: string | null) =>
    trackId !== null && leaving.has(trackId) ? null : trackId
  const mix: MixSettings = {
    ...set.mix,
    opener: keeps(set.mix.opener),
    closer: keeps(set.mix.closer),
    follows: set.mix.follows.filter(([from, to]) => !leaving.has(from) && !leaving.has(to)),
  }
  const marks = Object.fromEntries(
    Object.entries(set.marks).filter(([trackId]) => !leaving.has(trackId)),
  )
  return { ...set, playlists, marks, mix }
}

const replaced = (set: MixSet, playlistId: string, tracks: readonly SetTrack[]) =>
  set.playlists.map((playlist) =>
    playlist.playlistId === playlistId ? { ...playlist, tracks: [...tracks] } : playlist,
  )

/** Compares a playlist's stored copy with its track list as read from Spotify now. */
export function diffPlaylist(
  set: MixSet,
  playlistId: string,
  fresh: readonly SetTrack[],
): PlaylistDiff {
  const stored = set.playlists.find((playlist) => playlist.playlistId === playlistId)?.tracks ?? []
  const storedIds = trackIdsOf([{ tracks: stored }])
  const freshIds = trackIdsOf([{ tracks: fresh }])
  return {
    added: uniqueTracks(fresh).filter((track) => !storedIds.has(track.trackId)),
    removed: uniqueTracks(stored).filter((track) => !freshIds.has(track.trackId)),
    dropped: droppedBy(set, replaced(set, playlistId, fresh)),
  }
}

/** The change notice in words, e.g. "3 new, 1 removed"; null when no track came or went. */
export function describeChange(diff: Pick<PlaylistDiff, 'added' | 'removed'>): string | null {
  const parts = [
    ...(diff.added.length > 0 ? [`${diff.added.length} new`] : []),
    ...(diff.removed.length > 0 ? [`${diff.removed.length} removed`] : []),
  ]
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Update (§8.2): the freshly read copy replaces the stored one, keeping the playlist's
 * place and track choices. Marks and rules of tracks that left the pool are dropped,
 * exactly as `diffPlaylist` listed them.
 */
export function updatePlaylist(set: MixSet, fresh: PlaylistCopy): MixSet {
  if (!set.playlists.some((playlist) => playlist.playlistId === fresh.playlistId)) return set
  return withPlaylists(
    set,
    set.playlists.map((playlist) =>
      playlist.playlistId === fresh.playlistId ? { ...fresh, choices: playlist.choices } : playlist,
    ),
  )
}

const without = (set: MixSet, playlistId: string) =>
  set.playlists.filter((playlist) => playlist.playlistId !== playlistId)

/** What goes with a playlist when it is removed from the set. */
export const playlistRemoval = (set: MixSet, playlistId: string): Dropped =>
  droppedBy(set, without(set, playlistId))

/** Removes a playlist with its tracks, their marks and the mix rules naming them. */
export function removePlaylist(set: MixSet, playlistId: string): MixSet {
  const playlists = without(set, playlistId)
  return playlists.length === set.playlists.length ? set : withPlaylists(set, playlists)
}
