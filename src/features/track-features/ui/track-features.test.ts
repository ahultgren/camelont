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
            h('span', { 'data-testid': 'energy' }, value(known?.energy)),
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
const energyOf = (title: string) => rowOf(title).getByTestId('energy').textContent
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
    expect(energyOf('Pompeii')).toBe('0.7 (reccobeats)')
    expect(keyOf('Lemon Tree')).toBe('unknown')
    expect(bpmOf('Lemon Tree')).toBe('unknown')
    expect(energyOf('Lemon Tree')).toBe('unknown')
  })

  it('saves a correction that wins over fetched data', async () => {
    reccobeats()
    const overridesStore = createMemoryStore()
    await render({ cacheStore: createMemoryStore(), overridesStore })
    await loaded()
    await userEvent.click(rowOf('Price Tag').getByRole('button', { name: /Edit/ }))
    const dialog = await screen.findByRole('dialog')
    const said = within(dialog).getByText(/ReccoBeats says/)
    expect(said).toHaveTextContent('7B · F major, 175 BPM, energy 8.')
    // The Camelot code is shown; the name is its tooltip, and in the key's options.
    expect(within(said).getByTestId('key')).toHaveAttribute('title', 'F major')
    expect(within(said).getByText('· F major')).toHaveClass('sr-only')
    expect(within(dialog).getByRole('option', { name: '7B · F major' })).toBeInTheDocument()
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
    // Only what was changed is stored: the key and the energy stay ReccoBeats' own.
    expect(stored).toMatchObject({
      data: { bpm: 87.5, camelot: null, energy: null, note: 'half-time', label: 'Price Tag' },
    })
    expect(energyOf('Price Tag')).toBe('0.8 (reccobeats)')
  })

  it('saves an energy set by hand, entered as a level from 0 to 10', async () => {
    reccobeats()
    const overridesStore = createMemoryStore()
    await render({ cacheStore: createMemoryStore(), overridesStore })
    await loaded()
    await userEvent.click(rowOf('Pompeii').getByRole('button', { name: /Edit/ }))
    let dialog = await screen.findByRole('dialog', { name: 'Key, BPM and energy: Pompeii' })
    const field = () => within(dialog).getByRole('spinbutton', { name: 'Energy' })
    // ReccoBeats says 0.7: level 7.
    expect(field()).toHaveValue(7)
    expect(field()).toHaveAccessibleDescription(/^From 0 \(calm\) to 10 \(intense\)/)

    // Off the scale, or between two levels: said, and not saved.
    for (const wrong of ['11', '7.5', '-1']) {
      await userEvent.clear(field())
      await userEvent.type(field(), wrong)
      expect(field()).toHaveAccessibleDescription('Energy must be a whole number from 0 to 10.')
      expect(field()).toHaveAttribute('aria-invalid', 'true')
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    }

    await userEvent.clear(field())
    await userEvent.type(field(), '3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(energyOf('Pompeii')).toBe('0.3 (manual)')
    expect(keyOf('Pompeii')).toBe('11B (reccobeats)')
    expect(bpmOf('Pompeii')).toBe('127.4 (reccobeats)')
    expect(await overridesStore.get(id(1))).toMatchObject({
      data: { camelot: null, bpm: null, energy: 0.3 },
    })

    // The dialog says whose value it is, and still what ReccoBeats said.
    await userEvent.click(rowOf('Pompeii').getByRole('button', { name: /Edit/ }))
    dialog = await screen.findByRole('dialog')
    expect(field()).toHaveValue(3)
    expect(within(dialog).getByText(/ReccoBeats says/)).toHaveTextContent('energy 7.')
    expect(
      within(dialog)
        .getAllByText(/^Source:/)
        .map((badge) => badge.parentElement?.textContent),
    ).toEqual(['Source: ReccoBeats', 'Source: ReccoBeats', 'Source: Set by hand'])

    // Back at ReccoBeats' level, nothing is left to store.
    await userEvent.clear(field())
    await userEvent.type(field(), '7')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(energyOf('Pompeii')).toBe('0.7 (reccobeats)')
    })
    expect(await overridesStore.get(id(1))).toBeUndefined()
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
    expect(sources(dialog)).toEqual([
      'Source: ReccoBeats',
      'Source: ReccoBeats',
      'Source: ReccoBeats',
    ])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Half' }))
    await userEvent.type(within(dialog).getByRole('textbox'), 'checked by ear')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // Key and energy are still ReccoBeats' own; the BPM is the user's, with their note.
    await userEvent.click(rowOf('Price Tag').getByRole('button', { name: /Edit/ }))
    dialog = await screen.findByRole('dialog')
    expect(sources(dialog)).toEqual([
      'Source: ReccoBeats',
      'Source: Set by hand',
      'Source: ReccoBeats',
    ])
    expect(within(dialog).getByRole('textbox')).toHaveValue('checked by ear')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(rowOf('Lemon Tree').getByRole('button', { name: /Edit/ }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('ReccoBeats has no data for this track.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('no value yet')).toHaveLength(3)
  })

  it('fills in a track ReccoBeats does not know', async () => {
    reccobeats()
    await render()
    await loaded()
    await userEvent.click(rowOf('Lemon Tree').getByRole('button', { name: /Edit/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), '6B')
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'BPM' }), '88')
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Energy' }), '4')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(keyOf('Lemon Tree')).toBe('6B (manual)')
    })
    expect(bpmOf('Lemon Tree')).toBe('88 (manual)')
    expect(energyOf('Lemon Tree')).toBe('0.4 (manual)')
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

  it('imports corrections exported before energy could be set, and reports what changed', async () => {
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
    expect(energyOf('Lemon Tree')).toBe('unknown')
    const exported = useOverridesStore().exportText()
    expect(exported).toContain('"trackId": "track00000000000000003"')
    // What is exported now says that the energy is not set by hand.
    expect(exported).toContain('"energy": null')
  })

  it('imports an energy set by hand on another device', async () => {
    reccobeats()
    await render()
    await loaded()
    const file = new File(
      [
        JSON.stringify({
          app: 'camelont',
          kind: 'track-overrides',
          version: 1,
          exportedAt: '2026-10-11T00:00:00Z',
          overrides: [
            {
              trackId: id(1),
              camelot: null,
              bpm: null,
              energy: 0.9,
              note: null,
              label: 'Pompeii',
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
    expect(energyOf('Pompeii')).toBe('0.9 (manual)')
    expect(keyOf('Pompeii')).toBe('11B (reccobeats)')
  })
})
