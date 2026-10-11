import { workerSolverClient, type SolverClient } from './solver-client'
import { useLatestRun, type RunStatus } from './useLatestRun'

export type MixerStatus = RunStatus

/**
 * Runs the solver off the main thread. A new `run` (or `cancel`, or leaving the
 * component) cancels the one in flight, so stale results never land.
 */
export function useMixer(client: SolverClient = workerSolverClient) {
  const { result, ...mixer } = useLatestRun(client)
  return { ...mixer, outcome: result }
}
