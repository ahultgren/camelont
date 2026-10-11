<script setup lang="ts">
import { computed } from 'vue'
import { describeSummary } from '../../domain/change-summary'
import { useWorkspaceUi } from './context'

/** What the last change did (spec W4): tracks in and out, picks, cost before and after. */
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
    class="flex min-h-[18px] flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs leading-[18px]"
    role="status"
    aria-label="Last change"
    data-testid="change-summary"
  >
    <span v-if="parts.length === 0" class="text-muted">
      {{
        ws.summary.value
          ? 'The last change left the mix as it was.'
          : 'What a change does to the mix shows here.'
      }}
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
