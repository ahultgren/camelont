import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateMix,
  inlineFitClient,
  inlineSolverClient,
  type FitClient,
  type FitResult,
  type SolveOutcome,
  type SolverClient,
} from '@/features/mixing'
import { useOverridesStore, type TrackFeatureOptions } from '@/features/track-features'
import { createMemoryStore } from '@/shared/storage'
import { parseCamelot } from '@/shared/music'
import { server } from '@/test/msw'
import { createSetApp, type SetAppOptions } from '@/test/set-app'
import { SPOTIFY } from '@/test/spotify-mocks'
import { WCS_TRACKS, wcsId } from '@/test/wcs'
import type { PlaylistCopy } from '../domain/set'
import type { MixSet, SetTrack } from '../domain/types'
import { useSetsStore } from './sets-store'
import { useSetWorkspace, type SetWorkspace, type WorkspaceView } from './useSetWorkspace'

// The solver runs in-process here, and beside the other solver-heavy test files a solve
// can take seconds. The clock is not what these tests are about.
const SLOW = { timeout: 15_000 }
vi.setConfig({ testTimeout: 60_000 })

// ── Fixtures ───────────────────────────────────────────────────────────────────────
// The WCS tracks with their real keys and tempos, plus made-up ones ("x…") in 8A.
const titles = new Map(WCS_TRACKS.map((track) => [track.id, track.label]))
const track = (trackId: string): SetTrack => ({
  trackId,
  uri: `spotify:track:${trackId}`,
  title: titles.get(trackId) ?? trackId.toUpperCase(),
  artists: ['Artist'],
  durationMs: 200_000,
  imageUrl: null,
})
const copy = (playlistId: string, trackIds: string[], snapshotId = 'snap-1'): PlaylistCopy => ({
  playlistId,
  name: `Playlist ${playlistId}`,
  imageUrl: null,
  tracks: trackIds.map(track),
  snapshotId,
  readAt: 1,
  skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
})
const wcs = (...names: string[]) => names.map((name) => wcsId(name))
const ALL = WCS_TRACKS.map((t) => t.id)
/** Without Bloodstream (2A), which only mixes next to two of the others. */
const EASY = ALL.filter((id) => id !== wcsId('Bloodstream'))

type Provider = NonNullable<TrackFeatureOptions['provider']>
/** Knows the WCS tracks and "x" tracks (8A, the BPM in the ID: `x100`, `x100n7`), except the ones listed. */
const provider = (unknown: string[] = []): Provider => ({
  fetch: (trackIds, now) =>
    Promise.resolve(
      trackIds.map((trackId) => {
        const known = WCS_TRACKS.find((t) => t.id === trackId)
        const camelot = parseCamelot(known?.camelot ?? '8A')
        const bpm = known?.bpm ?? Number(/^x(\d+)/.exec(trackId)?.[1])
        const found = !unknown.includes(trackId) && (known !== undefined || trackId.startsWith('x'))
        return found
          ? { trackId, found: true, camelot, bpm, energy: null, fetchedAt: now }
          : { trackId, found: false, fetchedAt: now }
      }),
    ),
})

