import { describe, expect, it, vi } from 'vitest'
import type { TrackFeatureOptions } from '@/features/track-features'
import { parseCamelot } from '@/shared/music'
import { server } from '@/test/msw'
import { createSetApp } from '@/test/set-app'
import { fakeSpotify as spotifyFake } from '@/test/spotify-fake'
import { WCS_TRACKS } from '@/test/wcs'
import { addPlaylist, type PlaylistCopy } from '../domain/set'
import type { MixSet } from '../domain/types'
import { useSetsStore } from './sets-store'
import { useSaveSet, type SaveSet } from './useSaveSet'
import { useSetWorkspace, type SetWorkspace } from './useSetWorkspace'

vi.setConfig({ testTimeout: 60_000 })
const SLOW = { timeout: 15_000 }

// ── A set to save ──────────────────────────────────────────────────────────────────
const TRACKS = WCS_TRACKS.filter((track) => track.label !== 'Bloodstream').slice(0, 6)
const copy = (playlistId: string, name = `Playlist ${playlistId}`): PlaylistCopy => ({
  playlistId,
  name,
  imageUrl: null,
  tracks: TRACKS.map((track) => ({
    trackId: track.id,
    uri: `spotify:track:${track.id}`,
    title: track.label,
    artists: ['Artist'],
    durationMs: 200_000,
    imageUrl: null,
  })),
  snapshotId: 'snap-1',
  readAt: 1,
  skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
})
const provider: NonNullable<TrackFeatureOptions['provider']> = {
  fetch: (trackIds, now) =>
    Promise.resolve(
      trackIds.map((trackId) => {
        const known = WCS_TRACKS.find((track) => track.id === trackId)
        return known
          ? {
              trackId,
              found: true as const,
              camelot: parseCamelot(known.camelot),
              bpm: known.bpm,
              energy: null,
              fetchedAt: now,
            }
          : { trackId, found: false as const, fetchedAt: now }
      }),
    ),
}

/** The user's Spotify, answering this test's requests. */
function fakeSpotify(initial: Parameters<typeof spotifyFake>[0] = {}) {
  const spotify = spotifyFake(initial)
  server.use(...spotify.handlers)
  return spotify
}

// ── Opening the set and its save dialog ────────────────────────────────────────────
async function open(
  spotify: ReturnType<typeof fakeSpotify>,
  options: {
    playlists?: PlaylistCopy[]
    prepare?: (set: MixSet) => MixSet
    now?: () => number
  } = {},
) {
  const sources = options.playlists ?? [copy('src')]
  for (const source of sources) {
    if (!spotify.playlists.has(source.playlistId)) {
      spotify.playlists.set(source.playlistId, { name: source.name, owner: 'me' })
    }
  }
  const app = createSetApp({ provider, ...(options.now ? { now: options.now } : {}) })
  const sets = app.run(() => useSetsStore())
  await sets.ready
  const setId = sets.create({ name: 'Friday social', playlists: sources }).id
  if (options.prepare) sets.update(setId, options.prepare)
  const workspace = app.run(() => useSetWorkspace(setId, { debounceMs: 0 }))
  await vi.waitFor(() => {
    expect(workspace.view.value.kind).toBe('mix')
    expect(workspace.updating.value).toBe(false)
  }, SLOW)
  /** As opening the save dialog: Spotify is asked now. */
  const dialog = async (): Promise<SaveSet> => {
    const saving = app.run(() => useSaveSet(workspace))
    await vi.waitFor(() => {
      expect(saving.target.value.status).not.toBe('checking')
      expect(saving.nameCheck('x', 'create').kind).not.toBe('checking')
    }, SLOW)
    return saving
  }
  return { app, sets, setId, workspace, dialog, stored: () => sets.get(setId) }
}

const order = (workspace: SetWorkspace) =>
  workspace.view.value.kind === 'mix' ? workspace.view.value.shown.order.map((t) => t.id) : []
const uris = (workspace: SetWorkspace) => order(workspace).map((id) => `spotify:track:${id}`)

