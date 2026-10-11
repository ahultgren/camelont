import { randomPick } from './random-pick'
import { selectTracks, type PickRequest, type SelectInput, type Selection } from './select'

/**
 * Best fit's picks for a request, when they are known. Best fit runs off the main thread
 * (it holds a solver run), so its answer may not be there yet.
 */
export type BestFitAnswers = (request: PickRequest) => readonly string[] | undefined

export interface SetSelection {
  selection: Selection
  /**
   * The first best-fit pick that has no answer yet; null when the selection is final.
   * Until it is answered the selection is a draft: nothing was picked from that
   * playlist on, but every status that needs no pick (and so the blockers) is final.
   */
  missing: PickRequest | null
}

/**
 * `selectTracks` with the real pick methods (spec §8.4): the random draw here, and best
 * fit from the answers at hand. Playlists pick in turn and each pick sees the earlier
 * ones, so the answers are asked for one at a time: answer `missing` and select again.
 */
export function selectForSet(
  input: Omit<SelectInput, 'pick'>,
  bestFit: BestFitAnswers,
): SetSelection {
  let missing: PickRequest | null = null
  const selection = selectTracks({
    ...input,
    pick: (request) => {
      if (missing) return []
      if (request.method === 'random') return randomPick(request)
      const answer = bestFit(request)
      if (answer === undefined) missing = request
      return answer ?? []
    },
  })
  return { selection, missing }
}
