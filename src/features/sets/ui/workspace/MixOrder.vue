<script setup lang="ts">
import { computed } from 'vue'
import { KeyWheel, RunningOrder, type EntryInfo } from '@/features/mix-view'
import { useWorkspaceUi } from './context'

/** The shown mix as keys used and as a running order with its pins (spec §9.1). */
const ui = useWorkspaceUi()
const { ws } = ui

const mix = computed(() => (ws.view.value.kind === 'mix' ? ws.view.value.shown : null))
const info = computed(() => {
  const all = new Map<string, EntryInfo>()
  for (const track of ws.tracks.value.values()) {
    all.set(track.trackId, {
      title: track.title,
      artists: track.artists,
      durationMs: track.durationMs,
    })
  }
  return all
})
const point = (trackId: string | null) => {
  ws.pointedTrackId.value = trackId
}
</script>

<template>
  <div
    v-if="mix"
    class="grid min-h-0 grid-cols-[minmax(0,132px)_minmax(0,1fr)] gap-3 max-sm:grid-cols-1"
  >
    <KeyWheel
      :mix="mix"
      :highlighted="ws.pointedTrackId.value"
      class="self-start max-sm:max-w-[180px]"
      @point="point"
    />
    <div
      class="min-h-0 overflow-y-auto overscroll-contain pr-1 max-sm:overflow-visible"
      tabindex="-1"
      data-testid="order-scroller"
    >
      <RunningOrder
        :mix="mix"
        :info="info"
        :highlighted="ws.pointedTrackId.value"
        :pinned="ws.set.value?.mix.follows ?? []"
        @point="point"
        @select="ui.reveal"
        @pin="ws.setFollower"
        @unpin="ws.removeFollow"
      />
    </div>
  </div>
  <p v-else class="text-[13px] text-muted">The running order shows here once there is a mix.</p>
</template>
