import { computed, onScopeDispose, shallowRef, type ShallowRef } from 'vue'
import type { WorkerRun } from './solver-client'

export type RunStatus = 'idle' | 'running' | 'done' | 'error'

/**
 * Runs work off the main thread, one run at a time. A new `run` (or `cancel`, or
 * leaving the component) cancels the one in flight, so stale results never land.
 */
export function useLatestRun<Request, Result>(client: (request: Request) => WorkerRun<Result>) {
  const status = shallowRef<RunStatus>('idle')
  const result: ShallowRef<Result | null> = shallowRef(null)
  const error = shallowRef<string | null>(null)
  let current: WorkerRun<Result> | null = null

  function cancel() {
    current?.cancel()
    current = null
    if (status.value === 'running') status.value = 'idle'
  }

  async function run(request: Request): Promise<void> {
    cancel()
    const thisRun = client(request)
    current = thisRun
    status.value = 'running'
    error.value = null
    try {
      const value = await thisRun.result
      if (current !== thisRun) return
      result.value = value
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
    status: computed(() => status.value),
    result: computed(() => result.value),
    error: computed(() => error.value),
    run,
    cancel,
  }
}
