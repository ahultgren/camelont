import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/features/auth'
import { createPlaylist, replacePlaylist } from '../api/save'
import { createSpotifyApi, type SpotifyApi } from '../api/spotify-api'
import type { CreateOutcome, PlaylistAccess, ReplaceOutcome, SaveRequest } from '../domain/types'

export function useSpotifyApi(): SpotifyApi {
  return createSpotifyApi(useAuthStore().tokenSource)
}

export function usePlaylists() {
  const api = useSpotifyApi()
  return useQuery({ queryKey: ['playlists'], queryFn: () => api.listMyPlaylists() })
}

/**
 * Reads a playlist as it is in Spotify now (see `PlaylistReading`): for the copy a set
 * stores and for checking that copy later. Not a query: a set decides when to look.
 */
export function usePlaylistReader() {
  const api = useSpotifyApi()
  return (playlistId: string, knownSnapshotId: string | null = null) =>
    api.readPlaylist(playlistId, knownSnapshotId)
}

/**
 * Writing a save to Spotify, and asking whose a playlist is before it is written to.
 * Which playlist may be written to is not decided here: only a set's own saved
 * playlist ever is (spec §8.5), and the set makes sure of that.
 */
export function usePlaylistSaver() {
  const api = useSpotifyApi()
  const queries = useQueryClient()
  // The user's playlists changed: a new one, or another name.
  const listChanged = () => void queries.invalidateQueries({ queryKey: ['playlists'] })
  return {
    access: (playlistId: string): Promise<PlaylistAccess> => api.playlistAccess(playlistId),
    async create(request: SaveRequest): Promise<CreateOutcome> {
      const outcome = await createPlaylist(api, request)
      if (outcome.ok || outcome.created) listChanged()
      return outcome
    },
    async replace(playlistId: string, request: SaveRequest): Promise<ReplaceOutcome> {
      const outcome = await replacePlaylist(api, playlistId, request)
      if (outcome.ok) listChanged()
      return outcome
    },
  }
}
