import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  shallowRef,
  type ComputedRef,
  type InjectionKey,
  type ShallowRef,
} from 'vue'
import { MOVE_META, moveBetween, type MoveMeta } from '@/features/mixing'
import type { CamelotKey } from '@/shared/music'
import { armBlock, followBlock, followerOf, leaderOf } from '../../domain/follow'
import type { SetWorkspace } from '../../model/useSetWorkspace'

/** What choosing a row would do while a track waits for its follower (spec §9.1). */
export interface FollowCandidate {
  /** The chart move the pair would make; null when it is unknown or a clash. */
  move: MoveMeta | null
  /** Why the row can't be chosen, in a few words; null when it can. */
  blocked: string | null
}

/**
 * What the workspace's components share besides the set itself: which track's key and
 * BPM are being edited, which track waits for a follower, and which row to bring into
 * view. One per workspace, provided by `WorkspaceScreen.vue`.
 */
export interface WorkspaceUi {
  ws: SetWorkspace
  titleOf: (trackId: string) => string
  playlistName: (playlistId: string) => string
  keyOf: (trackId: string) => CamelotKey | null
  /** Tracks that joined and left the set in the last change. */
  joined: ComputedRef<ReadonlySet<string>>
  left: ComputedRef<ReadonlySet<string>>

  /** The track whose key and BPM are being edited. */
  editing: ShallowRef<string | null>
  edit: (trackId: string) => void

  /** The track that waits for its follower ("Followed by…"). */
  armed: ShallowRef<string | null>
  /** Why a track can't be given a follower; null when it can. */
  armRefusal: (trackId: string) => string | null
  arm: (trackId: string) => void
  disarm: () => void
  candidate: (trackId: string) => FollowCandidate | null
  /** Completes the pair with this track, if it can be chosen. */
  choose: (trackId: string) => boolean

  /** A request to bring a track's row into view; the track column answers it. */
  revealed: ShallowRef<{ trackId: string } | null>
  reveal: (trackId: string) => void

  addingPlaylists: ShallowRef<boolean>
}

const KEY: InjectionKey<WorkspaceUi> = Symbol('camelont.workspace-ui')

export function provideWorkspaceUi(ws: SetWorkspace): WorkspaceUi {
  const titleOf = (trackId: string) => ws.tracks.value.get(trackId)?.title ?? 'a track'
  const playlistName = (playlistId: string) =>
    ws.set.value?.playlists.find((playlist) => playlist.playlistId === playlistId)?.name ??
    'another playlist'
  const keyOf = (trackId: string) => ws.features.value.get(trackId)?.camelot?.value ?? null

  const rules = computed(() => {
    const mix = ws.set.value?.mix
    return { opener: mix?.opener ?? null, closer: mix?.closer ?? null, follows: mix?.follows ?? [] }
  })

  const editing = shallowRef<string | null>(null)
  const armed = shallowRef<string | null>(null)
  const revealed = shallowRef<{ trackId: string } | null>(null)

  const armRefusal = (trackId: string): string | null => {
    if (keyOf(trackId) === null) return 'Needs a key first'
    if (ws.set.value?.marks[trackId] === 'exclude') return 'Excluded tracks are in no pair'
    return armBlock(rules.value, trackId) === 'closer' ? 'The closer is followed by nothing' : null
  }

  function candidate(trackId: string): FollowCandidate | null {
    const from = armed.value
    if (from === null || from === trackId) return null
    const fromKey = keyOf(from)
    const toKey = keyOf(trackId)
    const move = fromKey && toKey ? moveBetween(fromKey, toKey) : null
    const meta = move ? MOVE_META[move] : null
    const refuse = (blocked: string): FollowCandidate => ({ move: meta, blocked })
    switch (followBlock(rules.value, from, trackId)) {
      case 'already':
        return refuse('follows it already')
      case 'hasLeader':
        return refuse(`follows ${titleOf(leaderOf(rules.value.follows, trackId) ?? '')} already`)
      case 'cycle':
        return refuse('would close the chain on itself')
      case 'opener':
        return refuse('the opener follows nothing')
      case 'self':
      case null:
        break
    }
    if (ws.set.value?.marks[trackId] === 'exclude') return refuse('excluded')
    if (toKey === null) return refuse('needs a key')
    // Not in the chart: a clash, which no mix may contain.
    if (meta === null) return { move: MOVE_META.clash, blocked: 'would clash' }
    return { move: meta, blocked: null }
  }

  const disarm = () => {
    armed.value = null
  }
  // Esc cancels from anywhere, as the notice says.
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && armed.value !== null) disarm()
  }
  document.addEventListener('keydown', onKey)
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
  })

  const ui: WorkspaceUi = {
    ws,
    titleOf,
    playlistName,
    keyOf,
    joined: computed(() => new Set(ws.summary.value?.joined ?? [])),
    left: computed(() => new Set(ws.summary.value?.left ?? [])),

    editing,
    edit: (trackId) => {
      editing.value = trackId
    },

    armed,
    armRefusal,
    arm: (trackId) => {
      if (armRefusal(trackId) === null) armed.value = trackId
    },
    disarm,
    candidate,
    choose: (trackId) => {
      const from = armed.value
      if (from === null || candidate(trackId)?.blocked !== null) return false
      ws.setFollower(from, trackId)
      disarm()
      return true
    },

    revealed,
    reveal: (trackId) => {
      revealed.value = { trackId }
    },

    addingPlaylists: shallowRef(false),
  }
  provide(KEY, ui)
  return ui
}

export function useWorkspaceUi(): WorkspaceUi {
  const ui = inject(KEY)
  if (!ui) throw new Error('No workspace is provided here')
  return ui
}

/** The pairs a track is in: what it follows and what follows it. */
export function usePartners(ui: WorkspaceUi, trackId: () => string) {
  const follows = computed(() => ui.ws.set.value?.mix.follows ?? [])
  return {
    leader: computed(() => leaderOf(follows.value, trackId())),
    follower: computed(() => followerOf(follows.value, trackId())),
  }
}
