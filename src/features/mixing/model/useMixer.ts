import { onScopeDispose, readonly, shallowRef } from 'vue'
import type { SolveOutcome } from '../domain/solver/solve'
import { workerSolverClient, type SolverClient, type SolverRun } from './solver-client'
import type { WorkerSolveRequest } from './solver.worker'

export type MixerStatus = 'idle' | 'running' | 'done' | 'error'

/**
 * Runs the solver off the main thread. A new `run` (or `cancel`, or leaving the
 * component) cancels the one in flight, so stale results never land.
 */
export function useMixer(client: SolverClient = workerSolverClient) {
  const status = shallowRef<MixerStatus>('idle')
  const outcome = shallowRef<SolveOutcome | null>(null)
  const error = shallowRef<string | null>(null)
  let current: SolverRun | null = null

  function cancel() {
    current?.cancel()
    current = null
    if (status.value === 'running') status.value = 'idle'
  }

  async function run(request: WorkerSolveRequest): Promise<void> {
    cancel()
    const thisRun = client(request)
    current = thisRun
    status.value = 'running'
    error.value = null
    try {
      const result = await thisRun.result
      if (current !== thisRun) return
      outcome.value = result
      status.value = 'done'
    } catch (e) {
      if (current !== thisRun) return
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'error'
    } finally {
      if (current === thisRun) current = null
    }
  }

  onScopeDispose(cancel)

  return {
    status: readonly(status),
    outcome: readonly(outcome),
    error: readonly(error),
    run,
    cancel,
  }
}