/** A set that has saved "Friday mix" as `new-1`. */
async function saved(
  spotify: ReturnType<typeof fakeSpotify>,
  options: Parameters<typeof open>[1] = {},
) {
  const opened = await open(spotify, options)
  const first = await opened.dialog()
  expect(await first.save('Friday mix', 'create')).toEqual({
    ok: true,
    replaced: false,
    note: null,
  })
  spotify.writes.length = 0
  return opened
}

// ── Tests ──────────────────────────────────────────────────────────────────────────
describe('the first save', () => {
  it('starts from the set’s name, has nothing to replace, and writes nothing by itself', async () => {
    const spotify = fakeSpotify()
    const { dialog } = await open(spotify)
    const saving = await dialog()
    expect(saving.defaultName.value).toBe('Friday social')
    expect(saving.target.value).toEqual({ status: 'none' })
    expect(spotify.writes).toEqual([])
  })

  it('creates a private playlist under the name given, and remembers it', async () => {
    const spotify = fakeSpotify()
    const { dialog, workspace, stored } = await open(spotify, { now: () => 5000 })
    const saving = await dialog()
    const result = await saving.save('  Friday mix ', 'create')
    expect(result).toEqual({ ok: true, replaced: false, note: null })
    expect(spotify.writes).toEqual([
      {
        method: 'POST',
        path: '/me/playlists',
        body: {
          name: 'Friday mix',
          description: expect.stringMatching(/^Harmonic mix of “Friday social”/) as string,
          public: false,
        },
      },
      { method: 'POST', path: '/playlists/new-1/items', body: { uris: uris(workspace) } },
    ])
    expect(stored()?.lastSave).toEqual({
      playlistId: 'new-1',
      url: 'https://open.spotify.com/playlist/new-1',
      savedAt: 5000,
      name: 'Friday mix',
      order: order(workspace),
    })
    expect(workspace.saveState.value).toBe('saved')
    // The set is not renamed by this.
    expect(stored()?.name).toBe('Friday social')
  })

  it('doesn’t save without a name', async () => {
    const spotify = fakeSpotify()
    const { dialog, stored } = await open(spotify)
    const saving = await dialog()
    expect(await saving.save('   ', 'create')).toEqual({
      ok: false,
      message: 'The playlist needs a name.',
    })
    expect(spotify.writes).toEqual([])
    expect(stored()?.lastSave).toBeNull()
  })

  it('has nothing to replace, whatever is asked', async () => {
    const spotify = fakeSpotify({ other: { name: 'Friday social', owner: 'me' } })
    const { dialog } = await open(spotify)
    const saving = await dialog()
    const result = await saving.save('Friday social', 'replace')
    expect(result.ok).toBe(false)
    expect(spotify.writes).toEqual([])
  })
})

describe('a name that one of my playlists already has', () => {
  const mine = {
    a: { name: 'WCS favourites', owner: 'me' },
    b: { name: 'Slow ones', owner: 'me' },
    // On the second page of the list.
    c: { name: 'Friday Mix', owner: 'me' },
    d: { name: 'Top Hits', owner: 'spotify' },
    e: { name: 'Shared', owner: 'friend', collaborative: true },
  }

  it('is found whatever the case and the spaces around it, on any page', async () => {
    const { dialog } = await open(fakeSpotify(mine))
    const saving = await dialog()
    expect(saving.nameCheck(' friday mix ', 'create')).toEqual({
      kind: 'taken',
      name: 'Friday Mix',
    })
    expect(saving.nameCheck('WCS FAVOURITES', 'create')).toEqual({
      kind: 'taken',
      name: 'WCS favourites',
    })
    expect(saving.nameCheck('Saturday mix', 'create')).toEqual({ kind: 'free' })
    expect(saving.nameCheck('', 'create')).toEqual({ kind: 'free' })
  })

  it('counts only playlists I own', async () => {
    const { dialog } = await open(fakeSpotify(mine))
    const saving = await dialog()
    expect(saving.nameCheck('Top Hits', 'create')).toEqual({ kind: 'free' })
    expect(saving.nameCheck('Shared', 'create')).toEqual({ kind: 'free' })
  })

  it('says it couldn’t check when my playlists can’t be listed', async () => {
    const spotify = fakeSpotify(mine)
    spotify.failList()
    const { dialog } = await open(spotify)
    const saving = await dialog()
    expect(saving.nameCheck('Friday mix', 'create')).toEqual({
      kind: 'unchecked',
      reason: 'Spotify said 500',
    })
    // It is a warning at most: the save goes through.
    expect((await saving.save('Friday mix', 'create')).ok).toBe(true)
  })

  it('never stops a save', async () => {
    const spotify = fakeSpotify(mine)
    const { dialog } = await open(spotify)
    const saving = await dialog()
    expect((await saving.save('Friday Mix', 'create')).ok).toBe(true)
    expect(spotify.written()).toEqual(['NEW', 'new-1'])
  })

  it('doesn’t count the playlist being replaced, but does when creating another', async () => {
    const spotify = fakeSpotify()
    const { dialog } = await saved(spotify)
    const again = await dialog()
    expect(again.nameCheck('Friday mix', 'replace')).toEqual({ kind: 'free' })
    expect(again.nameCheck('Friday mix', 'create')).toEqual({ kind: 'taken', name: 'Friday mix' })
  })
})

