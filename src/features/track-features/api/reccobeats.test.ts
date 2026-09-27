import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { createReccoBeatsProvider, RECCOBEATS_API } from './reccobeats'

const id = (n: number) => `${'x'.repeat(20)}${String(n).padStart(2, '0')}`
const row = (trackId: string, extra: Record<string, unknown> = {}) => ({
  id: 'recco-uuid',
  href: `https://open.spotify.com/track/${trackId}`,
  key: 9,
  mode: 1,
  tempo: 127.435,
  energy: 0.715,
  ...extra,
})

describe('ReccoBeats provider', () => {
  it('matches rows by href, converts to Camelot and reports unknown tracks', async () => {
    server.use(
      http.get(`${RECCOBEATS_API}/audio-features`, () =>
        HttpResponse.json({
          content: [
            row(id(2), { key: -1 }),
            row(id(1)),
            { broken: true },
            row('notrequested00000000000'),
          ],
        }),
      ),
    )
    const out = await createReccoBeatsProvider().fetch([id(1), id(2), id(3)], 42)
    expect(out).toEqual([
      { trackId: id(1), found: true, camelot: '11B', bpm: 127.4, energy: 0.715, fetchedAt: 42 },
      { trackId: id(2), found: true, camelot: null, bpm: 127.4, energy: 0.715, fetchedAt: 42 },
      { trackId: id(3), found: false, fetchedAt: 42 },
    ])
  })

  it('asks in batches of 40', async () => {
    const batches: number[] = []
    server.use(
      http.get(`${RECCOBEATS_API}/audio-features`, ({ request }) => {
        batches.push(new URL(request.url).searchParams.get('ids')?.split(',').length ?? 0)
        return HttpResponse.json({ content: [] })
      }),
    )
    await createReccoBeatsProvider().fetch(
      Array.from({ length: 85 }, (_, i) => id(i)),
      0,
    )
    expect(batches).toEqual([40, 40, 5])
  })

  it('throws on a failed batch so the caller can degrade', async () => {
    server.use(
      http.get(`${RECCOBEATS_API}/audio-features`, () => new HttpResponse(null, { status: 500 })),
    )
    await expect(createReccoBeatsProvider().fetch([id(1)], 0)).rejects.toMatchObject({
      kind: 'http',
    })
  })
})
