<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PlaylistPicker, type PlaylistSummary } from '@/features/playlists'
import { AppButton, AppDialog } from '@/shared/ui'
import { useWorkspaceUi } from './context'

/** Adds playlists to the set: the same picker and the same reading as New set (U13). */
const ui = useWorkspaceUi()
const { ws } = ui
const open = ui.addingPlaylists

const selected = ref<PlaylistSummary[]>([])
const taken = computed(() => ws.set.value?.playlists.map((playlist) => playlist.playlistId) ?? [])
const state = computed(() => ws.adding.value)

watch(open, (isOpen) => {
  ws.cancelAdd()
  if (isOpen) selected.value = []
})

async function add() {
  if (await ws.addPlaylists(selected.value)) open.value = false
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="Add playlists"
    description="The set keeps its own copy of their tracks. Your playlists are never changed."
  >
    <div v-if="state.status === 'reading'" class="grid gap-3">
      <p role="status">
        Reading “{{ state.playlist }}”…
        <span class="num text-muted">{{ state.done + 1 }} of {{ state.total }}</span>
      </p>
      <progress
        class="h-2 w-full accent-accent"
        aria-label="Playlists read"
        :value="state.done"
        :max="state.total"
      />
      <div class="flex justify-end">
        <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
      </div>
    </div>
    <form v-show="state.status !== 'reading'" class="grid gap-4" @submit.prevent="add">
      <PlaylistPicker v-model:selected="selected" :taken="taken" />
      <p v-if="state.status === 'failed'" role="alert" class="text-sm text-warn">
        Couldn’t read “{{ state.playlist }}”: {{ state.message }}. Nothing was added.
      </p>
      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
        <AppButton type="submit" :disabled="selected.length === 0">
          {{ state.status === 'failed' ? 'Try again' : 'Add to the set' }}
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>