describe('saving again', () => {
  it('offers to replace the playlist of the last save, by its name in Spotify now', async () => {
    const spotify = fakeSpotify()
    const { dialog } = await saved(spotify, { now: () => 7000 })
    const renamed = spotify.playlists.get('new-1')
    if (renamed) renamed.name = 'Friday (renamed in Spotify)'
    const again = await dialog()
    expect(again.defaultName.value).toBe('Friday mix')
    expect(again.target.value).toEqual({
      status: 'allowed',
      playlistId: 'new-1',
      name: 'Friday (renamed in Spotify)',
      savedAt: 7000,
    })
    expect(spotify.writes).toEqual([])
  })

  it('replaces that playlist’s tracks, name and description, and nothing else', async () => {
    const spotify = fakeSpotify()
    let now = 1000
    const { dialog, workspace, stored } = await saved(spotify, { now: () => now })
    workspace.chooseAlternative(1)
    expect(workspace.saveState.value).toBe('changed')

    now = 9000
    const again = await dialog()
    expect(await again.save('Friday mix v2', 'replace')).toEqual({
      ok: true,
      replaced: true,
      note: null,
    })
    expect(spotify.writes).toEqual([
      { method: 'PUT', path: '/playlists/new-1/items', body: { uris: uris(workspace) } },
      {
        method: 'PUT',
        path: '/playlists/new-1',
        body: {
          name: 'Friday mix v2',
          description: expect.stringMatching(/^Harmonic mix of/) as string,
        },
      },
    ])
    expect(stored()?.lastSave).toEqual({
      playlistId: 'new-1',
      url: 'https://open.spotify.com/playlist/new-1',
      savedAt: 9000,
      name: 'Friday mix v2',
      order: order(workspace),
    })
    expect(workspace.saveState.value).toBe('saved')
    // Next time the dialog starts from the name used now.
    expect((await dialog()).defaultName.value).toBe('Friday mix v2')
  })

  it('creates another playlist when that is chosen, and leaves the first alone', async () => {
    const spotify = fakeSpotify()
    const { dialog, stored } = await saved(spotify)
    const again = await dialog()
    expect(await again.save('Friday mix', 'create')).toEqual({
      ok: true,
      replaced: false,
      note: null,
    })
    expect(spotify.calls()).toEqual(['POST /me/playlists', 'POST /playlists/new-2/items'])
    expect(stored()?.lastSave).toMatchObject({ playlistId: 'new-2', name: 'Friday mix' })
    // From now on it is the newer playlist that can be replaced.
    expect((await dialog()).target.value).toMatchObject({ status: 'allowed', playlistId: 'new-2' })
  })
})

