<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime } from '@/shared/lib'
import { useWorkspaceUi } from './context'

/** Where and when the mix was last saved to Spotify, and whether it changed since (§8.5). */
const { ws } = useWorkspaceUi()
const last = computed(() => ws.set.value?.lastSave ?? null)
</script>

<template>
  <span v-if="last" class="flex min-w-0 items-baseline gap-2 text-xs" data-testid="save-status">
    <span
      class="min-w-0 truncate"
      :class="ws.saveState.value === 'saved' ? 'text-ok' : 'text-warn'"
    >
      {{ ws.saveState.value === 'saved' ? 'Saved' : 'Changed since the save of' }}
      <time class="num" :datetime="new Date(last.savedAt).toISOString()">{{
        formatDateTime(last.savedAt)
      }}</time>
    </span>
    <a
      :href="last.url"
      target="_blank"
      rel="noopener"
      class="font-medium whitespace-nowrap text-accent underline"
      :title="`Open “${last.name}” in Spotify`"
      >Open in Spotify</a
    >
  </span>
</template>
