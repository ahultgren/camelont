import { workerFitClient, type FitClient } from './solver-client'
import { useLatestRun } from './useLatestRun'

/**
 * Runs best fit (`pickBestFit`) off the main thread: it holds a solver run, so it is
 * too slow to sit in a computed. Same rules as `useMixer`: the latest run wins.
 */
export function useFitter(client: FitClient = workerFitClient) {
  return useLatestRun(client)
}
