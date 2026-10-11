import { inject, type App, type InjectionKey } from 'vue'
import { wrap, type Remote } from 'comlink'
import { pickBestFit, type FitRequest, type FitResult } from '../domain/fit'
import { solveMix, type SolveOutcome } from '../domain/solver/solve'
import type { SolverWorkerApi, WorkerSolveRequest } from './solver.worker'

/** One piece of work off the main thread; `cancel` stops it (for a worker: terminates it). */
export interface WorkerRun<Result> {
  result: Promise<Result>
  cancel(): void
}

export type SolverRun = WorkerRun<SolveOutcome>

export type SolverClient = (request: WorkerSolveRequest) => SolverRun

/** Picks a limited playlist's best-fit tracks (`pickBestFit`). */
export type FitClient = (request: FitRequest) => WorkerRun<FitResult>

/**
 * One worker per run: a synchronous solve can't be interrupted, so cancelling means
 * terminating the worker. Starting a worker is cheap next to a solve.
 */
function inWorker<Result>(
  call: (api: Remote<SolverWorkerApi>) => Promise<Result>,
): WorkerRun<Result> {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  const result = call(wrap<SolverWorkerApi>(worker)).finally(() => {
    worker.terminate()
  })
  return {
    result,
    cancel: () => {
      worker.terminate()
    },
  }
}

// Comlink types a remote call that returns a union as a union of promises, so the result
// type is given here instead of inferred.
export const workerSolverClient: SolverClient = (request) =>
  inWorker<SolveOutcome>((api) => api.solve(request))

export const workerFitClient: FitClient = (request) =>
  inWorker<FitResult>((api) => api.fit(request))

const SOLVER_CLIENT: InjectionKey<SolverClient> = Symbol('camelont.solver-client')
const FIT_CLIENT: InjectionKey<FitClient> = Symbol('camelont.fit-client')

/** Overrides the worker clients (tests run the solver and best fit in-process). */
export function installMixing(
  app: App,
  options: { client?: SolverClient; fitClient?: FitClient } = {},
): void {
  if (options.client) app.provide(SOLVER_CLIENT, options.client)
  if (options.fitClient) app.provide(FIT_CLIENT, options.fitClient)
}

const noWorkers = () => typeof Worker === 'undefined'

export function useSolverClient(): SolverClient {
  return inject(SOLVER_CLIENT, noWorkers() ? inlineSolverClient : workerSolverClient)
}

export function useFitClient(): FitClient {
  return inject(FIT_CLIENT, noWorkers() ? inlineFitClient : workerFitClient)
}

/** Runs the solver on the calling thread (tests; browsers without module workers). */
export const inlineSolverClient: SolverClient = (request) => ({
  result: Promise.resolve().then(() => solveMix(request)),
  cancel: () => undefined,
})

/** Runs best fit on the calling thread (tests; browsers without module workers). */
export const inlineFitClient: FitClient = (request) => ({
  result: Promise.resolve().then(() => pickBestFit(request)),
  cancel: () => undefined,
})
