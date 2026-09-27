// Public API of the track-features feature. Other layers import only from here.
export {
  isMixable,
  SOURCE_LABEL,
  type FeatureSource,
  type Override,
  type Sourced,
  type TrackFeatures,
} from './domain/features'
export type { ImportReport } from './domain/overrides'
export { installTrackFeatures, type TrackFeatureOptions } from './model/deps'
export { useOverridesStore } from './model/overrides-store'
export { useTrackFeatures } from './model/useTrackFeatures'
export { default as OverridesTransfer } from './ui/OverridesTransfer.vue'
export { default as SourceBadge } from './ui/SourceBadge.vue'
export { default as TrackTable } from './ui/TrackTable.vue'
export type { TrackRow } from './ui/track-row'
