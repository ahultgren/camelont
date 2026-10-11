import type { LastSave, MixSet } from './types'

/**
 * Saving a set to Spotify (spec §8.5): what the last save was, which playlist a save
 * may replace, and whether a name is taken. Replacing is only ever about the playlist
 * the set's own last save created; these rules are the first half of that check, the
 * other half (it still exists and is still the user's) is asked of Spotify.
 */

const PLAYLIST_URL = /\/playlist\/([A-Za-z0-9]+)/

/** The playlist ID in a Spotify playlist link; null when the link isn't one. */
export const playlistIdFromUrl = (url: string): string | null => PLAYLIST_URL.exec(url)?.[1] ?? null

/** Why the playlist of a set's last save can't be replaced, as far as the sets tell. */
export type ReplaceRefusal =
  /** The save was recorded before playlist IDs were, and its link doesn't give one. */
  | { kind: 'unknownPlaylist' }
  /** A set on this device draws from that playlist: sources are never written to. */
  | { kind: 'isSource'; setName: string }

/**
 * Whether the sets on this device allow the last save's playlist to be replaced; null
 * when they do. `sets` is every set on the device, the saving one included: a saved
 * playlist that was later added to a set as a source is a source.
 */
export function replaceRefusal(lastSave: LastSave, sets: readonly MixSet[]): ReplaceRefusal | null {
  const { playlistId } = lastSave
  if (playlistId === null) return { kind: 'unknownPlaylist' }
  const drawing = sets.find((set) =>
    set.playlists.some((playlist) => playlist.playlistId === playlistId),
  )
  return drawing ? { kind: 'isSource', setName: drawing.name } : null
}

export function describeRefusal(refusal: ReplaceRefusal): string {
  switch (refusal.kind) {
    case 'unknownPlaylist':
      return 'The playlist saved before can’t be told from its link, so this saves a new one.'
    case 'isSource':
      return `The playlist saved before is a source of the set “${refusal.setName}”, and a source playlist is never changed.`
  }
}

const folded = (name: string): string => name.trim().toLowerCase()

/** Names are the same when they differ only in case or in spaces around them. */
export const sameName = (a: string, b: string): boolean => folded(a) === folded(b)

/**
 * The first of the playlists that already has this name. `except` is a playlist that
 * doesn't count: the one about to be replaced keeps its own name.
 */
export function namesake<Playlist extends { id: string; name: string }>(
  name: string,
  playlists: readonly Playlist[],
  except: string | null = null,
): Playlist | null {
  if (folded(name) === '') return null
  return (
    playlists.find((playlist) => playlist.id !== except && sameName(playlist.name, name)) ?? null
  )
}

/** How a save writes: over the playlist the set saved before, or into a new one. */
export type SaveMode = 'replace' | 'create'

/** Why a write didn't go through, as the playlists feature reports it. */
export type SaveFailureKind = 'unavailable' | 'forbidden' | 'failed' | 'incomplete'

/**
 * A failed save in words: what happened, what state the playlist is in, and what can
 * be done. `name` is the playlist's name, `reason` what Spotify said.
 */
export function describeFailure(
  mode: SaveMode,
  kind: SaveFailureKind,
  name: string,
  reason: string,
): string {
  const why = reason ? ` (${reason})` : ''
  if (mode === 'create') {
    return kind === 'incomplete'
      ? `“${name}” was created, but Spotify stopped taking its tracks${why}, so it is incomplete. Try again to replace it from the start.`
      : `The playlist couldn’t be created${why}. Nothing in Spotify changed.`
  }
  switch (kind) {
    case 'unavailable':
      return `Spotify doesn’t accept replacing a playlist’s tracks${why}, so replacing isn’t available. “${name}” is as it was. You can save as a new playlist instead.`
    case 'forbidden':
      return `Spotify refused to change “${name}”${why}. Camelont may only change private playlists: if you made it public, make it private again in Spotify, or save as a new playlist. Nothing was changed.`
    case 'incomplete':
      return `“${name}” is incomplete: its old tracks are gone and Spotify stopped taking the new ones${why}. Try again to replace it from the start.`
    case 'failed':
      return `“${name}” couldn’t be replaced${why}. Nothing was changed.`
  }
}
