import { createHttpClient, paginate, type TokenSource } from '@/shared/api'
import {
  entryIds,
  type PlaylistContents,
  type PlaylistEntry,
  type PlaylistSummary,
} from '../domain/types'
import {
  CreatedPlaylistDto,
  MeDto,
  PlaylistItemsPageDto,
  PlaylistPageDto,
  isTrack,
  SnapshotDto,
  type PlaylistDto,
  type PlaylistItemDto,
} from './schemas'

export const SPOTIFY_API = 'https://api.spotify.com/v1'
/** Max URIs per add-items call. */
export const ADD_BATCH = 100

export interface SpotifyApi {
  listMyPlaylists(): Promise<PlaylistSummary[]>
  getPlaylistContents(playlistId: string): Promise<PlaylistContents>
  /** Always creates a new private playlist (decision #17). */
  createPrivatePlaylist(name: string, description: string): Promise<{ id: string; url: string }>
  addItems(playlistId: string, uris: readonly string[]): Promise<void>
}

export function toSummary(dto: PlaylistDto, myId: string): PlaylistSummary {
  return {
    id: dto.id,
    name: dto.name,
    imageUrl: dto.images?.[0]?.url ?? null,
    ownerName: dto.owner.display_name ?? dto.owner.id,
    trackCount: dto.items?.total ?? dto.tracks?.total ?? null,
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

  return {
    async listMyPlaylists() {
      const me = await http.request('/me', MeDto)
      const dtos = await paginate(
        (url) => http.request(url, PlaylistPageDto),
        '/me/playlists?limit=50',
      )
      return dtos.filter((d): d is PlaylistDto => d !== null).map((d) => toSummary(d, me.id))
    },

    async getPlaylistContents(playlistId) {
      const items = await paginate(
        (url) => http.request(url, PlaylistItemsPageDto),
        `/playlists/${encodeURIComponent(playlistId)}/items?limit=50`,
      )
      return toContents(items)
    },

    async createPrivatePlaylist(name, description) {
      const created = await http.request('/me/playlists', CreatedPlaylistDto, {
        method: 'POST',
        body: { name, description, public: false },
      })
      return { id: created.id, url: created.external_urls.spotify }
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
