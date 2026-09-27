import { wrap } from 'comlink'
import type { SolveOutcome } from '../domain/solver/solve'
import type { SolverWorkerApi, WorkerSolveRequest } from './solver.worker'

/** Runs one solve; `cancel` stops it (for a worker: terminates it). */
export interface SolverRun {
  result: Promise<SolveOutcome>
  cancel(): void
}

export type SolverClient = (request: WorkerSolveRequest) => SolverRun

/**
 * One worker per run: a synchronous solve can't be interrupted, so cancelling means
 * terminating the worker. Starting a worker is cheap next to a solve.
 */
export const workerSolverClient: SolverClient = (request) => {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  const api = wrap<SolverWorkerApi>(worker)
  const result = api.solve(request).finally(() => {
    worker.terminate()
  })
  return {
    result,
    cancel: () => {
      worker.terminate()
    },
  }
}
