import { ApiError, createHttpClient, paginate, type TokenSource } from '@/shared/api'
import {
  entryIds,
  type PlaylistAccess,
  type PlaylistContents,
  type PlaylistEntry,
  type PlaylistReading,
  type PlaylistSummary,
} from '../domain/types'
import {
  CreatedPlaylistDto,
  MeDto,
  PlaylistDto,
  PlaylistItemsPageDto,
  PlaylistPageDto,
  isTrack,
  SnapshotDto,
  WriteAckDto,
  type PlaylistItemDto,
} from './schemas'

export const SPOTIFY_API = 'https://api.spotify.com/v1'
/** Max URIs per add-items call. */
export const ADD_BATCH = 100

export interface SpotifyApi {
  listMyPlaylists(): Promise<PlaylistSummary[]>
  getPlaylistContents(playlistId: string): Promise<PlaylistContents>
  /**
   * A playlist as it is now, for a set's stored copy and its change check (spec §8.2).
   * A playlist still at `knownSnapshotId` is not read again. Reads only; throws when
   * Spotify can't be reached.
   */
  readPlaylist(playlistId: string, knownSnapshotId: string | null): Promise<PlaylistReading>
  /** Whose the playlist is now. Reads only; throws when Spotify can't be reached. */
  playlistAccess(playlistId: string): Promise<PlaylistAccess>
  /** Always creates a new private playlist (decision #17). */
  createPrivatePlaylist(name: string, description: string): Promise<{ id: string; url: string }>
  /** Appends, in batches of 100. */
  addItems(playlistId: string, uris: readonly string[]): Promise<void>
  /**
   * Replaces a playlist's tracks with these, at most 100 (`PUT …/items`); the rest are
   * added with `addItems`. Only ever called for a playlist a set's own save created
   * (spec §8.5). Unverified against the Feb 2026 API.
   */
  setItems(playlistId: string, uris: readonly string[]): Promise<void>
  /** Changes a playlist's name and description (`PUT /playlists/{id}`). Unverified too. */
  updateDetails(playlistId: string, details: { name: string; description: string }): Promise<void>
}

export function toSummary(dto: PlaylistDto, myId: string): PlaylistSummary {
  return {
    id: dto.id,
    name: dto.name,
    imageUrl: dto.images?.[0]?.url ?? null,
    ownerName: dto.owner.display_name ?? dto.owner.id,
    trackCount: dto.items?.total ?? dto.tracks?.total ?? null,
    owned: dto.owner.id === myId,
    canMix: dto.owner.id === myId || dto.collaborative,
    url: dto.external_urls?.spotify ?? null,
  }
}

/** Maps playlist items to entries, skipping local files, episodes and removed tracks. */
export function toContents(items: readonly PlaylistItemDto[]): PlaylistContents {
  const skipped = { localFiles: 0, episodes: 0, unavailable: 0 }
  const tracks: Omit<PlaylistEntry, 'entryId'>[] = []
  for (const row of items) {
    const item = row.item
    if (item === null) {
      if (row.is_local) skipped.localFiles++
      else skipped.unavailable++
    } else if (!isTrack(item)) {
      if (item.type === 'track') skipped.unavailable++
      else skipped.episodes++
    } else if (row.is_local || item.is_local) skipped.localFiles++
    else if (item.id === null) skipped.unavailable++
    else {
      tracks.push({
        trackId: item.id,
        uri: item.uri,
        title: item.name,
        artists: item.artists.map((a) => a.name),
        durationMs: item.duration_ms,
        imageUrl: item.album?.images?.at(-1)?.url ?? null,
      })
    }
  }
  const ids = entryIds(tracks.map((t) => t.trackId))
  return {
    entries: tracks.map((t, i) => ({ ...t, entryId: ids[i] ?? t.trackId })),
    skipped,
  }
}

/** Thin Spotify Web API client for the Feb 2026 routes (no SDK, decision #15). */
export function createSpotifyApi(auth: TokenSource, fetchImpl?: typeof fetch): SpotifyApi {
  const http = createHttpClient({
    baseUrl: SPOTIFY_API,
    auth,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })

  // Who is logged in doesn't change under a client, so it is asked once.
  let me: Promise<{ id: string }> | null = null
  const whoAmI = () => {
    me ??= http.request('/me', MeDto).catch((error: unknown) => {
      me = null
      throw error
    })
    return me
  }
  /** Spotify answers 404 for a playlist that is gone and 403 for one I may not see. */
  const isGone = (error: unknown) =>
    error instanceof ApiError &&
    error.kind === 'http' &&
    (error.status === 404 || error.status === 403)

  const getPlaylistContents = async (playlistId: string) => {
    const items = await paginate(
      (url) => http.request(url, PlaylistItemsPageDto),
      `/playlists/${encodeURIComponent(playlistId)}/items?limit=50`,
    )
    return toContents(items)
  }

  return {
    async listMyPlaylists() {
      const me = await http.request('/me', MeDto)
      const dtos = await paginate(
        (url) => http.request(url, PlaylistPageDto),
        '/me/playlists?limit=50',
      )
      return dtos.filter((d): d is PlaylistDto => d !== null).map((d) => toSummary(d, me.id))
    },

    getPlaylistContents,

    async readPlaylist(playlistId, knownSnapshotId) {
      let dto: PlaylistDto
      try {
        dto = await http.request(`/playlists/${encodeURIComponent(playlistId)}`, PlaylistDto)
      } catch (error) {
        if (isGone(error)) return { kind: 'unreadable', reason: 'gone' }
        throw error
      }
      // A followed playlist comes back with no tracks at all, which would read as
      // "everything was removed".
      const summary = toSummary(dto, (await whoAmI()).id)
      if (!summary.canMix) return { kind: 'unreadable', reason: 'notYours' }
      const snapshotId = dto.snapshot_id ?? null
      if (snapshotId !== null && snapshotId === knownSnapshotId) return { kind: 'unchanged' }
      const contents = await getPlaylistContents(playlistId)
      return {
        kind: 'read',
        name: summary.name,
        imageUrl: summary.imageUrl,
        snapshotId,
        ...contents,
      }
    },

    async playlistAccess(playlistId) {
      let dto: PlaylistDto
      try {
        dto = await http.request(`/playlists/${encodeURIComponent(playlistId)}`, PlaylistDto)
      } catch (error) {
        if (isGone(error)) return { kind: 'gone' }
        throw error
      }
      const summary = toSummary(dto, (await whoAmI()).id)
      return summary.owned
        ? { kind: 'mine', name: summary.name, url: summary.url }
        : { kind: 'notYours' }
    },

    async createPrivatePlaylist(name, description) {
      const created = await http.request('/me/playlists', CreatedPlaylistDto, {
        method: 'POST',
        body: { name, description, public: false },
      })
      return { id: created.id, url: created.external_urls.spotify }
    },

    async setItems(playlistId, uris) {
      await http.request(`/playlists/${encodeURIComponent(playlistId)}/items`, WriteAckDto, {
        method: 'PUT',
        body: { uris: uris.slice(0, ADD_BATCH) },
      })
    },

    async updateDetails(playlistId, { name, description }) {
      await http.request(`/playlists/${encodeURIComponent(playlistId)}`, WriteAckDto, {
        method: 'PUT',
        body: { name, description },
      })
    },

    async addItems(playlistId, uris) {
      for (let i = 0; i < uris.length; i += ADD_BATCH) {
        await http.request(`/playlists/${encodeURIComponent(playlistId)}/items`, SnapshotDto, {
          method: 'POST',
          body: { uris: uris.slice(i, i + ADD_BATCH) },
        })
      }
    },
  }
}
