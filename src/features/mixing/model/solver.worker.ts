import { expose } from 'comlink'
import { solveMix, type SolveOutcome, type SolveRequest } from '../domain/solver/solve'

/** What crosses the worker boundary (no functions). */
export type WorkerSolveRequest = Omit<SolveRequest, 'now'>

const api = {
  solve(request: WorkerSolveRequest): SolveOutcome {
    return solveMix(request)
  },
}

export type SolverWorkerApi = typeof api

expose(api)
