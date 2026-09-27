import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryStore } from '@/shared/storage'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { RECCOBEATS } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import { useOverridesStore } from '../model/overrides-store'
import { useTrackFeatures } from '../model/useTrackFeatures'
import OverridesTransfer from './OverridesTransfer.vue'
import TrackTable from './TrackTable.vue'

const id = (n: number) => `track${'0'.repeat(16)}${String(n)}`
const rows = [
  { entryId: id(1), trackId: id(1), title: 'Pompeii', artists: ['Bastille'] },
  { entryId: id(2), trackId: id(2), title: 'Price Tag', artists: ['Jessie J'] },
  { entryId: id(3), trackId: id(3), title: 'Lemon Tree', artists: ['Pesho'] },
]

const Harness = defineComponent({
  setup() {
    const { features, providerError } = useTrackFeatures(rows.map((r) => r.trackId))
    return () => [
      providerError.value ? h('p', { role: 'alert' }, providerError.value) : null,
      h(TrackTable, { rows, features: features.value }),
      h(OverridesTransfer),
    ]
  },
})

function reccobeats(status = 200) {
  const calls: string[] = []
  server.use(
    http.get(`${RECCOBEATS}/audio-features`, ({ request }) => {
      calls.push(new URL(request.url).searchParams.get('ids') ?? '')
      if (status !== 200) return new HttpResponse(null, { status })
      return HttpResponse.json({
        content: [
          {
            href: `https://open.spotify.com/track/${id(2)}`,
            key: 5,
            mode: 1,
            tempo: 175,
            energy: 0.8,
          },
          {
            href: `https://open.spotify.com/track/${id(1)}`,
            key: 9,
            mode: 1,
            tempo: 127.4,
            energy: 0.7,
          },
        ],
      })
    }),
  )
  return calls
}

const render = (
  stores = { cacheStore: createMemoryStore(), overridesStore: createMemoryStore() },
) => renderRoutes({ routes: [route('/', Harness)], storage: loggedInStorage(), ...stores })

const rowOf = (title: string) => {
  const item = screen.getByText(title).closest('li')
  if (!item) throw new Error(title)
  return within(item)
}

describe('track features', () => {
  it('shows fetched keys in both notations with their source, and flags missing data', async () => {
    reccobeats()
    await render()
    await screen.findByText('11B')
    expect(rowOf('Pompeii').getByText('11B').parentElement).toHaveTextContent('11B · A major')
    expect(rowOf('Pompeii').getAllByText('ReccoBeats')).toHaveLength(2)
    expect(rowOf('Lemon Tree').getByText(/unknown key/)).toBeInTheDocument()
    expect(
      rowOf('Lemon Tree').getByRole('button', { name: 'Fix key and BPM of Lemon Tree' }),
    ).toBeInTheDocument()
  })

  it('saves a correction that wins over fetched data', async () => {
    reccobeats()
    const overridesStore = createMemoryStore()
    await render({ cacheStore: createMemoryStore(), overridesStore })
    await screen.findByText('11B')
    await userEvent.click(rowOf('Price Tag').getByRole('button', { name: /Edit/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/ReccoBeats says/)).toHaveTextContent('7B · F major, 175 BPM')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Half' }))
    await userEvent.type(within(dialog).getByRole('textbox'), 'half-time')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(rowOf('Price Tag').getByText(/87.5/)).toBeInTheDocument()
    expect(rowOf('Price Tag').getByText('Manual')).toBeInTheDocument()
    expect(rowOf('Price Tag').getByText('half-time')).toBeInTheDocument()
    const stored = await overridesStore.get(id(2))
    expect(stored).toMatchObject({
      data: { bpm: 87.5, camelot: null, note: 'half-time', label: 'Price Tag' },
    })
  })

  it('fills in a track ReccoBeats does not know', async () => {
    reccobeats()
    await render()
    await screen.findByText('11B')
    await userEvent.click(rowOf('Lemon Tree').getByRole('button', { name: /Fix/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), '6B')
    await userEvent.type(within(dialog).getByRole('spinbutton'), '88')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(rowOf('Lemon Tree').getByText('6B').parentElement).toHaveTextContent('6B · B♭ major')
    expect(rowOf('Lemon Tree').getByRole('button', { name: /Edit key/ })).toHaveTextContent('Edit')
  })

  it('uses the cache instead of refetching', async () => {
    const calls = reccobeats()
    const stores = { cacheStore: createMemoryStore(), overridesStore: createMemoryStore() }
    const first = await render(stores)
    await screen.findByText('11B')
    first.unmount()
    await render(stores)
    await screen.findByText('11B')
    expect(calls).toHaveLength(1)
  })

  it('degrades to missing data when ReccoBeats fails', async () => {
    reccobeats(500)
    await render()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(rowOf('Pompeii').getByText(/unknown key/)).toBeInTheDocument()
  })

  it('imports corrections and reports what changed', async () => {
    reccobeats()
    await render()
    await screen.findByText('11B')
    const file = new File(
      [
        JSON.stringify({
          app: 'camelont',
          kind: 'track-overrides',
          version: 1,
          exportedAt: '2026-09-27T00:00:00Z',
          overrides: [
            {
              trackId: id(3),
              camelot: '6B',
              bpm: 88,
              note: null,
              label: 'Lemon Tree',
              updatedAt: 1,
            },
          ],
        }),
      ],
      'overrides.json',
      { type: 'application/json' },
    )
    await userEvent.upload(screen.getByLabelText('Import corrections file'), file)
    expect(await screen.findByText('Imported: 1 new, 0 updated, 0 unchanged.')).toBeInTheDocument()
    expect(rowOf('Lemon Tree').getByText('6B')).toBeInTheDocument()
    expect(useOverridesStore().exportText()).toContain('"trackId": "track00000000000000003"')
  })
})
