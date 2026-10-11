import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryStore } from '@/shared/storage'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { RECCOBEATS } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import { useOverridesStore } from '../model/overrides-store'
import { useTrackFeatures } from '../model/useTrackFeatures'
import OverrideDialog from './OverrideDialog.vue'
import OverridesTransfer from './OverridesTransfer.vue'

const id = (n: number) => `track${'0'.repeat(16)}${String(n)}`
const rows = [
  { trackId: id(1), title: 'Pompeii' },
  { trackId: id(2), title: 'Price Tag' },
  { trackId: id(3), title: 'Lemon Tree' },
]

/** A bare track list: each track's values with their sources, and the edit dialog. */
const Harness = defineComponent({
  setup() {
    const { features, providerError } = useTrackFeatures(rows.map((r) => r.trackId))
    const editing = ref<(typeof rows)[number] | null>(null)
    const value = (sourced: { value: unknown; source: string } | null | undefined) =>
      sourced ? `${String(sourced.value)} (${sourced.source})` : 'unknown'
    return () => [
      providerError.value ? h('p', { role: 'alert' }, providerError.value) : null,
      h(
        'ul',
        rows.map((row) => {
          const known = features.value.get(row.trackId)
          return h('li', [
            h('b', row.title),
            h('span', { 'data-testid': 'key' }, value(known?.camelot)),
            h('span', { 'data-testid': 'bpm' }, value(known?.bpm)),
            h('span', { 'data-testid': 'note' }, known?.note ?? ''),
            h('button', { onClick: () => (editing.value = row) }, `Edit ${row.title}`),
          ])
        }),
      ),
      editing.value
        ? h(OverrideDialog, {
            open: true,
            'onUpdate:open': (open: boolean) => {
              if (!open) editing.value = null
            },
            trackId: editing.value.trackId,
            label: editing.value.title,
            features: features.value.get(editing.value.trackId),
          })
        : null,
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

const keyOf = (title: string) => rowOf(title).getByTestId('key').textContent
const bpmOf = (title: string) => rowOf(title).getByTestId('bpm').textContent
const loaded = () =>
  waitFor(() => {
    expect(keyOf('Pompeii')).toBe('11B (reccobeats)')
  })

describe('track features', () => {
  it('gives fetched keys and tempos with their source, and none for unknown tracks', async () => {
    reccobeats()
    await render()
    await loaded()
    expect(bpmOf('Pompeii')).toBe('127.4 (reccobeats)')
    expect(keyOf('Lemon Tree')).toBe('unknown')
    expect(bpmOf('Lemon Tree')).toBe('unknown')
  })

  it('saves a correction that wins over fetched data', async () => {
    reccobeats()
    const overridesStore = createMemoryStore()
    await render({ cacheStore: createMemoryStore(), overridesStore })
    await loaded()
    await userEvent.click(rowOf('Price Tag').getByRole('button', { name: /Edit/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/ReccoBeats says/)).toHaveTextContent('7B · F major, 175 BPM')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Half' }))
    await userEvent.type(within(dialog).getByRole('textbox'), 'half-time')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(bpmOf('Price Tag')).toBe('87.5 (manual)')
    expect(keyOf('Price Tag')).toBe('7B (reccobeats)')
    expect(rowOf('Price Tag').getByTestId('note')).toHaveTextContent('half-time')
    const stored = await overridesStore.get(id(2))
    expect(stored).toMatchObject({
      data: { bpm: 87.5, camelot: null, note: 'half-time', label: 'Price Tag' },
    })
  })

  it('shows in the dialog where each value in use came from', async () => {
    reccobeats()
    await render()
    await loaded()
    const sources = (dialog: HTMLElement) =>
      within(dialog)
        .getAllByText(/^Source:/)
        .map((badge) => badge.parentElement?.textContent)

    await userEvent.click(rowOf('Price Tag').getByRole('button', { name: /Edit/ }))
    let dialog = await screen.findByRole('dialog')
    expect(sources(dialog)).toEqual(['Source: ReccoBeats', 'Source: ReccoBeats'])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Half' }))
    await userEvent.type(within(dialog).getByRole('textbox'), 'checked by ear')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // The key is still ReccoBeats' own; the BPM is the user's, with their note.
    await userEvent.click(rowOf('Price Tag').getByRole('button', { name: /Edit/ }))
    dialog = await screen.findByRole('dialog')
    expect(sources(dialog)).toEqual(['Source: ReccoBeats', 'Source: Set by hand'])
    expect(within(dialog).getByRole('textbox')).toHaveValue('checked by ear')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(rowOf('Lemon Tree').getByRole('button', { name: /Edit/ }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('ReccoBeats has no data for this track.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('no value yet')).toHaveLength(2)
  })

  it('fills in a track ReccoBeats does not know', async () => {
    reccobeats()
    await render()
    await loaded()
    await userEvent.click(rowOf('Lemon Tree').getByRole('button', { name: /Edit/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), '6B')
    await userEvent.type(within(dialog).getByRole('spinbutton'), '88')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(keyOf('Lemon Tree')).toBe('6B (manual)')
    })
    expect(bpmOf('Lemon Tree')).toBe('88 (manual)')
  })

  it('uses the cache instead of refetching', async () => {
    const calls = reccobeats()
    const stores = { cacheStore: createMemoryStore(), overridesStore: createMemoryStore() }
    const first = await render(stores)
    await loaded()
    first.unmount()
    await render(stores)
    await loaded()
    expect(calls).toHaveLength(1)
  })

  it('degrades to missing data when ReccoBeats fails', async () => {
    reccobeats(500)
    await render()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(keyOf('Pompeii')).toBe('unknown')
  })

  it('imports corrections and reports what changed', async () => {
    reccobeats()
    await render()
    await loaded()
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
    expect(keyOf('Lemon Tree')).toBe('6B (manual)')
    expect(useOverridesStore().exportText()).toContain('"trackId": "track00000000000000003"')
  })
})
