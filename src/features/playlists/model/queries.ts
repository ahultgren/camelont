import { useMutation, useQuery } from '@tanstack/vue-query'
import { useAuthStore } from '@/features/auth'
import { createSpotifyApi, type SpotifyApi } from '../api/spotify-api'

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

export interface SaveMixInput {
  name: string
  description: string
  uris: readonly string[]
}

/** Creates a new private playlist with the tracks in order; never touches the source. */
export function useSaveMix() {
  const api = useSpotifyApi()
  return useMutation({
    mutationFn: async ({ name, description, uris }: SaveMixInput) => {
      const created = await api.createPrivatePlaylist(name, description)
      await api.addItems(created.id, uris)
      return created
    },
  })
}
