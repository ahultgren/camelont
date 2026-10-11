<script setup lang="ts">
import { computed } from 'vue'
import { describeSummary } from '../../domain/change-summary'
import { useWorkspaceUi } from './context'

/**
 * What the last change did (spec W4): tracks in and out, picks, cost before and after.
 * Before the first change it takes no room.
 */
const ui = useWorkspaceUi()
const { ws } = ui

const parts = computed(() =>
  ws.summary.value ? describeSummary(ws.summary.value, ui.titleOf, ui.playlistName) : [],
)
const TONE = {
  tracks: 'text-ink',
  joined: 'text-ok',
  left: 'text-warn',
  picks: 'text-ink',
  cost: 'text-ink',
} as const
</script>

<template>
  <p
    class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs leading-[18px]"
    :class="ws.summary.value ? 'min-h-[18px]' : 'sr-only'"
    role="status"
    aria-label="Last change"
    data-testid="change-summary"
  >
    <span v-if="ws.summary.value && parts.length === 0" class="text-muted">
      The last change left the mix as it was.
    </span>
    <span
      v-for="part in parts"
      :key="part.kind + part.text"
      class="max-w-full truncate"
      :class="[TONE[part.kind], part.kind === 'tracks' || part.kind === 'cost' ? 'num' : '']"
      :title="part.full"
      >{{ part.text }}</span
    >
  </p>
</template>
