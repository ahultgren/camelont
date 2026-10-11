import { shallowRef } from 'vue'
import { usePlaylistReader, type PlaylistEntry, type PlaylistReading } from '@/features/playlists'
import { describeChange, diffPlaylist, updatePlaylist, type Dropped } from '../domain/playlist-diff'
import type { PlaylistCopy } from '../domain/set'
import type { MixSet, SetPlaylist, SetTrack } from '../domain/types'
import { useSetsDeps } from './deps'
import { useSetsStore } from './sets-store'

/** What a set says about one of its playlists after checking it against Spotify (§8.2). */
export type PlaylistNotice =
  | { kind: 'checking' }
  | { kind: 'unchanged' }
  | {
      kind: 'changed'
      added: SetTrack[]
      removed: SetTrack[]
      /** "3 new, 1 removed" */
      label: string
    }
  | {
      /** The stored copy stays in use. `failed`: Spotify couldn't be reached; try again. */
      kind: 'cantCheck'
      reason: 'gone' | 'notYours' | 'failed'
      message: string
    }

const KEEPS_COPY = 'The set keeps its stored copy.'

const CANT_CHECK: Record<'gone' | 'notYours', string> = {
  gone: `This playlist can’t be read from Spotify any more, so it can’t be checked for changes. ${KEEPS_COPY}`,
  notYours: `This playlist isn’t yours any more, and Spotify only shares the tracks of playlists you own or collaborate on, so it can’t be checked for changes. ${KEEPS_COPY}`,
}

const toSetTrack = ({ trackId, uri, title, artists, durationMs, imageUrl }: PlaylistEntry) => ({
  trackId,
  uri,
  title,
  artists,
  durationMs,
  imageUrl,
})

/** A playlist as just read from Spotify, as the copy a set stores. */
export function toPlaylistCopy(
  playlistId: string,
  reading: Extract<PlaylistReading, { kind: 'read' }>,
  readAt: number,
): PlaylistCopy {
  return {
    playlistId,
    name: reading.name,
    imageUrl: reading.imageUrl,
    tracks: reading.entries.map(toSetTrack),
    snapshotId: reading.snapshotId,
    readAt,
  }
}

/**
 * The change check (spec §8.2, U16). `check` reads each playlist of the set as it is in
 * Spotify now and says how it differs from the stored copy; nothing in the set changes
 * until `update` is called for a playlist. Only reads from Spotify, never writes.
 */
export function usePlaylistChanges(setId: string) {
  const sets = useSetsStore()
  const deps = useSetsDeps()
  const read = usePlaylistReader()
  const notices = shallowRef<ReadonlyMap<string, PlaylistNotice>>(new Map())
  /** The copies read by the last check that differ from the stored ones. */
  const fresh = new Map<string, PlaylistCopy>()
  let round = 0

  const note = (playlistId: string, notice: PlaylistNotice) => {
    notices.value = new Map(notices.value).set(playlistId, notice)
  }

  /** The notice for one playlist, and the copy that was read when it differs. */
  async function checkOne(
    playlist: SetPlaylist,
  ): Promise<{ notice: PlaylistNotice; copy?: PlaylistCopy }> {
    let reading: PlaylistReading
    try {
      reading = await read(playlist.playlistId, playlist.snapshotId)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      const message = `Spotify couldn’t be reached, so this playlist wasn’t checked for changes (${why}). ${KEEPS_COPY}`
      return { notice: { kind: 'cantCheck', reason: 'failed', message } }
    }
    if (reading.kind === 'unreadable') {
      const { reason } = reading
      return { notice: { kind: 'cantCheck', reason, message: CANT_CHECK[reason] } }
    }
    const set = sets.get(setId)
    if (reading.kind === 'unchanged' || !set) return { notice: { kind: 'unchanged' } }
    const copy = toPlaylistCopy(playlist.playlistId, reading, deps.now())
    const diff = diffPlaylist(set, playlist.playlistId, copy.tracks)
    const label = describeChange(diff)
    // The same tracks in another order, or under another name, are no change.
    if (label === null) return { notice: { kind: 'unchanged' } }
    return { notice: { kind: 'changed', added: diff.added, removed: diff.removed, label }, copy }
  }

  /** Checks every playlist of the set. A later check replaces an earlier one. */
  async function check(): Promise<void> {
    const set: MixSet | undefined = sets.get(setId)
    if (!set) return
    const mine = ++round
    fresh.clear()
    notices.value = new Map(set.playlists.map((p) => [p.playlistId, { kind: 'checking' }]))
    await Promise.all(
      set.playlists.map(async (playlist) => {
        const { notice, copy } = await checkOne(playlist)
        if (mine !== round) return
        if (copy) fresh.set(playlist.playlistId, copy)
        note(playlist.playlistId, notice)
      }),
    )
  }

  /**
   * Update (§8.2): the copy read by the check replaces the stored one. Returns what
   * went with the removed tracks (marks, mix rules), so it can be listed; null when
   * there is nothing to update.
   */
  function update(playlistId: string): Dropped | null {
    const copy = fresh.get(playlistId)
    const set = sets.get(setId)
    if (!copy || !set) return null
    const { dropped } = diffPlaylist(set, playlistId, copy.tracks)
    sets.update(setId, (current) => updatePlaylist(current, copy))
    fresh.delete(playlistId)
    note(playlistId, { kind: 'unchanged' })
    return dropped
  }

  return { notices, check, update }
}
