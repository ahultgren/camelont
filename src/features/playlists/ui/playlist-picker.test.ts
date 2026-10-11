import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { spotifyHandlers } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import type { PlaylistSummary } from '../domain/types'
import PlaylistPicker from './PlaylistPicker.vue'

async function renderPicker(props: () => Record<string, unknown>) {
  server.use(...spotifyHandlers())
  const Host = defineComponent({ render: () => h(PlaylistPicker, props()) })
  await renderRoutes({ routes: [route('/', Host)], storage: loggedInStorage() })
}

describe('playlist picker', () => {
  async function renderSelecting(extra: Record<string, unknown> = {}) {
    const chosen = ref<PlaylistSummary[]>([])
    await renderPicker(() => ({
      ...extra,
      selected: chosen.value,
      'onUpdate:selected': (next: PlaylistSummary[]) => (chosen.value = next),
    }))
    await screen.findByRole('checkbox', { name: /WCS/ })
    return chosen
  }

  it('selects several playlists, in the order they were ticked', async () => {
    const chosen = await renderSelecting()
    expect(screen.getByText('None chosen yet')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /WCS/ })).toHaveAccessibleName(
      /WCS.*20 tracks · by me/,
    )

    await userEvent.click(screen.getByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /WCS/ }))
    expect(chosen.value.map((p) => p.id)).toEqual(['slow', 'wcs'])
    expect(screen.getByText('2 chosen: Slow ones, WCS')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /Slow ones/ }))
    expect(chosen.value.map((p) => p.id)).toEqual(['wcs'])
  })

  it('can’t select a followed playlist, and says why', async () => {
    const chosen = await renderSelecting()
    const followed = screen.getByRole('checkbox', { name: /Top Hits/ })
    expect(followed).toBeDisabled()
    expect(followed).toHaveAccessibleName(/Spotify only shares the tracks of playlists you own/)
    await userEvent.click(followed)
    expect(chosen.value).toEqual([])
  })

  it('keeps a chosen playlist chosen, and named, while a search hides it', async () => {
    const chosen = await renderSelecting()
    await userEvent.click(screen.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'slow')
    expect(screen.queryByRole('checkbox', { name: /WCS/ })).toBeNull()
    expect(screen.getByText('1 chosen: WCS')).toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox'))
    expect(screen.getByRole('checkbox', { name: /WCS/ })).toBeChecked()
    expect(chosen.value.map((p) => p.id)).toEqual(['wcs'])
  })

  it('filters by name', async () => {
    await renderSelecting()
    await userEvent.type(screen.getByRole('searchbox'), 'top')
    expect(screen.queryByRole('checkbox', { name: /WCS/ })).toBeNull()
    expect(screen.getByText('Top Hits')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByRole('heading', { name: 'No playlists found' })).toBeInTheDocument()
  })

  it('can’t select a playlist that is taken already, and says so', async () => {
    const chosen = await renderSelecting({ taken: ['wcs'] })
    const taken = screen.getByRole('checkbox', { name: /WCS/ })
    expect(taken).toBeDisabled()
    expect(taken).toHaveAccessibleName(/Already in this set/)
    await userEvent.click(taken)
    expect(chosen.value).toEqual([])
    expect(screen.getByRole('checkbox', { name: /Slow ones/ })).toBeEnabled()
  })
})