// ── Spotify, as the change check sees it ───────────────────────────────────────────
const playlistDto = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Playlist ${id}`,
  images: [],
  owner: { id: 'me' },
  snapshot_id: 'snap-1',
  ...extra,
})
const items = (trackIds: string[]) => ({
  items: trackIds.map((id) => ({
    is_local: false,
    item: {
      type: 'track',
      id,
      uri: `spotify:track:${id}`,
      name: titles.get(id) ?? id.toUpperCase(),
      duration_ms: 200_000,
      artists: [{ name: 'Artist' }],
    },
  })),
  next: null,
})

beforeEach(() => {
  // Unless a test says otherwise, every playlist is still at the stored snapshot.
  server.use(
    http.get(`${SPOTIFY}/me`, () => HttpResponse.json({ id: 'me' })),
    http.get(`${SPOTIFY}/playlists/:id`, ({ params }) =>
      HttpResponse.json(playlistDto(String(params.id))),
    ),
  )
})

// ── Opening a workspace ────────────────────────────────────────────────────────────
interface OpenOptions extends SetAppOptions {
  playlists?: PlaylistCopy[]
  /** Edits made to the set before it is opened. */
  prepare?: (set: MixSet) => MixSet
  /** Opens this stored set instead of making one. */
  setId?: string
  unknown?: string[]
  debounceMs?: number
}

async function open(options: OpenOptions = {}) {
  const setsStore = options.setsStore ?? createMemoryStore()
  const app = createSetApp({ provider: provider(options.unknown), ...options, setsStore })
  const sets = app.run(() => useSetsStore())
  await sets.ready
  let { setId } = options
  if (setId === undefined) {
    setId = sets.create({ name: 'Friday social', playlists: options.playlists ?? [] }).id
    if (options.prepare) sets.update(setId, options.prepare)
  }
  const id = setId
  const workspace = app.run(() => useSetWorkspace(id, { debounceMs: options.debounceMs ?? 0 }))
  return { app, sets, workspace, setId: id, setsStore, stored: () => sets.get(id) }
}

/** The workspace has a result for its current input. */
const settled = async (workspace: SetWorkspace) => {
  await vi.waitFor(() => {
    expect(workspace.view.value.kind).not.toBe('opening')
    expect(workspace.updating.value).toBe(false)
    expect(workspace.picking.value).toBe(false)
  }, SLOW)
  return workspace.view.value
}

type MixView = Extract<WorkspaceView, { kind: 'mix' }>
const mixOf = (view: WorkspaceView): MixView => {
  if (view.kind !== 'mix') throw new Error(`Expected a mix, got ${JSON.stringify(view)}`)
  return view
}
const problemsOf = (view: WorkspaceView) => {
  if (view.kind !== 'problems') throw new Error(`Expected problems, got ${view.kind}`)
  return view.problems
}
const shownOrder = (view: WorkspaceView) => mixOf(view).shown.order.map((t) => t.id)
const statusOf = (workspace: SetWorkspace, trackId: string) =>
  workspace.selection.value?.statusByTrack.get(trackId)?.reason

/** A client whose runs wait until the test lets them through. */
function gated<Request, Result>(
  inline: (request: Request) => { result: Promise<Result>; cancel: () => void },
) {
  const gates: (() => void)[] = []
  let runs = 0
  return {
    client: (request: Request) => {
      runs++
      const gate = new Promise<void>((resolve) => gates.push(resolve))
      return { result: gate.then(() => inline(request).result), cancel: () => undefined }
    },
    runs: () => runs,
    release: () => {
      for (const gate of gates.splice(0)) gate()
    },
  }
}
const gatedSolver = () => gated<Parameters<SolverClient>[0], SolveOutcome>(inlineSolverClient)
const gatedFitter = () => gated<Parameters<FitClient>[0], FitResult>(inlineFitClient)

/** A fit client that records what it was asked. */
function recordingFitter() {
  const requests: Parameters<FitClient>[0][] = []
  const results: string[][] = []
  const client: FitClient = (request) => {
    requests.push(request)
    const run = inlineFitClient(request)
    return {
      ...run,
      result: run.result.then((result) => {
        results.push(result.order.map((t) => t.id))
        return result
      }),
    }
  }
  return { client, requests, orders: results }
}

// ── Tests ──────────────────────────────────────────────────────────────────────────
describe('the set', () => {
  it('reports a set that is not on this device instead of throwing', async () => {
    const { workspace } = await open({ setId: 'nope' })
    expect(workspace.status.value).toBe('missing')
    expect(workspace.statusMessage.value).toMatch(/isn’t on this device/)
    expect(workspace.set.value).toBeNull()
    expect(workspace.view.value).toEqual({ kind: 'opening' })
    expect(workspace.updating.value).toBe(false)
  })

  it('reports a stored set that can’t be read, with what is wrong with it', async () => {
    const setsStore = createMemoryStore()
    await setsStore.set('broken', { v: 1, data: { id: 'broken', name: 'Old set', playlists: 7 } })
    const { workspace } = await open({ setsStore, setId: 'broken' })
    expect(workspace.status.value).toBe('unreadable')
    expect(workspace.statusMessage.value).toMatch(/^“Old set” can’t be read\. .+/)
  })

  it('is loading until the stored sets have been read', async () => {
    const app = createSetApp({ provider: provider() })
    const workspace = app.run(() => useSetWorkspace('set-1'))
    expect(workspace.status.value).toBe('loading')
    expect(workspace.statusMessage.value).toBeNull()
    await app.run(() => useSetsStore()).ready
    expect(workspace.status.value).toBe('missing')
  })

  it('opens a set: its tracks, their data, who is in, and the mix', async () => {
    const { workspace, setId } = await open({ playlists: [copy('wcs', ALL)] })
    expect(workspace.status.value).toBe('ready')
    expect(workspace.set.value?.id).toBe(setId)
    expect(workspace.view.value).toEqual({ kind: 'opening' })

    const view = mixOf(await settled(workspace))
    expect(workspace.tracks.value.size).toBe(20)
    expect(workspace.features.value.get(wcsId('Bloodstream'))?.camelot?.value).toBe('2A')
    expect(workspace.selection.value?.inSet).toHaveLength(20)
    expect(workspace.selection.value?.playlists[0]?.counts).toMatchObject({ tracks: 20, inSet: 20 })
    expect(view.alternatives.length).toBeGreaterThan(1)
    expect(view.shownIndex).toBe(0)
    expect(view.shown).toBe(view.alternatives[0])
    expect(view.shown.clashCount).toBe(0)
    expect([...shownOrder(view)].sort()).toEqual([...ALL].sort())
    // The first result after opening has nothing to compare with.
    expect(workspace.summary.value).toBeNull()
  })

  it('says there is nothing to mix in a set without tracks', async () => {
    const { workspace } = await open({ playlists: [] })
    expect(problemsOf(await settled(workspace))).toEqual([
      { kind: 'empty', message: 'This set has no playlists yet. Add one to start mixing.' },
    ])
  })
})

describe('edits', () => {
  it('writes every edit to the stored set as it is made', async () => {
    const setsStore = createMemoryStore()
    const [a, b, c] = wcs('Love Is', 'Girl on Fire', 'Try')
    const { workspace, sets, setId, stored } = await open({
      setsStore,
      playlists: [copy('wcs', ALL), copy('odd', ['x100', 'x101', 'x102'])],
    })
    await settled(workspace)

    workspace.setBpmRange('wcs', { min: 85, max: 120 })
    workspace.setLimit('odd', 2)
    workspace.setPickMethod('odd', 'bestFit')
    workspace.setMark(wcsId('Pompeii'), 'mustInclude')
    workspace.setMark(wcsId('Brother'), 'exclude')
    workspace.setMark(wcsId('Brother'), null)
    workspace.setOpener(a ?? '')
    workspace.setCloser(b ?? '')
    workspace.addFollow(c ?? '', b ?? '')
    workspace.addFollow(a ?? '', c ?? '')
    workspace.removeFollow(a ?? '', c ?? '')
    workspace.setArc('twoWaves')

    expect(stored()?.playlists.map((p) => p.choices)).toEqual([
      { bpmMin: 85, bpmMax: 120, limit: null, pick: 'random', seed: 1 },
      { bpmMin: null, bpmMax: null, limit: 2, pick: 'bestFit', seed: 2 },
    ])
    expect(stored()?.marks).toEqual({ [wcsId('Pompeii')]: 'mustInclude' })
    expect(stored()?.mix).toEqual({ opener: a, closer: b, follows: [[c, b]], arc: 'twoWaves' })
    expect(workspace.set.value).toBe(stored())

    // No save step: a page load later, the set is as it was left.
    await sets.flush()
    const later = createSetApp({ setsStore, provider: provider() })
    const reloaded = later.run(() => useSetsStore())
    await reloaded.ready
    expect(reloaded.get(setId)).toEqual(stored())
  })

  it('reshuffles a playlist’s random picks', async () => {
    const pool = Array.from({ length: 12 }, (_, i) => `x${100 + i}`)
    const { workspace, stored } = await open({
      playlists: [copy('odd', pool)],
      prepare: (set) => ({
        ...set,
        playlists: set.playlists.map((p) => ({ ...p, choices: { ...p.choices, limit: 3 } })),
      }),
    })
    await settled(workspace)
    const before = workspace.selection.value?.inSet ?? []
    expect(before).toHaveLength(3)
    expect(before.every((id) => statusOf(workspace, id) === 'picked')).toBe(true)

    workspace.reshuffle('odd')
    expect(stored()?.playlists[0]?.choices.seed).toBe(2)
    await settled(workspace)
    const after = workspace.selection.value?.inSet ?? []
    expect(after).toHaveLength(3)
    expect(after).not.toEqual(before)
    // What the update changed names the picks (spec §8.4).
    const [change] = workspace.summary.value?.picks ?? []
    expect(change?.playlistId).toBe('odd')
    expect(change?.out).toEqual(before.filter((id) => !after.includes(id)))
    expect(change?.in).toEqual(after.filter((id) => !before.includes(id)))
  })

  it('gives a track one role at a time', async () => {
    const [a] = wcs('Love Is')
    const { workspace, stored } = await open({ playlists: [copy('wcs', ALL)] })
    workspace.setRole(a ?? '', 'exclude')
    workspace.setRole(a ?? '', 'opener')
    expect(stored()?.marks).toEqual({})
    expect(stored()?.mix.opener).toBe(a)
  })

  it('shares one pointed-at track between the views', async () => {
    const { workspace } = await open({ playlists: [copy('wcs', ALL)] })
    expect(workspace.pointedTrackId.value).toBeNull()
    workspace.pointedTrackId.value = wcsId('Try')
    expect(workspace.pointedTrackId.value).toBe(wcsId('Try'))
  })
})

describe('which tracks are in the set', () => {
  it('follows the track choices and says why each track is in or out', async () => {
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], unknown: wcs('Lemon Tree') })
    await settled(workspace)
    workspace.setBpmRange('wcs', { min: 85, max: 120 })
    workspace.setMark(wcsId('Pompeii'), 'mustInclude')
    workspace.setMark(wcsId('Love Is'), 'exclude')
    await settled(workspace)

    expect(statusOf(workspace, wcsId('Brother'))).toBe('outsideRange') // 78 BPM
    expect(statusOf(workspace, wcsId('Pompeii'))).toBe('mustInclude') // 127 BPM, marked
    expect(statusOf(workspace, wcsId('Love Is'))).toBe('excluded')
    expect(statusOf(workspace, wcsId('Lemon Tree'))).toBe('needsData')
    expect(statusOf(workspace, wcsId('Try'))).toBe('in')
    const counts = workspace.selection.value?.playlists[0]?.counts
    expect(counts).toMatchObject({ tracks: 20, inSet: 16 })
    expect(counts?.byReason).toMatchObject({ outsideRange: 2, excluded: 1, needsData: 1 })
    expect(shownOrder(workspace.view.value)).toHaveLength(16)
  })

  it('leaves tracks without key or BPM out without blocking the mix', async () => {
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], unknown: wcs('Lemon Tree') })
    const view = mixOf(await settled(workspace))
    expect(view.shown.order).toHaveLength(19)
    expect(workspace.selection.value?.blockers).toEqual([])
  })

  it('uses an override made anywhere: it belongs to the track', async () => {
    const lemon = wcsId('Lemon Tree')
    const { workspace, app } = await open({ playlists: [copy('wcs', ALL)], unknown: [lemon] })
    await settled(workspace)
    expect(statusOf(workspace, lemon)).toBe('needsData')

    const overrides = app.run(() => useOverridesStore())
    await overrides.save({ trackId: lemon, camelot: '6B', bpm: 88, note: null, label: null })
    await settled(workspace)
    expect(statusOf(workspace, lemon)).toBe('in')
    expect(workspace.features.value.get(lemon)?.bpm).toEqual({ value: 88, source: 'manual' })
    expect(shownOrder(workspace.view.value)).toContain(lemon)
    expect(workspace.summary.value).toMatchObject({ joined: [lemon], left: [] })
  })

  it('reports that key and BPM could not be fetched, and tries again', async () => {
    let failing = true
    const flaky: Provider = {
      fetch: (ids, now) =>
        failing ? Promise.reject(new Error('ReccoBeats is down')) : provider().fetch(ids, now),
    }
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], provider: flaky })
    expect(problemsOf(await settled(workspace))[0]).toMatchObject({ kind: 'empty' })
    expect(workspace.providerError.value).toBe('ReccoBeats is down')

    failing = false
    workspace.retryFeatures()
    await vi.waitFor(() => {
      expect(workspace.view.value.kind).toBe('mix')
    }, SLOW)
    expect(workspace.providerError.value).toBeNull()
  })
})

describe('best fit', () => {
  const limited = (limit: number) => (set: MixSet) => ({
    ...set,
    playlists: set.playlists.map((p) =>
      p.playlistId === 'base'
        ? p
        : { ...p, choices: { ...p.choices, limit, pick: 'bestFit' as const } },
    ),
  })
  const base = ALL.slice(0, 12)
  const rest = ALL.slice(12)

  it('picks through the fit client, off the main thread, and mixes the result', async () => {
    const fitter = recordingFitter()
    const { workspace } = await open({
      playlists: [copy('base', base), copy('odd', rest)],
      prepare: limited(3),
      fitClient: fitter.client,
    })
    // Until the answer is back there is no selection to show.
    expect(workspace.selection.value).toBeNull()
    const view = mixOf(await settled(workspace))

    expect(fitter.requests).toHaveLength(1)
    expect(fitter.requests[0]?.fixed.map((t) => t.id)).toEqual(base)
    expect(fitter.requests[0]?.candidates.map((t) => t.id)).toEqual(rest)
    expect(fitter.requests[0]?.count).toBe(3)
    const picked = rest.filter((id) => statusOf(workspace, id) === 'picked')
    expect(picked).toHaveLength(3)
    expect(rest.filter((id) => statusOf(workspace, id) === 'notPicked')).toHaveLength(5)
    expect(view.shown.order).toHaveLength(15)
    expect(workspace.selection.value?.playlists[1]?.counts).toMatchObject({ tracks: 8, inSet: 3 })
  })

  it('hands each playlist’s order on to the next one that picks', async () => {
    const fitter = recordingFitter()
    await settled(
      (
        await open({
          playlists: [
            copy('base', base),
            copy('odd', rest.slice(0, 4)),
            copy('more', rest.slice(4)),
          ],
          prepare: limited(2),
          fitClient: fitter.client,
        })
      ).workspace,
    )
    expect(fitter.requests).toHaveLength(2)
    const [first, second] = fitter.requests
    expect(first?.order).toBeUndefined()
    // The second playlist sees the first one's picks in the set, and continues its order.
    expect(second?.fixed).toHaveLength(14)
    expect(second?.order?.map((t) => t.id)).toEqual(fitter.orders[0])
  })

  it('does not pick again when something else changes', async () => {
    const fitter = recordingFitter()
    const { workspace } = await open({
      playlists: [copy('base', base), copy('odd', rest)],
      prepare: limited(3),
      fitClient: fitter.client,
    })
    const before = shownOrder(await settled(workspace))
    workspace.setArc('steadyBuild')
    await vi.waitFor(() => {
      expect(shownOrder(workspace.view.value)).not.toEqual(before)
    }, SLOW)
    await settled(workspace)
    expect(fitter.requests).toHaveLength(1)
  })

  it('keeps the last selection while new picks are worked out, and names what moved', async () => {
    const fitter = recordingFitter()
    const { workspace } = await open({
      playlists: [copy('base', base), copy('odd', rest)],
      prepare: limited(3),
      fitClient: fitter.client,
    })
    await settled(workspace)
    const before = workspace.selection.value
    const picked = rest.filter((id) => statusOf(workspace, id) === 'picked')

    // Rejecting a pick: the playlist picks again.
    workspace.setMark(picked[0] ?? '', 'exclude')
    expect(workspace.picking.value).toBe(true)
    expect(workspace.selection.value).toBe(before)
    expect(workspace.updating.value).toBe(true)
    await settled(workspace)

    expect(fitter.requests).toHaveLength(2)
    const now = rest.filter((id) => statusOf(workspace, id) === 'picked')
    expect(now).toHaveLength(3)
    expect(now).not.toContain(picked[0])
    const replacement = now.filter((id) => !picked.includes(id))
    expect(workspace.summary.value).toMatchObject({
      left: [picked[0]],
      joined: replacement,
      picks: [{ playlistId: 'odd', out: [picked[0]], in: replacement }],
      tracks: { before: 15, after: 15 },
    })
  })

  it('has no summary for the first result, also when a problem shows before the picks', async () => {
    const fitter = gatedFitter()
    const { workspace } = await open({
      playlists: [copy('base', base), copy('odd', rest)],
      // 2A → 3B is a clash: a rule error, known before best fit has answered.
      prepare: (set) => ({
        ...limited(3)(set),
        mix: { ...set.mix, follows: [[wcsId('Bloodstream'), wcsId('I Wanna Dance')]] },
      }),
      fitClient: fitter.client,
    })
    await vi.waitFor(() => {
      expect(workspace.view.value.kind).toBe('problems')
    }, SLOW)
    expect(workspace.selection.value).toBeNull()
    expect(workspace.picking.value).toBe(true)
    expect(workspace.updating.value).toBe(true)
    fitter.release()
    expect(problemsOf(await settled(workspace))[0]).toMatchObject({ kind: 'rule' })
    expect(workspace.selection.value?.inSet.length).toBeGreaterThan(12)
    expect(workspace.summary.value).toBeNull()
  })

  it('says so when the picks can’t be worked out, and tries again on request', async () => {
    let broken = true
    const fitClient: FitClient = (request) =>
      broken
        ? { result: Promise.reject(new Error('worker crashed')), cancel: () => undefined }
        : inlineFitClient(request)
    const { workspace } = await open({
      playlists: [copy('base', base), copy('odd', rest)],
      prepare: limited(3),
      fitClient,
    })
    expect(problemsOf(await settled(workspace))).toEqual([
      { kind: 'failed', message: 'The mix couldn’t be worked out (worker crashed).' },
    ])
    broken = false
    workspace.retry()
    expect(mixOf(await settled(workspace)).shown.order).toHaveLength(15)
  })
})

describe('the mix', () => {
  it('takes opener, closer, follow pairs and the arc from the set', async () => {
    const [opener, closer, from, to] = wcs('Brother', 'Pompeii', 'Love Is', 'Girl on Fire')
    const { workspace } = await open({
      playlists: [copy('wcs', ALL)],
      prepare: (set) => ({
        ...set,
        mix: {
          opener: opener ?? null,
          closer: closer ?? null,
          follows: [[from ?? '', to ?? '']],
          arc: 'twoWaves',
        },
      }),
    })
    const view = mixOf(await settled(workspace))
    for (const mix of view.alternatives) {
      const order = mix.order.map((t) => t.id)
      expect(order[0]).toBe(opener)
      expect(order.at(-1)).toBe(closer)
      expect(order[order.indexOf(from ?? '') + 1]).toBe(to)
      expect(mix.arc?.config.preset).toBe('twoWaves')
      expect(mix.clashCount).toBe(0)
    }
  })

  it('keeps the previous mix on screen, marked as updating, until the next one is ready', async () => {
    const solver = gatedSolver()
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], solverClient: solver.client })
    expect(workspace.view.value).toEqual({ kind: 'opening' })
    expect(workspace.updating.value).toBe(false)
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(1)
    }, SLOW)
    solver.release()
    const first = mixOf(await settled(workspace))

    workspace.setMark(wcsId('Brother'), 'exclude')
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(2)
    }, SLOW)
    // The selection is known at once; the mix is still the old one.
    expect(statusOf(workspace, wcsId('Brother'))).toBe('excluded')
    expect(workspace.updating.value).toBe(true)
    expect(workspace.view.value).toEqual(first)
    expect(workspace.summary.value).toBeNull()

    solver.release()
    const second = mixOf(await settled(workspace))
    expect(second.shown.order).toHaveLength(19)
    expect(workspace.updating.value).toBe(false)
    expect(workspace.summary.value).toEqual({
      joined: [],
      left: [wcsId('Brother')],
      picks: [],
      tracks: { before: 20, after: 19 },
      cost: { before: first.shown.totalCost, after: second.shown.totalCost },
      reordered: true,
      changed: true,
    })
  })

  it('gathers quick edits into one solve and drops a result that is out of date', async () => {
    const solver = gatedSolver()
    const { workspace } = await open({
      playlists: [copy('wcs', ALL)],
      solverClient: solver.client,
      debounceMs: 20,
    })
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(1)
    }, SLOW)
    solver.release()
    await settled(workspace)

    workspace.setBpmRange('wcs', { min: 80, max: null })
    workspace.setBpmRange('wcs', { min: 85, max: null })
    workspace.setBpmRange('wcs', { min: 90, max: null })
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(2)
    }, SLOW)
    // An edit while that solve runs: its result must not land.
    workspace.setBpmRange('wcs', { min: 100, max: null })
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(3)
    }, SLOW)
    solver.release()
    const view = mixOf(await settled(workspace))
    expect(view.shown.order.every((t) => t.bpm >= 100)).toBe(true)
    expect(solver.runs()).toBe(3)
  })

  it('needs no solve to go back to a result it had', async () => {
    const solver = gatedSolver()
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], solverClient: solver.client })
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(1)
    }, SLOW)
    solver.release()
    const first = shownOrder(await settled(workspace))
    workspace.setArc('twoWaves')
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(2)
    }, SLOW)
    solver.release()
    await settled(workspace)

    workspace.setArc('none')
    expect(shownOrder(await settled(workspace))).toEqual(first)
    expect(solver.runs()).toBe(2)
  })

  it('reports a solver that fails, and tries again on request', async () => {
    let broken = true
    const solverClient: SolverClient = (request) =>
      broken
        ? { result: Promise.reject(new Error('out of memory')), cancel: () => undefined }
        : inlineSolverClient(request)
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], solverClient })
    expect(problemsOf(await settled(workspace))).toEqual([
      { kind: 'failed', message: 'The mix couldn’t be worked out (out of memory).' },
    ])
    broken = false
    workspace.retry()
    expect(mixOf(await settled(workspace)).shown.order).toHaveLength(20)
  })
})

describe('problems, in place of the mix', () => {
  it('names a must-include track without key or BPM, and mixes once it is filled in', async () => {
    const lemon = wcsId('Lemon Tree')
    const solver = gatedSolver()
    const { workspace, app } = await open({
      playlists: [copy('wcs', ALL)],
      unknown: [lemon],
      prepare: (set) => ({ ...set, marks: { [lemon]: 'mustInclude' } }),
      solverClient: solver.client,
    })
    expect(problemsOf(await settled(workspace))).toEqual([
      {
        kind: 'needsData',
        trackId: lemon,
        message:
          'Lemon Tree (feat. Will Jay) is marked must-include but has no key or BPM. Fill them in, or remove the mark.',
      },
    ])
    expect(workspace.selection.value?.blockers).toEqual([lemon])
    expect(solver.runs()).toBe(0)

    const overrides = app.run(() => useOverridesStore())
    await overrides.save({ trackId: lemon, camelot: '6B', bpm: 88, note: null, label: null })
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(1)
    }, SLOW)
    // The problem stays where it is until the mix is there.
    expect(workspace.view.value.kind).toBe('problems')
    expect(workspace.updating.value).toBe(true)
    solver.release()
    expect(mixOf(await settled(workspace)).shown.order).toHaveLength(20)
  })

  it('reports a rule error at once, without asking the solver', async () => {
    const solver = gatedSolver()
    const { workspace } = await open({ playlists: [copy('wcs', ALL)], solverClient: solver.client })
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(1)
    }, SLOW)
    solver.release()
    await settled(workspace)

    // 2A → 3B is a clash on the chart.
    workspace.addFollow(wcsId('Bloodstream'), wcsId('I Wanna Dance'))
    const problems = problemsOf(await settled(workspace))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ kind: 'rule', error: { kind: 'clash-pair' } })
    expect(problems[0]?.message).toBe(
      'Bloodstream (2A) → I Wanna Dance with Somebody (Who Loves Me) (3B) is a clash on the chart, so it can’t be a required pair.',
    )
    expect(solver.runs()).toBe(1)
    expect(workspace.summary.value).toMatchObject({ cost: { after: null }, changed: true })
  })

  it('says which rule an excluded track is named in', async () => {
    const [opener, from, to] = wcs('Brother', 'Love Is', 'Girl on Fire')
    const { workspace } = await open({ playlists: [copy('wcs', ALL)] })
    await settled(workspace)
    workspace.setOpener(opener ?? '')
    workspace.addFollow(from ?? '', to ?? '')
    await settled(workspace)
    workspace.setMark(opener ?? '', 'exclude')
    workspace.setMark(to ?? '', 'exclude')

    expect(problemsOf(await settled(workspace))).toEqual([
      {
        kind: 'excludedInRule',
        trackId: opener,
        rule: { kind: 'opener', trackId: opener },
        message:
          'Brother (12B) is excluded, but it is the opening track. Remove the exclusion or choose another opening track.',
      },
      {
        kind: 'excludedInRule',
        trackId: to,
        rule: { kind: 'follow', from, to },
        message:
          'Girl on Fire (11B) is excluded, but Love Is (11B) must be followed by Girl on Fire (11B). Remove the exclusion or the pair.',
      },
    ])
    expect(statusOf(workspace, opener ?? '')).toBe('excluded')
  })

  it('keeps a track a rule names in the set, whatever the range says', async () => {
    const brother = wcsId('Brother')
    const { workspace } = await open({ playlists: [copy('wcs', ALL)] })
    await settled(workspace)
    workspace.setBpmRange('wcs', { min: 85, max: null })
    workspace.setOpener(brother)
    const view = mixOf(await settled(workspace))
    expect(statusOf(workspace, brother)).toBe('mustInclude')
    expect(view.shown.order[0]?.id).toBe(brother)
  })

  it('explains an impossible mix and names left-out tracks that would unblock it', async () => {
    // Bloodstream (2A) can only sit next to Counting Stars (12A) or Stolen Dance (1B).
    const [counting, stolen, bloodstream] = wcs('Counting Stars', 'Stolen Dance', 'Bloodstream')
    const { workspace } = await open({ playlists: [copy('wcs', ALL)] })
    await settled(workspace)
    workspace.setMark(counting ?? '', 'exclude')
    workspace.setBpmRange('wcs', { min: null, max: 113 }) // Stolen Dance is 114 BPM
    workspace.setMark(bloodstream ?? '', 'mustInclude')

    const problems = problemsOf(await settled(workspace))
    const isolated = problems.find((p) => p.kind === 'noMix' && p.diagnostic?.kind === 'isolated')
    expect(isolated).toMatchObject({
      kind: 'noMix',
      diagnostic: { id: bloodstream, excludedOptions: [stolen, counting] },
    })
    expect(isolated?.message).toMatch(
      /^Bloodstream \(2A\) can’t follow or precede any other included track/,
    )
    expect(isolated?.message).toContain(
      'Left-out tracks that would fit: Stolen Dance (1B) and Counting Stars (12A).',
    )
  })
})

describe('the chosen alternative', () => {
  it('stores the chosen mix in the set and shows it when the set is opened again', async () => {
    const setsStore = createMemoryStore()
    const first = await open({ setsStore, playlists: [copy('wcs', ALL)] })
    const view = mixOf(await settled(first.workspace))
    expect(view.chosen).toBe(false)
    expect(first.stored()?.chosenMix).toBeNull()

    first.workspace.chooseAlternative(2)
    const chosen = mixOf(first.workspace.view.value)
    expect(chosen).toMatchObject({ shownIndex: 2, chosen: true })
    expect(first.stored()?.chosenMix).toEqual({ order: shownOrder(chosen) })
    // Choosing is not an update of the mix: nothing to summarise.
    expect(first.workspace.summary.value).toBeNull()
    await first.sets.flush()
    first.app.stop()

    const again = await open({ setsStore, setId: first.setId })
    const reopened = mixOf(await settled(again.workspace))
    expect(reopened).toMatchObject({ shownIndex: 2, chosen: true })
    expect(shownOrder(reopened)).toEqual(shownOrder(chosen))
  })

  it('shows the best new mix after a change, and forgets the old choice', async () => {
    const { workspace, stored } = await open({ playlists: [copy('wcs', ALL)] })
    await settled(workspace)
    workspace.chooseAlternative(1)
    const chosenCost = mixOf(workspace.view.value).shown.totalCost

    workspace.setMark(wcsId('Brother'), 'exclude')
    const view = mixOf(await settled(workspace))
    expect(view).toMatchObject({ shownIndex: 0, chosen: false })
    expect(stored()?.chosenMix).toBeNull()
    // The summary compares with the mix that was on screen: the chosen one.
    expect(workspace.summary.value?.cost.before).toBe(chosenCost)
  })

  it('keeps the chosen mix through a change that leaves the mix alone', async () => {
    const lemon = wcsId('Lemon Tree')
    const { workspace, stored } = await open({ playlists: [copy('wcs', ALL)], unknown: [lemon] })
    await settled(workspace)
    workspace.chooseAlternative(1)
    const order = shownOrder(workspace.view.value)

    // Lemon Tree has no data, so it was left out already: excluding it changes no mix.
    workspace.setMark(lemon, 'exclude')
    expect(statusOf(workspace, lemon)).toBe('excluded')
    const view = mixOf(await settled(workspace))
    expect(view).toMatchObject({ shownIndex: 1, chosen: true })
    expect(stored()?.chosenMix).toEqual({ order })
    expect(workspace.summary.value).toBeNull()
  })

  it('shows the best mix when the stored one is no longer among the alternatives', async () => {
    const setsStore = createMemoryStore()
    const overridesStore = createMemoryStore()
    const first = await open({ setsStore, overridesStore, playlists: [copy('wcs', ALL)] })
    await settled(first.workspace)
    first.workspace.chooseAlternative(1)
    const stale = shownOrder(first.workspace.view.value)
    await first.sets.flush()
    first.app.stop()

    // Somewhere else, a track of this set gets another key: its old mixes are gone.
    const elsewhere = createSetApp({ overridesStore, provider: provider() })
    await elsewhere
      .run(() => useOverridesStore())
      .save({ trackId: wcsId('Brother'), camelot: '5A', bpm: 78, note: null, label: null })

    const again = await open({ setsStore, overridesStore, setId: first.setId })
    const view = mixOf(await settled(again.workspace))
    expect(view).toMatchObject({ shownIndex: 0, chosen: false })
    expect(shownOrder(view)).not.toEqual(stale)
    expect(again.stored()?.chosenMix).toBeNull()
  })
})

describe('playlists that changed in Spotify', () => {
  const notice = (workspace: SetWorkspace, playlistId: string) =>
    workspace.notices.value.get(playlistId)
  const checked = (workspace: SetWorkspace) =>
    vi.waitFor(() => {
      const kinds = [...workspace.notices.value.values()].map((n) => n.kind)
      expect(kinds.length).toBeGreaterThan(0)
      expect(kinds).not.toContain('checking')
    }, SLOW)

  it('does not read a playlist that is still at the stored snapshot', async () => {
    let reads = 0
    server.use(
      http.get(`${SPOTIFY}/playlists/:id/items`, () => {
        reads++
        return HttpResponse.json(items([]))
      }),
    )
    const { workspace } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    expect(notice(workspace, 'a')).toEqual({ kind: 'checking' })
    await checked(workspace)
    expect(notice(workspace, 'a')).toEqual({ kind: 'unchanged' })
    expect(reads).toBe(0)
  })

  it('says what changed, and changes nothing until Update', async () => {
    const stored = EASY.slice(0, 5)
    const fresh = [...EASY.slice(1, 5), EASY[10] ?? '', EASY[11] ?? '']
    server.use(
      http.get(`${SPOTIFY}/playlists/a`, () =>
        HttpResponse.json(playlistDto('a', { snapshot_id: 'snap-2', name: 'Renamed' })),
      ),
      http.get(`${SPOTIFY}/playlists/a/items`, () => HttpResponse.json(items(fresh))),
    )
    const removed = EASY[0] ?? ''
    const { workspace, stored: set } = await open({
      playlists: [copy('a', stored), copy('b', EASY.slice(5, 10))],
      prepare: (current) => ({
        ...current,
        marks: { [removed]: 'mustInclude', [EASY[1] ?? '']: 'exclude' },
        mix: { ...current.mix, opener: removed, follows: [[removed, EASY[6] ?? '']] },
      }),
    })
    await checked(workspace)
    await settled(workspace)

    expect(notice(workspace, 'b')).toEqual({ kind: 'unchanged' })
    expect(notice(workspace, 'a')).toMatchObject({ kind: 'changed', label: '2 new, 1 removed' })
    const changed = notice(workspace, 'a')
    expect(changed?.kind === 'changed' && changed.added.map((t) => t.trackId)).toEqual([
      EASY[10],
      EASY[11],
    ])
    expect(changed?.kind === 'changed' && changed.removed.map((t) => t.trackId)).toEqual([removed])
    // Nothing has changed yet.
    expect(set()?.playlists[0]?.tracks.map((t) => t.trackId)).toEqual(stored)
    expect(workspace.selection.value?.inSet).toContain(removed)

    const dropped = workspace.updatePlaylist('a')
    expect(dropped?.tracks.map((t) => t.trackId)).toEqual([removed])
    expect(dropped?.marks).toEqual([{ trackId: removed, mark: 'mustInclude' }])
    expect(dropped?.rules).toEqual([
      { kind: 'opener', trackId: removed },
      { kind: 'follow', from: removed, to: EASY[6] },
    ])
    expect(notice(workspace, 'a')).toEqual({ kind: 'unchanged' })
    expect(set()?.playlists[0]).toMatchObject({ name: 'Renamed', snapshotId: 'snap-2' })
    expect(set()?.playlists[0]?.tracks.map((t) => t.trackId)).toEqual(fresh)
    expect(set()?.marks).toEqual({ [EASY[1] ?? '']: 'exclude' })
    expect(set()?.mix).toMatchObject({ opener: null, follows: [] })
    // Nothing more to apply.
    expect(workspace.updatePlaylist('a')).toBeNull()

    // The new tracks go through the track choices like any other, once their data is in.
    const view = mixOf(await settled(workspace))
    expect(workspace.selection.value?.inSet).not.toContain(removed)
    expect(statusOf(workspace, EASY[10] ?? '')).toBe('in')
    expect(view.shown.order).toHaveLength(10)
    expect(workspace.summary.value).toMatchObject({
      joined: [EASY[10], EASY[11]],
      left: [removed],
    })
  })

  it('never shows the new tracks as lacking data while they are looked up', async () => {
    const fresh = [...EASY.slice(0, 5), EASY[10] ?? '']
    server.use(
      http.get(`${SPOTIFY}/playlists/a`, () =>
        HttpResponse.json(playlistDto('a', { snapshot_id: 'snap-2' })),
      ),
      http.get(`${SPOTIFY}/playlists/a/items`, () => HttpResponse.json(items(fresh))),
    )
    const { workspace } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    await checked(workspace)
    await settled(workspace)
    const seen = new Set<string | undefined>()
    workspace.updatePlaylist('a')
    // At once: the new track is in the pool, and the last selection stays until its data is in.
    expect(workspace.tracks.value.has(EASY[10] ?? '')).toBe(true)
    expect(workspace.featuresLoading.value).toBe(true)
    expect(workspace.updating.value).toBe(true)
    expect(statusOf(workspace, EASY[10] ?? '')).toBeUndefined()
    expect(workspace.features.value.get(EASY[0] ?? '')?.bpm?.value).toBe(78)
    await vi.waitFor(() => {
      seen.add(statusOf(workspace, EASY[10] ?? ''))
      expect(workspace.featuresLoading.value).toBe(false)
      expect(workspace.updating.value).toBe(false)
      expect(seen).toContain('in')
    }, SLOW)
    expect(seen).not.toContain('needsData')
  })

  it('reads the tracks when Spotify gives no snapshot, and finds no change in the same tracks', async () => {
    const tracks = EASY.slice(0, 5)
    server.use(
      http.get(`${SPOTIFY}/playlists/a`, () =>
        HttpResponse.json(playlistDto('a', { snapshot_id: undefined })),
      ),
      // The same tracks in another order are no change.
      http.get(`${SPOTIFY}/playlists/a/items`, () =>
        HttpResponse.json(items([...tracks].reverse())),
      ),
    )
    const { workspace } = await open({ playlists: [copy('a', tracks)] })
    await checked(workspace)
    expect(notice(workspace, 'a')).toEqual({ kind: 'unchanged' })
    expect(workspace.updatePlaylist('a')).toBeNull()
  })

  it('says a playlist can’t be checked, and keeps its stored copy', async () => {
    const sourceWrites: string[] = []
    server.use(
      http.get(`${SPOTIFY}/playlists/gone`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${SPOTIFY}/playlists/followed`, () =>
        HttpResponse.json(playlistDto('followed', { owner: { id: 'someone' } })),
      ),
      http.get(`${SPOTIFY}/playlists/down`, () => HttpResponse.json({}, { status: 500 })),
      http.all(`${SPOTIFY}/*`, ({ request }) => {
        if (request.method !== 'GET') sourceWrites.push(request.url)
        return undefined
      }),
    )
    const { workspace, stored } = await open({
      playlists: [
        copy('gone', EASY.slice(0, 5)),
        copy('followed', EASY.slice(5, 10)),
        copy('down', EASY.slice(10, 15)),
      ],
    })
    await checked(workspace)
    expect(notice(workspace, 'gone')).toMatchObject({ kind: 'cantCheck', reason: 'gone' })
    expect(notice(workspace, 'followed')).toMatchObject({ kind: 'cantCheck', reason: 'notYours' })
    expect(notice(workspace, 'down')).toMatchObject({ kind: 'cantCheck', reason: 'failed' })
    for (const id of ['gone', 'followed', 'down']) {
      const found = notice(workspace, id)
      expect(found?.kind === 'cantCheck' && found.message).toMatch(/keeps its stored copy/)
      expect(workspace.updatePlaylist(id)).toBeNull()
    }
    expect(stored()?.playlists.map((p) => p.tracks.length)).toEqual([5, 5, 5])
    expect(mixOf(await settled(workspace)).shown.order).toHaveLength(15)
    expect(sourceWrites).toEqual([])
  })

  it('checks again on request', async () => {
    let snapshot = 'snap-1'
    server.use(
      http.get(`${SPOTIFY}/playlists/a`, () =>
        HttpResponse.json(playlistDto('a', { snapshot_id: snapshot })),
      ),
      http.get(`${SPOTIFY}/playlists/a/items`, () => HttpResponse.json(items(EASY.slice(0, 4)))),
    )
    const { workspace } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    await checked(workspace)
    expect(notice(workspace, 'a')).toEqual({ kind: 'unchanged' })
    snapshot = 'snap-2'
    await workspace.checkPlaylists()
    expect(notice(workspace, 'a')).toMatchObject({ kind: 'changed', label: '1 removed' })
  })
})

