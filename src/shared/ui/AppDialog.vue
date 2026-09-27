<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

/** Accessible modal (focus trap, Escape, labelled) in the app's look. */
defineProps<{ title: string; description?: string }>()
const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-rule bg-surface p-5 text-ink shadow-xl"
      >
        <div class="grid gap-1">
          <DialogTitle class="text-lg font-bold">{{ title }}</DialogTitle>
          <DialogDescription v-if="description" class="text-sm text-muted">
            {{ description }}
          </DialogDescription>
        </div>
        <slot />
        <DialogClose
          class="absolute top-3 right-3 rounded px-2 text-lg text-muted hover:text-ink"
          aria-label="Close"
          >×</DialogClose
        >
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