describe('when the last save’s playlist may not be replaced', () => {
  const refusedFor = async (
    spotify: ReturnType<typeof fakeSpotify>,
    arrange: (opened: Awaited<ReturnType<typeof saved>>) => void,
  ) => {
    const opened = await saved(spotify)
    arrange(opened)
    const again = await opened.dialog()
    const target = again.target.value
    // Asking for a replace anyway writes nothing; a new playlist can still be saved.
    const result = await again.save('Friday mix', 'replace')
    expect(result.ok).toBe(false)
    expect(spotify.writes).toEqual([])
    expect((await again.save('Friday mix', 'create')).ok).toBe(true)
    expect(spotify.written()).toEqual(['NEW', 'new-2'])
    return { reason: target.status === 'refused' ? target.reason : target.status, result }
  }

  it('is gone from Spotify', async () => {
    const spotify = fakeSpotify()
    const { reason, result } = await refusedFor(spotify, () => spotify.playlists.delete('new-1'))
    expect(reason).toBe(
      'The playlist saved before is no longer in Spotify, so this saves a new one.',
    )
    expect(result).toEqual({ ok: false, message: `${reason} Nothing was written.` })
  })

  it('is no longer mine', async () => {
    const spotify = fakeSpotify()
    const { reason } = await refusedFor(spotify, () => {
      spotify.playlists.set('new-1', { name: 'Friday mix', owner: 'someone-else' })
    })
    expect(reason).toBe('The playlist saved before is no longer yours, so this saves a new one.')
  })

  it('is one I only collaborate on', async () => {
    const spotify = fakeSpotify()
    const { reason } = await refusedFor(spotify, () => {
      spotify.playlists.set('new-1', { name: 'Friday mix', owner: 'friend', collaborative: true })
    })
    expect(reason).toMatch(/no longer yours/)
  })

  it('can’t be checked', async () => {
    const spotify = fakeSpotify()
    const { reason } = await refusedFor(spotify, () => spotify.fail.set('GET new-1', 500))
    expect(reason).toBe(
      'The playlist saved before couldn’t be checked (Spotify said 500), so this saves a new one.',
    )
  })

  it('was saved before playlist IDs were recorded, and its link names none', async () => {
    const spotify = fakeSpotify()
    const { reason } = await refusedFor(spotify, ({ sets, setId }) => {
      sets.update(setId, (set) => ({
        ...set,
        lastSave: set.lastSave && { ...set.lastSave, playlistId: null },
      }))
    })
    expect(reason).toMatch(/can’t be told from its link/)
  })

  it('is a source of this set: added to it after it was saved', async () => {
    const spotify = fakeSpotify()
    const { reason } = await refusedFor(spotify, ({ sets, setId }) => {
      sets.update(setId, (set) => addPlaylist(set, copy('new-1', 'Friday mix'), 3))
    })
    expect(reason).toBe(
      'The playlist saved before is a source of the set “Friday social”, and a source playlist is never changed.',
    )
  })

  it('is a source of another set on this device', async () => {
    const spotify = fakeSpotify()
    const { reason } = await refusedFor(spotify, ({ sets }) => {
      sets.create({ name: 'Saturday', playlists: [copy('new-1', 'Friday mix')] })
    })
    expect(reason).toMatch(/is a source of the set “Saturday”/)
  })

  it('has the same name as a playlist of mine: that one is never offered', async () => {
    const spotify = fakeSpotify({ handmade: { name: 'Friday social', owner: 'me' } })
    const { dialog } = await open(spotify)
    const saving = await dialog()
    expect(saving.target.value).toEqual({ status: 'none' })
    expect(saving.nameCheck('Friday social', 'create')).toEqual({
      kind: 'taken',
      name: 'Friday social',
    })
    await saving.save('Friday social', 'create')
    expect(spotify.written()).toEqual(['NEW', 'new-1'])
  })
})

describe('checked again right before writing', () => {
  it('refuses when the playlist became a source while the dialog was open', async () => {
    const spotify = fakeSpotify()
    const { dialog, sets } = await saved(spotify)
    const again = await dialog()
    expect(again.target.value.status).toBe('allowed')

    sets.create({ name: 'Saturday', playlists: [copy('new-1', 'Friday mix')] })
    const result = await again.save('Friday mix', 'replace')
    expect(result).toEqual({
      ok: false,
      message:
        'The playlist saved before is a source of the set “Saturday”, and a source playlist is never changed. Nothing was written.',
    })
    expect(spotify.writes).toEqual([])
    // The dialog now knows, too.
    expect(again.target.value.status).toBe('refused')
  })

  it('refuses when the playlist stopped being mine while the dialog was open', async () => {
    const spotify = fakeSpotify()
    const { dialog } = await saved(spotify)
    const again = await dialog()
    spotify.playlists.set('new-1', { name: 'Friday mix', owner: 'someone-else' })
    const result = await again.save('Friday mix', 'replace')
    expect(result).toMatchObject({ ok: false })
    expect(spotify.writes).toEqual([])
    expect(again.target.value).toMatchObject({ status: 'refused' })
  })
})

