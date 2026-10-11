<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { PlaylistPicker, type PlaylistSummary } from '@/features/playlists'
import { AppButton, AppDialog } from '@/shared/ui'
import type { MixSet } from '../domain/types'
import { describeSkipped } from '../domain/skipped'
import { useCreateSet } from '../model/useCreateSet'

/** Names a set, picks its playlists and reads their tracks (spec U2, §8.1–8.2). */
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [set: MixSet] }>()

const name = ref('')
const selected = ref<PlaylistSummary[]>([])
const creator = useCreateSet()
const state = creator.state

watch(open, (isOpen) => {
  creator.reset()
  if (!isOpen) return
  name.value = ''
  selected.value = []
})

// The focused control disappears when the view changes; move focus to what replaced it.
const progress = useTemplateRef<HTMLElement>('progress')
const failure = useTemplateRef<HTMLElement>('failure')
const summary = useTemplateRef<HTMLElement>('summary')
watch(
  () => state.value.status,
  async (status) => {
    await nextTick()
    if (status === 'reading') progress.value?.focus()
    else if (status === 'failed') failure.value?.focus()
    else if (status === 'created') summary.value?.focus()
  },
)

function finish(set: MixSet) {
  emit('created', set)
  open.value = false
}

/** A set that left nothing out opens at once; otherwise the dialog says what was left out. */
async function submit() {
  const created = await creator.create(name.value, selected.value)
  if (created?.skipped.length === 0) finish(created.set)
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="New set"
    description="Camelont keeps its own copy of the playlists’ tracks. Your playlists are never changed."
  >
    <div
      v-if="state.status === 'created' && state.skipped.length"
      ref="summary"
      tabindex="-1"
      class="grid gap-3 outline-none"
    >
      <p role="status">“{{ state.set.name }}” is ready.</p>
      <div class="grid gap-1 text-sm">
        <p>Some items can’t be mixed and were left out:</p>
        <ul class="list-disc pl-5">
          <li v-for="playlist in state.skipped" :key="playlist.playlistId">
            {{ playlist.name }}: {{ describeSkipped(playlist.skipped) }}
          </li>
        </ul>
      </div>
      <div class="flex justify-end">
        <AppButton @click="finish(state.set)">Open the set</AppButton>
      </div>
    </div>

    <div
      v-else-if="state.status === 'reading'"
      ref="progress"
      tabindex="-1"
      class="grid gap-3 outline-none"
    >
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

    <!-- Kept (hidden) while reading, so a failed read returns to the same choices. -->
    <form
      v-show="state.status === 'idle' || state.status === 'failed'"
      class="grid gap-4"
      @submit.prevent="submit"
    >
      <label class="grid gap-1 text-sm font-medium">
        <span>Name <span class="font-normal text-muted">(optional)</span></span>
        <input
          v-model="name"
          type="text"
          class="rounded-lg border border-rule bg-surface px-3 py-2 font-normal"
          :placeholder="selected[0]?.name ?? 'The first playlist’s name'"
        />
      </label>

      <PlaylistPicker v-model:selected="selected" />

      <p
        v-if="state.status === 'failed'"
        ref="failure"
        tabindex="-1"
        role="alert"
        class="text-sm text-warn outline-none"
      >
        Couldn’t read “{{ state.playlist }}”: {{ state.message }}. No set was created.
      </p>

      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
        <AppButton type="submit" :disabled="selected.length === 0">
          {{ state.status === 'failed' ? 'Try again' : 'Create set' }}
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>