describe('a large pool', () => {
  /** Orders nothing: the tracks as they come. These tests are about what is worked out again. */
  function countingSolver() {
    let runs = 0
    const client: SolverClient = (request) => {
      runs++
      const left = new Set(request.constraints.excluded)
      const order = request.tracks.filter((t) => !left.has(t.id))
      const stats = { expansions: 0, elapsedMs: 0, timedOut: false }
      return {
        result: Promise.resolve({
          kind: 'solved',
          candidates: [evaluateMix(order, request.profile)],
          stats,
        }),
        cancel: () => undefined,
      }
    }
    return { client, runs: () => runs }
  }

  it('re-selects only when a track choice changes, not for the arc or the chosen mix', async () => {
    // 1,000 tracks in the pool, 60 of them in the set.
    const pool = Array.from({ length: 1000 }, (_, i) => `x${80 + (i % 60)}n${i}`)
    const solver = countingSolver()
    const { workspace } = await open({
      playlists: [copy('big', pool)],
      prepare: (set) => ({
        ...set,
        playlists: set.playlists.map((p) => ({ ...p, choices: { ...p.choices, limit: 60 } })),
      }),
      solverClient: solver.client,
    })
    await settled(workspace)
    const selection = workspace.selection.value
    const tracks = workspace.tracks.value
    const features = workspace.features.value
    expect(selection?.pool).toBe(1000)
    expect(selection?.inSet).toHaveLength(60)
    expect(solver.runs()).toBe(1)

    // The arc asks for another mix of the same tracks; choosing one asks for nothing.
    workspace.setArc('twoWaves')
    await vi.waitFor(() => {
      expect(solver.runs()).toBe(2)
    }, SLOW)
    await settled(workspace)
    workspace.chooseAlternative(0)
    await settled(workspace)
    expect(workspace.selection.value).toBe(selection)
    expect(workspace.tracks.value).toBe(tracks)
    expect(workspace.features.value).toBe(features)
    expect(solver.runs()).toBe(2)

    // A range selects again, at once, over the same pool and the same track data.
    workspace.setBpmRange('big', { min: 90, max: null })
    expect(workspace.selection.value).not.toBe(selection)
    expect(workspace.selection.value?.playlists[0]?.counts.byReason.outsideRange).toBeGreaterThan(0)
    expect(workspace.tracks.value).toBe(tracks)
    expect(workspace.features.value).toBe(features)
  })
})

