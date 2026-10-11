import type { WorkspaceProblem } from '../../model/useSetWorkspace'
import type { WorkspaceUi } from './context'

/** A way out of a problem, one click away (spec W9). */
export interface ProblemFix {
  label: string
  run: () => void
}

/** Left-out tracks offered by name before the list is cut. */
const OFFERED = 3

/**
 * The fixes offered next to a problem. They are shortcuts: every one is an edit the
 * user could also make in the track list or the pairs.
 */
export function fixesFor(problem: WorkspaceProblem, ui: WorkspaceUi): ProblemFix[] {
  const { ws } = ui
  const set = ws.set.value
  const title = ui.titleOf
  const inRule = (trackId: string) =>
    set !== null &&
    (set.mix.opener === trackId ||
      set.mix.closer === trackId ||
      set.mix.follows.some((pair) => pair.includes(trackId)))
  const unpair = (from: string, to: string): ProblemFix => ({
    label: `Remove the pair ${title(from)} → ${title(to)}`,
    run: () => {
      ws.removeFollow(from, to)
    },
  })
  const show = (trackId: string): ProblemFix => ({
    label: `Show ${title(trackId)}`,
    run: () => {
      ui.reveal(trackId)
    },
  })
  const exclude = (trackId: string): ProblemFix[] =>
    inRule(trackId)
      ? [show(trackId)]
      : [
          {
            label: `Exclude ${title(trackId)}`,
            run: () => {
              ws.setRole(trackId, 'exclude')
            },
          },
        ]
  const include = (trackIds: readonly string[]): ProblemFix[] =>
    trackIds.slice(0, OFFERED).map((trackId) => ({
      label: `Always include ${title(trackId)}`,
      run: () => {
        ws.setMark(trackId, 'mustInclude')
      },
    }))

  switch (problem.kind) {
    case 'empty':
      return set?.playlists.length === 0
        ? [
            {
              label: 'Add playlists',
              run: () => {
                ui.addingPlaylists.value = true
              },
            },
          ]
        : []
    case 'needsData':
      return [
        {
          label: `Set key and BPM of ${title(problem.trackId)}`,
          run: () => {
            ui.edit(problem.trackId)
          },
        },
        show(problem.trackId),
      ]
    case 'excludedInRule': {
      const { rule, trackId } = problem
      const dropRule: ProblemFix =
        rule.kind === 'follow'
          ? unpair(rule.from, rule.to)
          : {
              label: `Choose no ${rule.kind}`,
              run: () => {
                if (rule.kind === 'opener') ws.setOpener(null)
                else ws.setCloser(null)
              },
            }
      return [
        {
          label: `Stop excluding ${title(trackId)}`,
          run: () => {
            ws.setMark(trackId, null)
          },
        },
        dropRule,
      ]
    }
    case 'rule': {
      const { error } = problem
      switch (error.kind) {
        case 'clash-pair':
          return [unpair(error.from, error.to)]
        case 'branch-out':
          return error.to.map((to) => unpair(error.from, to))
        case 'branch-in':
          return error.from.map((from) => unpair(from, error.to))
        case 'self-follow':
          return [unpair(error.id, error.id)]
        case 'start-has-predecessor':
          return [unpair(error.predecessor, error.id)]
        case 'end-has-successor':
          return [unpair(error.id, error.successor)]
        case 'start-is-end':
        case 'unknown-track':
        case 'excluded-in-constraint':
          return [show(error.id)]
        case 'cycle':
        case 'chain-closes-early':
          return []
      }
      return []
    }
    case 'noMix': {
      const found = problem.diagnostic
      if (!found) return []
      switch (found.kind) {
        case 'isolated':
        case 'no-predecessor':
        case 'no-successor':
          return [...include(found.excludedOptions), ...exclude(found.id)]
        case 'too-many-openers':
        case 'too-many-closers':
        case 'shared-predecessor':
        case 'shared-successor':
          return found.ids.slice(0, OFFERED).flatMap(exclude)
        case 'no-order-found':
          return found.tightest.slice(0, OFFERED).flatMap((track) => exclude(track.id))
      }
      return []
    }
    case 'failed':
      return [
        {
          label: 'Try again',
          run: () => {
            ws.retry()
          },
        },
      ]
  }
}
