import { expose } from 'comlink'
import { pickBestFit, type FitRequest, type FitResult } from '../domain/fit'
import { solveMix, type SolveOutcome, type SolveRequest } from '../domain/solver/solve'

/** What crosses the worker boundary (no functions). */
export type WorkerSolveRequest = Omit<SolveRequest, 'now'>

const api = {
  solve(request: WorkerSolveRequest): SolveOutcome {
    return solveMix(request)
  },
  /** Best fit runs the solver too (decision 31), so it belongs here with it. */
  fit(request: FitRequest): FitResult {
    return pickBestFit(request)
  },
}

export type SolverWorkerApi = typeof api

expose(api)