describe('follow pairs from a row (§9.1)', () => {
  it('gives a track its follower, replacing the one it had', async () => {
    const [a, b, c] = EASY
    const { workspace, stored } = await open({ playlists: [copy('a', EASY.slice(0, 6))] })
    workspace.setFollower(a ?? '', b ?? '')
    workspace.setFollower(b ?? '', c ?? '')
    expect(stored()?.mix.follows).toEqual([
      [a, b],
      [b, c],
    ])
    workspace.setFollower(a ?? '', c ?? '')
    expect(stored()?.mix.follows).toEqual([
      [b, c],
      [a, c],
    ])
  })
})

describe('the set’s playlists (U13)', () => {
  it('adds playlists as they are in Spotify now, and their tracks join the pool', async () => {
    server.use(
      http.get(`${SPOTIFY}/playlists/b/items`, () => HttpResponse.json(items(EASY.slice(5, 8)))),
    )
    const { workspace, stored } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    await settled(workspace)

    expect(await workspace.addPlaylists([{ id: 'b', name: 'Playlist b' }])).toBe(true)
    expect(stored()?.playlists.map((p) => [p.playlistId, p.snapshotId])).toEqual([
      ['a', 'snap-1'],
      ['b', 'snap-1'],
    ])
    expect(workspace.tracks.value.size).toBe(8)

    const view = mixOf(await settled(workspace))
    expect(view.shown.order).toHaveLength(8)
    expect(workspace.summary.value).toMatchObject({ joined: EASY.slice(5, 8), left: [] })
  })

  it('adds nothing when a playlist can’t be read, and says which', async () => {
    server.use(
      http.get(`${SPOTIFY}/playlists/b/items`, () => HttpResponse.json(items(EASY.slice(5, 8)))),
      http.get(`${SPOTIFY}/playlists/c`, () => HttpResponse.json({}, { status: 404 })),
    )
    const { workspace, stored } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    await settled(workspace)

    const added = await workspace.addPlaylists([
      { id: 'b', name: 'Playlist b' },
      { id: 'c', name: 'Gone' },
    ])
    expect(added).toBe(false)
    expect(workspace.adding.value).toMatchObject({ status: 'failed', playlist: 'Gone' })
    expect(stored()?.playlists.map((p) => p.playlistId)).toEqual(['a'])
    workspace.cancelAdd()
    expect(workspace.adding.value).toEqual({ status: 'idle' })
  })

  it('says what goes with a playlist, and removes exactly that', async () => {
    const [shared, own, other] = [EASY[0] ?? '', EASY[1] ?? '', EASY[6] ?? '']
    const { workspace, stored } = await open({
      playlists: [copy('a', EASY.slice(0, 5)), copy('b', [shared, ...EASY.slice(5, 10)])],
      prepare: (set) => ({
        ...set,
        marks: { [own]: 'exclude', [shared]: 'mustInclude' },
        mix: { ...set.mix, closer: own, follows: [[own, other]] },
      }),
    })
    await settled(workspace)

    const announced = workspace.removalOf('a')
    // The shared track stays: the other playlist still has it.
    expect(announced?.tracks.map((t) => t.trackId)).toEqual(EASY.slice(1, 5))
    expect(announced?.marks).toEqual([{ trackId: own, mark: 'exclude' }])
    expect(announced?.rules).toEqual([
      { kind: 'closer', trackId: own },
      { kind: 'follow', from: own, to: other },
    ])
    expect(stored()?.playlists).toHaveLength(2)

    expect(workspace.removePlaylist('a')).toEqual(announced)
    expect(stored()?.playlists.map((p) => p.playlistId)).toEqual(['b'])
    expect(stored()?.marks).toEqual({ [shared]: 'mustInclude' })
    expect(stored()?.mix).toMatchObject({ closer: null, follows: [] })
    const view = mixOf(await settled(workspace))
    expect(view.shown.order).toHaveLength(6)
    expect(workspace.removalOf('a')).toBeNull()
    expect(workspace.removePlaylist('a')).toBeNull()
  })
})

