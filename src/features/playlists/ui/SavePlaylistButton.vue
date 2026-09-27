<script setup lang="ts">
import { AppButton, buttonClasses } from '@/shared/ui'
import { useSaveMix } from '../model/queries'

/** Saves tracks, in order, as a new private playlist (the source is never touched). */
const { name, description, uris } = defineProps<{
  name: string
  description: string
  uris: readonly string[]
}>()

const save = useSaveMix()
</script>

<template>
  <div class="grid justify-items-start gap-2">
    <AppButton
      :disabled="save.isPending.value || uris.length === 0"
      @click="save.mutate({ name, description, uris })"
    >
      {{ save.isPending.value ? 'Saving…' : 'Save as a new playlist' }}
    </AppButton>
    <p class="text-[13px] text-muted">
      Creates a private playlist “{{ name }}” in your account. Your original playlist isn’t changed.
    </p>
    <p
      v-if="save.isSuccess.value"
      role="status"
      class="flex flex-wrap items-center gap-2 text-sm text-ok"
    >
      Saved.
      <a
        :href="save.data.value?.url"
        target="_blank"
        rel="noopener"
        :class="buttonClasses('secondary')"
      >
        Open in Spotify
      </a>
    </p>
    <p v-if="save.isError.value" role="alert" class="text-sm text-warn">
      Saving failed: {{ save.error.value?.message }}. Nothing in your original playlist changed.
    </p>
  </div>
</template>
