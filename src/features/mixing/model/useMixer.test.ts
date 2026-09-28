import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { NO_CONSTRAINTS } from '../domain/constraints'
import { DEFAULT_PROFILE } from '../domain/profile'
import { solveMix, type SolveOutcome } from '../domain/solver/solve'
import type { SolverClient } from './solver-client'
import type { WorkerSolveRequest } from './solver.worker'
import { useMixer } from './useMixer'

const request: WorkerSolveRequest = {
  tracks: [{ id: 'a', label: 'A', camelot: '8A', bpm: 100, energy: null }],
  constraints: NO_CONSTRAINTS,
  profile: DEFAULT_PROFILE,
}

/** A client whose runs resolve when the test says so. */
function manualClient() {
  const runs: {
    resolve: (o: SolveOutcome) => void
    reject: (e: Error) => void
    cancel: ReturnType<typeof vi.fn>
  }[] = []
  const client: SolverClient = () => {
    let resolve!: (o: SolveOutcome) => void
    let reject!: (e: Error) => void
    const result = new Promise<SolveOutcome>((res, rej) => {
      resolve = res
      reject = rej
    })
    const cancel = vi.fn()
    runs.push({ resolve, reject, cancel })
    return { result, cancel }
  }
  return { client, runs }
}

describe('useMixer', () => {
  it('runs the solver and exposes the outcome', async () => {
    const inline: SolverClient = (req) => ({
      result: Promise.resolve(solveMix(req)),
      cancel: () => undefined,
    })
    const mixer = useMixer(inline)
    await mixer.run(request)
    expect(mixer.status.value).toBe('done')
    expect(mixer.outcome.value?.kind).toBe('solved')
  })

  it('cancels the run in flight when a new one starts, and ignores its result', async () => {
    const { client, runs } = manualClient()
    const mixer = useMixer(client)
    const first = mixer.run(request)
    const second = mixer.run(request)
    expect(runs[0]?.cancel).toHaveBeenCalled()
    runs[0]?.resolve({ kind: 'empty' })
    await first
    expect(mixer.status.value).toBe('running')
    runs[1]?.resolve({ kind: 'empty' })
    await second
    expect(mixer.status.value).toBe('done')
  })

  it('reports errors', async () => {
    const { client, runs } = manualClient()
    const mixer = useMixer(client)
    const pending = mixer.run(request)
    runs[0]?.reject(new Error('boom'))
    await pending
    expect(mixer.status.value).toBe('error')
    expect(mixer.error.value).toBe('boom')
  })

  it('cancels when its scope is disposed', () => {
    const { client, runs } = manualClient()
    const scope = effectScope()
    scope.run(() => {
      void useMixer(client).run(request)
    })
    scope.stop()
    expect(runs[0]?.cancel).toHaveBeenCalled()
  })
})
