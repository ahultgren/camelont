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
  /** The track IDs this answers, joined: tells an answer for another list apart. */
  idsKey: string
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
  const idsKey = computed(() => ids.value.join(','))

  const query = useQuery({
    queryKey: ['track-features', ids],
    staleTime: Infinity,
    enabled: computed(() => ids.value.length > 0),
    queryFn: async (): Promise<FetchResult> => {
      const now = deps.now()
      const requested = ids.value
      const requestedKey = idsKey.value
      const fetched = await deps.cache.getMany(requested)
      const missing = requested.filter((id) => needsFetch(fetched.get(id), now))
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
      return { idsKey: requestedKey, fetched, providerError }
    },
  })
  // When the list changes, the query still holds the old list's answer until it has
  // caught up. That answer is not an answer for the new tracks.
  const answered = computed(() => query.data.value?.idsKey === idsKey.value)

  const features = computed(() => {
    const out = new Map<string, TrackFeatures>()
    for (const id of ids.value) {
      out.set(id, mergeFeatures(id, query.data.value?.fetched.get(id), overrides.byTrack.get(id)))
    }
    return out
  })

  return {
    features,
    /** True from the moment the list changes until the data for that list is there. */
    isLoading: computed(() => ids.value.length > 0 && !answered.value && !query.isError.value),
    providerError: computed(() => query.data.value?.providerError ?? null),
    retry: () => query.refetch(),
  }
}
