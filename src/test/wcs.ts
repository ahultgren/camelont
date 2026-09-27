import wcs from './fixtures/wcs-set.json'

/** The WCS fixture as mixing input (structurally a `MixTrack`). */
export interface WcsTrack {
  id: string
  label: string
  camelot: string
  bpm: number
  energy: number | null
}

export const WCS_TRACKS: WcsTrack[] = wcs.tracks.map((t) => ({
  id: t.id,
  label: t.title,
  camelot: t.camelot,
  bpm: t.bpm,
  energy: t.energy,
}))

export type WcsOrderName = keyof typeof wcs.orders

export function wcsOrder(name: WcsOrderName): WcsTrack[] {
  const byId = new Map(WCS_TRACKS.map((t) => [t.id, t]))
  return wcs.orders[name].ids.map((id) => {
    const track = byId.get(id)
    if (!track) throw new Error(`Unknown fixture id ${id}`)
    return track
  })
}

export const wcsId = (title: string): string => {
  const track = WCS_TRACKS.find((t) => t.label.startsWith(title))
  if (!track) throw new Error(`No fixture track titled ${title}`)
  return track.id
}