describe('a replace that Spotify doesn’t take', () => {
  it('says replacing isn’t available, changes nothing, and stops offering it', async () => {
    const spotify = fakeSpotify()
    const { dialog, stored } = await saved(spotify)
    const before = stored()?.lastSave
    spotify.fail.set('set items', 404)
    const again = await dialog()
    const result = await again.save('Friday mix', 'replace')
    expect(result).toEqual({
      ok: false,
      message:
        'Spotify doesn’t accept replacing a playlist’s tracks (Spotify said 404), so replacing isn’t available. “Friday mix” is as it was. You can save as a new playlist instead.',
    })
    expect(spotify.calls()).toEqual(['PUT /playlists/new-1/items'])
    expect(stored()?.lastSave).toEqual(before)
    expect(again.target.value).toMatchObject({ status: 'refused' })
    // Saving as new works.
    expect((await again.save('Friday mix', 'create')).ok).toBe(true)
  })

  it('says so when Spotify forbids it, for example for a playlist made public', async () => {
    const spotify = fakeSpotify()
    const { dialog, stored } = await saved(spotify)
    const before = stored()?.lastSave
    spotify.fail.set('set items', 403)
    const again = await dialog()
    const result = await again.save('Friday mix', 'replace')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toMatch(
      /^Spotify refused to change “Friday mix” \(Spotify said 403\)\. Camelont may only change private playlists/,
    )
    expect(stored()?.lastSave).toEqual(before)
    // It may work once the playlist is private again: replacing is still offered.
    expect(again.target.value.status).toBe('allowed')
  })

  it('says the playlist is incomplete when it stopped half-way, and starts over on a retry', async () => {
    const spotify = fakeSpotify()
    const many = WCS_TRACKS.filter((track) => track.label !== 'Bloodstream')
    const big: PlaylistCopy = {
      ...copy('src'),
      // 120 entries: more than one batch. A track listed again counts once in the set,
      // so the mix is padded by hand below.
      tracks: many.map((track) => ({
        trackId: track.id,
        uri: `spotify:track:${track.id}`,
        title: track.label,
        artists: ['Artist'],
        durationMs: 200_000,
        imageUrl: null,
      })),
    }
    const { dialog, workspace, stored } = await saved(spotify, { playlists: [big] })
    // Make the save longer than a batch without a longer mix: repeat the URIs.
    const input = workspace.saveInput.value
    if (!input) throw new Error('no mix')
    const long = Array.from({ length: 120 }, (_, i) => input.uris[i % input.uris.length] ?? '')
    vi.spyOn(workspace.saveInput, 'value', 'get').mockReturnValue({ ...input, uris: long })

    spotify.fail.set('add items', 502)
    const again = await dialog()
    const result = await again.save('Friday mix', 'replace')
    expect(result).toEqual({
      ok: false,
      message:
        '“Friday mix” is incomplete: its old tracks are gone and Spotify stopped taking the new ones (Spotify said 502). Try again to replace it from the start.',
    })
    expect(spotify.calls()).toEqual(['PUT /playlists/new-1/items', 'POST /playlists/new-1/items'])
    // No mix counts as saved, but the playlist is still the set's own.
    expect(stored()?.lastSave).toMatchObject({ playlistId: 'new-1', order: [] })
    expect(workspace.saveState.value).toBe('changed')
    expect(again.target.value).toMatchObject({ status: 'allowed', playlistId: 'new-1' })

    spotify.fail.clear()
    spotify.writes.length = 0
    expect((await again.save('Friday mix', 'replace')).ok).toBe(true)
    // From the start: the first hundred replace, the rest are added.
    expect(spotify.calls()).toEqual([
      'PUT /playlists/new-1/items',
      'POST /playlists/new-1/items',
      'PUT /playlists/new-1',
    ])
    expect((spotify.writes[0]?.body as { uris: string[] }).uris).toEqual(long.slice(0, 100))
    expect((spotify.writes[1]?.body as { uris: string[] }).uris).toEqual(long.slice(100))
    expect(stored()?.lastSave?.order).toEqual(input.order)
  })

  it('counts as saved when only the new name wasn’t taken, and says so', async () => {
    const spotify = fakeSpotify()
    const { dialog, stored, workspace } = await saved(spotify)
    spotify.fail.set('details', 404)
    const again = await dialog()
    const result = await again.save('Another name', 'replace')
    expect(result).toEqual({
      ok: true,
      replaced: true,
      note: 'The tracks of “Friday mix” were replaced, but Spotify didn’t take the new name and description (Spotify said 404).',
    })
    // The playlist is still called what it was.
    expect(stored()?.lastSave).toMatchObject({ playlistId: 'new-1', name: 'Friday mix' })
    expect(workspace.saveState.value).toBe('saved')
  })
})

