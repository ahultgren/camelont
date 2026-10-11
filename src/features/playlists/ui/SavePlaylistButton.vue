<script setup lang="ts">
import { AppButton } from '@/shared/ui'
import { useSaveMix } from '../model/queries'

/**
 * Saves tracks, in order, as a new private playlist. Nothing that exists in Spotify is
 * ever changed: saving again makes another playlist.
 */
const { name, description, uris } = defineProps<{
  name: string
  description: string
  uris: readonly string[]
}>()
const emit = defineEmits<{ saved: [playlist: { id: string; url: string }] }>()

const save = useSaveMix()
function run() {
  save.mutate(
    { name, description, uris },
    {
      onSuccess: (created) => {
        emit('saved', created)
      },
    },
  )
}
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <span v-if="save.isError.value" role="alert" class="max-w-[38ch] text-xs text-warn">
      Saving failed: {{ save.error.value?.message }}. Nothing in Spotify changed.
    </span>
    <AppButton
      class="h-8 whitespace-nowrap"
      :disabled="save.isPending.value || uris.length === 0"
      :title="`Creates a new private playlist “${name}” in your account. No playlist of yours is changed.`"
      @click="run"
    >
      {{ save.isPending.value ? 'Saving…' : 'Save to Spotify' }}
    </AppButton>
  </span>
</template>