describe('the set’s name and its save to Spotify (§8.5)', () => {
  it('renames the set; a blank name is ignored', async () => {
    const { workspace, stored } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    workspace.rename('  Saturday social ')
    expect(stored()?.name).toBe('Saturday social')
    workspace.rename('   ')
    expect(stored()?.name).toBe('Saturday social')
  })

  it('has nothing to save until there is a mix', async () => {
    const solver = gatedSolver()
    const { workspace } = await open({
      playlists: [copy('a', EASY.slice(0, 5))],
      solverClient: solver.client,
    })
    expect(workspace.saveInput.value).toBeNull()
    solver.release()
  })

  it('offers the shown mix in order, with a description that names the set', async () => {
    const { workspace } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    const view = mixOf(await settled(workspace))
    const input = workspace.saveInput.value
    expect(input?.order).toEqual(shownOrder(view))
    expect(input?.uris).toEqual(shownOrder(view).map((id) => `spotify:track:${id}`))
    expect(input?.description).toMatch(/^Harmonic mix of “Friday social” made with Camelont: /)
    expect(input?.description).toMatch(/arc: none\.$/)
    workspace.setArc('twoWaves')
    await settled(workspace)
    expect(workspace.saveInput.value?.description).toMatch(/arc: Two waves\.$/)
  })

  it('remembers a save, and says when the mix has changed since', async () => {
    let now = 1000
    const setsStore = createMemoryStore()
    const { workspace, stored, sets, setId } = await open({
      setsStore,
      playlists: [copy('a', EASY)],
      now: () => now,
    })
    const view = mixOf(await settled(workspace))
    expect(workspace.saveState.value).toBe('never')
    const saved = (id: string, order: readonly string[]) => ({
      playlistId: id,
      url: `https://open.spotify.com/playlist/${id}`,
      name: 'Friday mix',
      order,
    })

    now = 5000
    workspace.recordSave(saved('new-mix', shownOrder(view)))
    expect(stored()?.lastSave).toEqual({
      playlistId: 'new-mix',
      url: 'https://open.spotify.com/playlist/new-mix',
      savedAt: 5000,
      name: 'Friday mix',
      order: shownOrder(view),
    })
    // The saved mix is the chosen one: reopening the set shows it.
    expect(stored()?.chosenMix).toEqual({ order: shownOrder(view) })
    expect(workspace.saveState.value).toBe('saved')
    // The set keeps its own name; the playlist's name is another matter.
    expect(stored()?.name).toBe('Friday social')

    workspace.chooseAlternative(1)
    expect(workspace.saveState.value).toBe('changed')
    workspace.chooseAlternative(0)
    expect(workspace.saveState.value).toBe('saved')
    // Renaming the set changes no mix.
    workspace.rename('Saturday social')
    expect(workspace.saveState.value).toBe('saved')

    // A change to the set gives another mix: changed, until it is saved again.
    workspace.setMark(EASY[3] ?? '', 'exclude')
    await settled(workspace)
    expect(workspace.saveState.value).toBe('changed')
    now = 9000
    workspace.recordSave(saved('second', shownOrder(workspace.view.value)))
    expect(stored()?.lastSave).toMatchObject({ savedAt: 9000, playlistId: 'second' })
    expect(workspace.saveState.value).toBe('saved')

    // As left, after a reload.
    const order = shownOrder(workspace.view.value)
    await sets.flush()
    const again = await open({ setsStore, setId })
    expect(shownOrder(await settled(again.workspace))).toEqual(order)
    expect(again.workspace.saveState.value).toBe('saved')
  })

  it('remembers the playlist of a save that fell short, as changed since', async () => {
    const { workspace, stored } = await open({ playlists: [copy('a', EASY.slice(0, 5))] })
    await settled(workspace)
    workspace.recordIncompleteSave({
      playlistId: 'short',
      url: 'https://open.spotify.com/playlist/short',
      name: 'Friday mix',
    })
    expect(stored()?.lastSave).toMatchObject({ playlistId: 'short', order: [] })
    expect(workspace.saveState.value).toBe('changed')
  })
})
