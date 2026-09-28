import { inject, type App, type InjectionKey } from 'vue'
import { createIndexedDbStore, type KeyValueStore } from '@/shared/storage'
import { createReccoBeatsProvider, type FeatureProvider } from '../api/reccobeats'
import {
  createFeaturesCache,
  createOverridesRepo,
  type FeaturesCache,
  type OverridesRepo,
} from '../api/repositories'

export interface TrackFeatureDeps {
  cache: FeaturesCache
  overrides: OverridesRepo
  provider: FeatureProvider
  now: () => number
}

const DEPS: InjectionKey<TrackFeatureDeps> = Symbol('camelont.track-features')

export interface TrackFeatureOptions {
  cacheStore?: KeyValueStore
  overridesStore?: KeyValueStore
  provider?: FeatureProvider
  now?: () => number
}

/** Wires storage (IndexedDB by default) and the provider (ReccoBeats by default). */
export function installTrackFeatures(app: App, options: TrackFeatureOptions = {}): void {
  app.provide(DEPS, {
    cache: createFeaturesCache(options.cacheStore ?? createIndexedDbStore('features')),
    overrides: createOverridesRepo(options.overridesStore ?? createIndexedDbStore('overrides')),
    provider: options.provider ?? createReccoBeatsProvider(),
    now: options.now ?? Date.now,
  })
}

export function useTrackFeatureDeps(): TrackFeatureDeps {
  const deps = inject(DEPS)
  if (!deps) throw new Error('installTrackFeatures() was not called')
  return deps
}
