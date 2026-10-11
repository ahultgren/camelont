<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { formatDateTime } from '@/shared/lib'
import { AppButton } from '@/shared/ui'
import type { SaveMode } from '../../domain/save'
import { useSaveSet } from '../../model/useSaveSet'
import { useWorkspaceUi } from './context'

/**
 * What the save dialog asks before anything is written (spec §8.5): the playlist's
 * name, with a warning when one of the user's playlists has it already, and, when the
 * set saved a playlist before, whether to replace that one or create another.
 *
 * Made when the dialog opens, so Spotify is asked then.
 */
const emit = defineEmits<{ done: [] }>()

const { ws } = useWorkspaceUi()
const saving = useSaveSet(ws)

const name = ref(saving.defaultName.value)
const target = saving.target

// Replacing is the default when it is on offer; the user's own choice stands after that.
const chosen = ref<SaveMode | null>(null)
const mode = computed<SaveMode>(() =>
  target.value.status === 'allowed' ? (chosen.value ?? 'replace') : 'create',
)

const nameCheck = computed(() => saving.nameCheck(name.value, mode.value))
const blank = computed(() => name.value.trim() === '')
const waiting = computed(() => target.value.status === 'checking')

const failure = ref<string | null>(null)
/** Something to know after a save that went through; the dialog stays open to say it. */
const note = ref<string | null>(null)

async function confirm() {
  if (blank.value || waiting.value || saving.saving.value) return
  failure.value = null
  const result = await saving.save(name.value, mode.value)
  if (!result.ok) {
    failure.value = result.message
    // What can be done now may be something else; the choice starts over.
    chosen.value = null
    return
  }
  if (result.note === null) emit('done')
  else note.value = result.note
}

// Focus starts on the name, selected: it is the one thing to confirm or change.
const field = useTemplateRef<HTMLInputElement>('field')
onMounted(async () => {
  await nextTick()
  field.value?.focus()
  field.value?.select()
})

/** Said to assistive tech when the check of the earlier playlist comes back. */
const announced = ref('')
watch(
  target,
  (now) => {
    if (now.status === 'allowed') {
      announced.value = `You can replace “${now.name}” or create another playlist.`
    } else if (now.status === 'refused') announced.value = now.reason
  },
  { immediate: true },
)

const confirmLabel = computed(() => {
  if (saving.saving.value) return mode.value === 'replace' ? 'Replacing…' : 'Saving…'
  return mode.value === 'replace' ? 'Replace in Spotify' : 'Save as new playlist'
})
</script>

<template>
  <div v-if="note" class="grid gap-4">
    <p role="status">{{ note }}</p>
    <div class="flex justify-end">
      <AppButton @click="emit('done')">Done</AppButton>
    </div>
  </div>

  <form v-else class="grid gap-4" novalidate @submit.prevent="confirm">
    <div class="grid gap-1">
      <label for="save-name" class="text-sm font-medium">Playlist name</label>
      <input
        id="save-name"
        ref="field"
        v-model="name"
        type="text"
        maxlength="100"
        autocomplete="off"
        class="rounded-lg border border-rule bg-surface px-3 py-2"
        aria-describedby="save-name-note"
      />
      <!-- A warning, never a block: Spotify allows two playlists with one name. -->
      <p id="save-name-note" class="min-h-5 text-[13px]" role="status">
        <span v-if="blank" class="text-warn">The playlist needs a name.</span>
        <span v-else-if="nameCheck.kind === 'taken'" class="text-warn">
          You already have a playlist called “{{ nameCheck.name }}”. Spotify allows two with the
          same name, so you can save anyway.
        </span>
        <span v-else-if="nameCheck.kind === 'unchecked'" class="text-muted">
          Couldn’t check whether you already have a playlist with this name ({{
            nameCheck.reason
          }}).
        </span>
        <span v-else-if="nameCheck.kind === 'checking'" class="text-muted">
          Checking your playlists for this name…
        </span>
      </p>
    </div>

    <fieldset v-if="target.status === 'allowed'" class="grid gap-2">
      <legend class="mb-1 text-sm font-medium">This set saved a playlist before</legend>
      <label
        class="flex items-start gap-2.5 rounded-lg border px-3 py-2"
        :class="mode === 'replace' ? 'border-accent' : 'border-rule'"
      >
        <input
          type="radio"
          name="save-mode"
          class="mt-1 accent-accent"
          :checked="mode === 'replace'"
          aria-describedby="save-replace-note"
          @change="chosen = 'replace'"
        />
        <span class="grid">
          <span class="font-medium">Replace “{{ target.name }}”</span>
          <span id="save-replace-note" class="text-[13px] text-muted">
            Saved
            <time :datetime="new Date(target.savedAt).toISOString()">{{
              formatDateTime(target.savedAt)
            }}</time
            >. Its current tracks go and this mix takes their place.
          </span>
        </span>
      </label>
      <label
        class="flex items-start gap-2.5 rounded-lg border px-3 py-2"
        :class="mode === 'create' ? 'border-accent' : 'border-rule'"
      >
        <input
          type="radio"
          name="save-mode"
          class="mt-1 accent-accent"
          :checked="mode === 'create'"
          aria-describedby="save-create-note"
          @change="chosen = 'create'"
        />
        <span class="grid">
          <span class="font-medium">Create another playlist</span>
          <span id="save-create-note" class="text-[13px] text-muted">
            “{{ target.name }}” stays as it is.
          </span>
        </span>
      </label>
    </fieldset>
    <p
      v-else-if="target.status === 'refused'"
      class="text-[13px] text-muted"
      data-testid="save-refused"
    >
      {{ target.reason }}
    </p>
    <p v-else-if="target.status === 'checking'" class="text-[13px] text-muted">
      Checking the playlist this set saved before…
    </p>
    <p class="sr-only" role="status">{{ announced }}</p>

    <p v-if="failure" role="alert" class="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
      {{ failure }}
    </p>

    <div class="grid gap-3">
      <p class="text-[13px] text-muted">
        {{
          mode === 'replace'
            ? 'No other playlist is touched.'
            : 'A new playlist is private. None of your playlists is touched.'
        }}
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <AppButton variant="secondary" @click="emit('done')">Cancel</AppButton>
        <AppButton type="submit" :disabled="blank || waiting || saving.saving.value">
          {{ confirmLabel }}
        </AppButton>
      </div>
    </div>
  </form>
</template>
