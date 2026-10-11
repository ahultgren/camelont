import { describe, expect, it } from 'vitest'
import {
  describeFailure,
  describeRefusal,
  namesake,
  playlistIdFromUrl,
  replaceRefusal,
  sameName,
} from './save'
import { addPlaylist, newSet } from './set'
import type { LastSave, MixSet } from './types'

const aSet = (id: string, name: string, playlistIds: string[]): MixSet =>
  playlistIds.reduce(
    (set, playlistId, index) =>
      addPlaylist(
        set,
        {
          playlistId,
          name: `Playlist ${playlistId}`,
          imageUrl: null,
          tracks: [],
          snapshotId: null,
          readAt: 1,
          skipped: { localFiles: 0, episodes: 0, unavailable: 0 },
        },
        index,
      ),
    newSet({ id, name, now: 1 }),
  )
const save = (playlistId: string | null): LastSave => ({
  playlistId,
  url: `https://open.spotify.com/playlist/${playlistId ?? 'unknown'}`,
  savedAt: 5,
  name: 'Friday mix',
  order: ['a', 'b'],
})

describe('the playlist a save may replace', () => {
  it('reads the playlist ID from a Spotify link', () => {
    expect(playlistIdFromUrl('https://open.spotify.com/playlist/37i9dQZF1DX')).toBe('37i9dQZF1DX')
    expect(playlistIdFromUrl('https://open.spotify.com/playlist/abc123?si=xyz')).toBe('abc123')
    expect(playlistIdFromUrl('https://open.spotify.com/album/abc123')).toBeNull()
    expect(playlistIdFromUrl('')).toBeNull()
  })

  it('allows the playlist the set saved, while no set draws from it', () => {
    const sets = [aSet('s1', 'Friday', ['wcs', 'slow']), aSet('s2', 'Saturday', ['odd'])]
    expect(replaceRefusal(save('mine'), sets)).toBeNull()
  })

  it('refuses a save whose playlist isn’t known', () => {
    const refusal = replaceRefusal(save(null), [aSet('s1', 'Friday', ['wcs'])])
    expect(refusal).toEqual({ kind: 'unknownPlaylist' })
    expect(refusal && describeRefusal(refusal)).toMatch(/saves a new one/)
  })

  it('refuses a playlist that any set on the device draws from, the saving set included', () => {
    const other = replaceRefusal(save('mine'), [
      aSet('s1', 'Friday', ['wcs']),
      aSet('s2', 'Saturday', ['odd', 'mine']),
    ])
    expect(other).toEqual({ kind: 'isSource', setName: 'Saturday' })
    expect(other && describeRefusal(other)).toBe(
      'The playlist saved before is a source of the set “Saturday”, and a source playlist is never changed.',
    )
    // The set's own saved playlist, added to it as a source later.
    expect(replaceRefusal(save('mine'), [aSet('s1', 'Friday', ['wcs', 'mine'])])).toEqual({
      kind: 'isSource',
      setName: 'Friday',
    })
  })
})

describe('a name that is taken', () => {
  const playlists = [
    { id: 'a', name: 'Friday Mix' },
    { id: 'b', name: '  WCS favourites ' },
  ]

  it('compares names without case and without spaces around them', () => {
    expect(sameName(' friday mix', 'Friday Mix ')).toBe(true)
    expect(sameName('Friday mix 2', 'Friday mix')).toBe(false)
    // Spaces inside a name are part of it.
    expect(sameName('Friday  mix', 'Friday mix')).toBe(false)
  })

  it('finds the playlist that has the name already', () => {
    expect(namesake('friday mix', playlists)?.id).toBe('a')
    expect(namesake('wcs FAVOURITES', playlists)?.id).toBe('b')
    expect(namesake('Saturday', playlists)).toBeNull()
    expect(namesake('   ', [{ id: 'x', name: '' }])).toBeNull()
  })

  it('doesn’t count the playlist that is being replaced', () => {
    expect(namesake('Friday mix', playlists, 'a')).toBeNull()
    expect(namesake('Friday mix', [...playlists, { id: 'c', name: 'friday mix' }], 'a')?.id).toBe(
      'c',
    )
  })
})

describe('a save that failed, in words', () => {
  it('says replacing isn’t available and that a new playlist can be saved instead', () => {
    expect(describeFailure('replace', 'unavailable', 'Friday mix', 'Not found')).toBe(
      'Spotify doesn’t accept replacing a playlist’s tracks (Not found), so replacing isn’t available. “Friday mix” is as it was. You can save as a new playlist instead.',
    )
  })

  it('says why Spotify may have refused, and that nothing changed', () => {
    const message = describeFailure('replace', 'forbidden', 'Friday mix', 'Forbidden')
    expect(message).toMatch(/^Spotify refused to change “Friday mix” \(Forbidden\)\./)
    expect(message).toMatch(/may only change private playlists/)
    expect(message).toMatch(/Nothing was changed\.$/)
  })

  it('says a playlist is incomplete and that trying again starts over', () => {
    expect(describeFailure('replace', 'incomplete', 'Friday mix', 'Bad gateway')).toBe(
      '“Friday mix” is incomplete: its old tracks are gone and Spotify stopped taking the new ones (Bad gateway). Try again to replace it from the start.',
    )
    expect(describeFailure('create', 'incomplete', 'Friday mix', 'Bad gateway')).toBe(
      '“Friday mix” was created, but Spotify stopped taking its tracks (Bad gateway), so it is incomplete. Try again to replace it from the start.',
    )
  })

  it('says nothing changed when nothing was written', () => {
    expect(describeFailure('replace', 'failed', 'Friday mix', '')).toBe(
      '“Friday mix” couldn’t be replaced. Nothing was changed.',
    )
    expect(describeFailure('create', 'failed', 'Friday mix', 'Server error')).toBe(
      'The playlist couldn’t be created (Server error). Nothing in Spotify changed.',
    )
    expect(describeFailure('create', 'forbidden', 'Friday mix', 'Forbidden')).toMatch(
      /^The playlist couldn’t be created \(Forbidden\)/,
    )
  })
})
