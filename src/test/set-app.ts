import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp, effectScope } from 'vue'
import { installAuth } from '@/features/auth'
import {
  inlineFitClient,
  inlineSolverClient,
  installMixing,
  type FitClient,
  type SolverClient,
} from '@/features/mixing'
import { installSets } from '@/features/sets'
import { installTrackFeatures, type TrackFeatureOptions } from '@/features/track-features'
import { createMemoryStore, type KeyValueStore } from '@/shared/storage'
import { loggedInStorage, MemoryStorage } from './storage'

export interface SetAppOptions {
  /** Where sets are stored; pass the same one again to "reload the page". */
  setsStore?: KeyValueStore
  overridesStore?: KeyValueStore
  cacheStore?: KeyValueStore
  /** Key and BPM data; without one, ReccoBeats is called (mock it with MSW). */
  provider?: TrackFeatureOptions['provider']
  solverClient?: SolverClient
  fitClient?: FitClient
  now?: () => number
}

/**
 * The app's plugins without a page, logged in: for testing composables that work on a
 * set. The solver and best fit run in-process unless a client is given.
 */
export function createSetApp(options: SetAppOptions = {}) {
  const app = createApp({ render: () => null })
  app.use(createPinia())
  app.use(VueQueryPlugin, {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  })
  installAuth(app, {
    clientId: 'test-client',
    redirectUri: 'http://127.0.0.1:5173/camelont/callback',
    storage: loggedInStorage(),
    flowStorage: new MemoryStorage(),
    redirect: () => undefined,
  })
  installTrackFeatures(app, {
    cacheStore: options.cacheStore ?? createMemoryStore(),
    overridesStore: options.overridesStore ?? createMemoryStore(),
    ...(options.provider ? { provider: options.provider } : {}),
  })
  let ids = 0
  let seeds = 0
  installSets(app, {
    store: options.setsStore ?? createMemoryStore(),
    now: options.now ?? (() => Date.now()),
    newId: () => `set-${++ids}`,
    newSeed: () => ++seeds,
    saveDelayMs: 0,
  })
  installMixing(app, {
    client: options.solverClient ?? inlineSolverClient,
    fitClient: options.fitClient ?? inlineFitClient,
  })
  const scope = effectScope(true)
  return {
    /** Runs a composable as a component's setup would. */
    run: <T>(setup: () => T): T => app.runWithContext(() => scope.run(setup) as T),
    /** As leaving the page: stops everything the composables started. */
    stop: () => {
      scope.stop()
    },
  }
}
