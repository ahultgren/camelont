import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { RECCOBEATS_BATCH } from '../api/reccobeats'
import {
  mergeFeatures,
  needsFetch,
  type FetchedFeatures,
  type TrackFeatures,
} from '../domain/features'
import { useTrackFeatureDeps } from './deps'
import { useOverridesStore } from './overrides-store'

export interface FetchResult {
  fetched: Map<string, FetchedFeatures>
  /** Set when some batches failed; those tracks stay without data until a retry. */
  providerError: string | null
}

/**
 * Key/BPM for a set of tracks: cached answers first, the provider for the rest (in
 * batches; a failed batch degrades to missing data), merged with overrides.
 */
export function useTrackFeatures(trackIds: MaybeRefOrGetter<readonly string[]>) {
  const deps = useTrackFeatureDeps()
  const overrides = useOverridesStore()
  const ids = computed(() => [...new Set(toValue(trackIds))].sort())

  const query = useQuery({
    queryKey: ['track-features', ids],
    staleTime: Infinity,
    enabled: computed(() => ids.value.length > 0),
    queryFn: async (): Promise<FetchResult> => {
      const now = deps.now()
      const fetched = await deps.cache.getMany(ids.value)
      const missing = ids.value.filter((id) => needsFetch(fetched.get(id), now))
      let providerError: string | null = null
      for (let i = 0; i < missing.length; i += RECCOBEATS_BATCH) {
        try {
          const answers = await deps.provider.fetch(missing.slice(i, i + RECCOBEATS_BATCH), now)
          for (const a of answers) fetched.set(a.trackId, a)
          await deps.cache.putMany(answers)
        } catch (e) {
          providerError = e instanceof Error ? e.message : 'ReccoBeats is unavailable'
        }
      }
      return { fetched, providerError }
    },
  })

  const features = computed(() => {
    const out = new Map<string, TrackFeatures>()
    for (const id of ids.value) {
      out.set(id, mergeFeatures(id, query.data.value?.fetched.get(id), overrides.byTrack.get(id)))
    }
    return out
  })

  return {
    features,
    isLoading: computed(() => query.isPending.value && ids.value.length > 0),
    providerError: computed(() => query.data.value?.providerError ?? null),
    retry: () => query.refetch(),
  }
}
