<script setup lang="ts">
import { AppDialog } from '@/shared/ui'
import SaveForm from './SaveForm.vue'

/** Save to Spotify always asks first (spec §8.5): nothing is written until confirmed. */
const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="Save to Spotify"
    description="The mix as it is shown, in its order. Nothing is written until you confirm."
  >
    <!-- Made anew each time the dialog opens: it asks Spotify how things are now. -->
    <SaveForm v-if="open" @done="open = false" />
  </AppDialog>
</template>
