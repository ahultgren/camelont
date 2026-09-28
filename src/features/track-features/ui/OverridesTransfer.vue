<script setup lang="ts">
import { ref } from 'vue'
import { AppButton } from '@/shared/ui'
import { useOverridesStore } from '../model/overrides-store'

/** Export/import all overrides as JSON, to move corrections between devices. */
const store = useOverridesStore()
const message = ref<{ tone: 'ok' | 'warn'; text: string } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function exportFile() {
  const blob = new Blob([store.exportText()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'camelont-overrides.json'
  a.click()
  URL.revokeObjectURL(url)
}

async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const result = await store.importText(await file.text())
  if (fileInput.value) fileInput.value.value = ''
  message.value = result.ok
    ? {
        tone: 'ok',
        text: `Imported: ${String(result.value.added)} new, ${String(result.value.updated)} updated, ${String(result.value.unchanged)} unchanged.`,
      }
    : { tone: 'warn', text: result.error }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <AppButton variant="secondary" :disabled="store.byTrack.size === 0" @click="exportFile">
      Export corrections
    </AppButton>
    <AppButton variant="secondary" @click="fileInput?.click()">Import corrections</AppButton>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="sr-only"
      aria-label="Import corrections file"
      @change="importFile"
    />
    <p
      v-if="message"
      role="status"
      class="text-sm"
      :class="message.tone === 'ok' ? 'text-ok' : 'text-warn'"
    >
      {{ message.text }}
    </p>
  </div>
</template>
