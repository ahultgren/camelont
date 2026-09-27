import { inject, type App, type InjectionKey } from 'vue'
import { wrap } from 'comlink'
import { solveMix, type SolveOutcome } from '../domain/solver/solve'
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

const SOLVER_CLIENT: InjectionKey<SolverClient> = Symbol('camelont.solver-client')

/** Overrides the solver client (tests run the solver in-process). */
export function installMixing(app: App, options: { client?: SolverClient } = {}): void {
  if (options.client) app.provide(SOLVER_CLIENT, options.client)
}

export function useSolverClient(): SolverClient {
  return inject(
    SOLVER_CLIENT,
    typeof Worker === 'undefined' ? inlineSolverClient : workerSolverClient,
  )
}

/** Runs the solver on the calling thread (tests; browsers without module workers). */
export const inlineSolverClient: SolverClient = (request) => ({
  result: Promise.resolve().then(() => solveMix(request)),
  cancel: () => undefined,
})
