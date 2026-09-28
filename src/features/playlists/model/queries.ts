import { useMutation, useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useAuthStore } from '@/features/auth'
import { createSpotifyApi, type SpotifyApi } from '../api/spotify-api'

export function useSpotifyApi(): SpotifyApi {
  return createSpotifyApi(useAuthStore().tokenSource)
}

export function usePlaylists() {
  const api = useSpotifyApi()
  return useQuery({ queryKey: ['playlists'], queryFn: () => api.listMyPlaylists() })
}

export function usePlaylist(id: MaybeRefOrGetter<string>) {
  const playlists = usePlaylists()
  return computed(() => playlists.data.value?.find((p) => p.id === toValue(id)) ?? null)
}

export function usePlaylistContents(id: MaybeRefOrGetter<string>) {
  const api = useSpotifyApi()
  return useQuery({
    queryKey: ['playlist-contents', id],
    queryFn: () => api.getPlaylistContents(toValue(id)),
  })
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