describe('a new playlist that Spotify doesn’t fill', () => {
  it('says nothing changed when it couldn’t be created', async () => {
    const spotify = fakeSpotify()
    spotify.fail.set('create', 500)
    const { dialog, stored } = await open(spotify)
    const saving = await dialog()
    expect(await saving.save('Friday mix', 'create')).toEqual({
      ok: false,
      message: 'The playlist couldn’t be created (Spotify said 500). Nothing in Spotify changed.',
    })
    expect(stored()?.lastSave).toBeNull()
  })

  it('remembers a playlist that was created but not filled, so a retry replaces it', async () => {
    const spotify = fakeSpotify()
    spotify.fail.set('add items', 502)
    const { dialog, stored, workspace } = await open(spotify)
    const saving = await dialog()
    const result = await saving.save('Friday mix', 'create')
    expect(result).toEqual({
      ok: false,
      message:
        '“Friday mix” was created, but Spotify stopped taking its tracks (Spotify said 502), so it is incomplete. Try again to replace it from the start.',
    })
    expect(stored()?.lastSave).toMatchObject({ playlistId: 'new-1', name: 'Friday mix', order: [] })
    expect(workspace.saveState.value).toBe('changed')
    expect(saving.target.value).toMatchObject({ status: 'allowed', playlistId: 'new-1' })

    spotify.fail.clear()
    spotify.writes.length = 0
    expect((await saving.save('Friday mix', 'replace')).ok).toBe(true)
    // No second playlist: the one that was created is filled.
    expect(spotify.written()).toEqual(['new-1'])
    expect(workspace.saveState.value).toBe('saved')
  })
})

describe('the rule: only a playlist this set’s own save created is ever written to', () => {
  it('holds across saving, replacing, creating another and replacing again', async () => {
    const spotify = fakeSpotify({
      handmade: { name: 'Friday mix', owner: 'me' },
      other: { name: 'Friday social', owner: 'me' },
    })
    const { dialog, workspace } = await open(spotify, {
      playlists: [copy('src'), copy('src2', 'Friday mix')],
    })
    await (await dialog()).save('Friday mix', 'create')
    workspace.chooseAlternative(1)
    await (await dialog()).save('Friday mix', 'replace')
    await (await dialog()).save('Friday social', 'create')
    workspace.chooseAlternative(0)
    await (await dialog()).save('Friday social', 'replace')

    // Never a source, never a playlist that only shares a name.
    expect(spotify.written()).toEqual(['NEW', 'new-1', 'new-2'])
    const touched = spotify.writes.filter((entry) => !entry.path.startsWith('/me/'))
    expect(touched.every((entry) => /^\/playlists\/new-[12](\/items)?$/.test(entry.path))).toBe(
      true,
    )
  })

  it('never writes to the saved playlist once any set draws from it', async () => {
    const spotify = fakeSpotify()
    const { dialog, sets, setId, workspace } = await saved(spotify)
    // The user adds the set's own saved playlist to the set as a source.
    sets.update(setId, (set) => addPlaylist(set, copy('new-1', 'Friday mix'), 9))
    await vi.waitFor(() => {
      expect(workspace.updating.value).toBe(false)
    }, SLOW)

    for (const mode of ['replace', 'create'] as const) {
      await (await dialog()).save('Friday mix', mode)
    }
    expect(spotify.written()).toEqual(['NEW', 'new-2'])
    expect(spotify.writes.some((entry) => entry.path.includes('new-1'))).toBe(false)
  })
})
