// Public API of the sets feature. Other layers import only from here.
export type {
  ChosenMix,
  LastSave,
  MixSet,
  MixSettings,
  PickMethod,
  SetArc,
  SetPlaylist,
  SetTrack,
  TrackChoices,
  TrackMark,
} from './domain/types'
export {
  addPlaylist,
  defaultChoices,
  duplicateSet,
  newSet,
  NO_MIX_SETTINGS,
  ruleTrackIds,
  saveState,
  type PlaylistCopy,
  type SaveState,
} from './domain/set'
export {
  diffPlaylist,
  playlistRemoval,
  removePlaylist,
  updatePlaylist,
  type Dropped,
  type DroppedRule,
  type PlaylistDiff,
} from './domain/playlist-diff'
export { randomPick, randomRank } from './domain/random-pick'
export {
  selectTracks,
  statusLabel,
  type PickFn,
  type PickRequest,
  type PickTrack,
  type PlaylistCounts,
  type PlaylistSelection,
  type SelectInput,
  type SelectPlaylist,
  type Selection,
  type StatusReason,
  type TrackData,
  type TrackStatus,
} from './domain/select'
export type { UnreadableSet } from './api/repository'
export { installSets, type SetsOptions } from './model/deps'
export { useSetsStore } from './model/sets-store'

// The set workspace (Step 4). Kept together: other work adds exports above.
export type { ChangeSummary, PickChange, SettledState } from './domain/change-summary'
export { roleOf, type TrackRole } from './domain/edits'
export type { ExcludedInRule, MixRule } from './domain/mix-problems'
export { describeChange } from './domain/playlist-diff'
export { chosenIndex, sameOrder } from './domain/set'
export { toPlaylistCopy, usePlaylistChanges, type PlaylistNotice } from './model/usePlaylistChanges'
export {
  useSetWorkspace,
  type SetWorkspace,
  type SetWorkspaceOptions,
  type WorkspaceProblem,
  type WorkspaceView,
} from './model/useSetWorkspace'

// The home page (step 5a).
export { poolSize } from './ui/set-summary'
export { default as SetsList } from './ui/SetsList.vue'
