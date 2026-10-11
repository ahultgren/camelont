import { describe, expect, it, vi } from 'vitest'
import { WCS_TRACKS } from '@/test/wcs'
import { mixTracks } from '../domain/evaluate'
import type { FitRequest, FitResult } from '../domain/fit'
import { DEFAULT_PROFILE } from '../domain/profile'
import { inlineFitClient, type FitClient } from './solver-client'
import { useFitter } from './useFitter'

const tracks = mixTracks(WCS_TRACKS)
const request: FitRequest = {
  fixed: tracks.slice(0, 12),
  candidates: tracks.slice(12),
  count: 3,
  profile: DEFAULT_PROFILE,
}

describe('useFitter', () => {
  it('picks the best-fit tracks through its client', async () => {
    const fitter = useFitter(inlineFitClient)
    await fitter.run(request)
    expect(fitter.status.value).toBe('done')
    expect(fitter.result.value?.picked).toHaveLength(3)
    expect(fitter.result.value?.order).toHaveLength(15)
  })

  it('lets the latest run win', async () => {
    const pending: ((result: FitResult) => void)[] = []
    const cancel = vi.fn()
    const client: FitClient = () => ({
      result: new Promise<FitResult>((resolve) => pending.push(resolve)),
      cancel,
    })
    const fitter = useFitter(client)
    const first = fitter.run(request)
    const second = fitter.run({ ...request, count: 1 })
    expect(cancel).toHaveBeenCalledTimes(1)
    pending[0]?.({ picked: [], ranking: [], order: [] })
    await first
    expect(fitter.status.value).toBe('running')
    const [only] = tracks.slice(12)
    pending[1]?.({ picked: only ? [only] : [], ranking: [], order: [] })
    await second
    expect(fitter.result.value?.picked).toHaveLength(1)
  })

  it('reports a failed run', async () => {
    const fitter = useFitter(() => ({
      result: Promise.reject(new Error('worker crashed')),
      cancel: () => undefined,
    }))
    await fitter.run(request)
    expect(fitter.status.value).toBe('error')
    expect(fitter.error.value).toBe('worker crashed')
  })
})
