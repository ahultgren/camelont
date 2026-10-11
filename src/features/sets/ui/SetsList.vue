<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { formatDateTime } from '@/shared/lib'
import { AppButton, AppDialog, EmptyState } from '@/shared/ui'
import { saveState } from '../domain/set'
import type { MixSet } from '../domain/types'
import { useSetsStore } from '../model/sets-store'
import NewSetDialog from './NewSetDialog.vue'
import { trackCountLabel } from './set-summary'

/** The user's sets, newest edit first, with rename, duplicate and delete (spec U2, U12). */
defineProps<{ linkTo: (setId: string) => RouteLocationRaw }>()
defineEmits<{ created: [set: MixSet] }>()

const sets = useSetsStore()
const empty = computed(() => sets.loaded && sets.list.length === 0 && !sets.loadError)
const creating = ref(false)

const isoTime = (ms: number) => new Date(ms).toISOString()

/** Said to screen readers after an action whose only other sign is the list changing. */
const announcement = ref('')

const renaming = ref<MixSet | null>(null)
const newName = ref('')
function startRename(set: MixSet) {
  newName.value = set.name
  renaming.value = set
}
function rename() {
  const set = renaming.value
  if (!set || !newName.value.trim()) return
  const renamed = sets.rename(set.id, newName.value)
  if (renamed && renamed.name !== set.name) announcement.value = `Renamed to “${renamed.name}”.`
  renaming.value = null
}

function duplicate(set: MixSet) {
  const copy = sets.duplicate(set.id)
  if (copy) announcement.value = `Duplicated as “${copy.name}”.`
}

/** A set, or a stored one that can't be read: both are deleted by ID. */
const deleting = ref<{ id: string; label: string } | null>(null)
function remove() {
  const target = deleting.value
  if (!target) return
  void sets.remove(target.id)
  announcement.value = `Deleted ${target.label}.`
  deleting.value = null
}
</script>

<template>
  <section class="grid gap-4" aria-labelledby="sets-heading">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h1 id="sets-heading" class="text-[clamp(28px,5vw,40px)] leading-[1.05] font-bold">
        Your sets
      </h1>
      <!-- The empty state has its own. -->
      <AppButton v-if="!empty" @click="creating = true">New set</AppButton>
    </div>

    <p v-if="sets.loadError" role="alert" class="text-sm text-warn">
      Couldn’t read your sets from this device: {{ sets.loadError }}
    </p>
    <p v-if="sets.saveError" role="alert" class="text-sm text-warn">
      Couldn’t store your latest changes on this device ({{ sets.saveError }}). They are tried again
      with your next change.
    </p>
    <p class="sr-only" role="status">{{ announcement }}</p>

    <ul v-if="sets.list.length" class="grid gap-2" aria-labelledby="sets-heading">
      <li
        v-for="set in sets.list"
        :key="set.id"
        class="grid gap-x-4 gap-y-2 rounded-lg border border-rule bg-surface px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div class="grid min-w-0 gap-1">
          <RouterLink
            :to="linkTo(set.id)"
            class="justify-self-start truncate font-display text-lg font-bold hover:text-accent"
          >
            {{ set.name }}
          </RouterLink>
          <p class="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
            <span class="sr-only">Playlists:</span>
            <span
              v-for="playlist in set.playlists"
              :key="playlist.playlistId"
              class="flex min-w-0 items-center gap-1.5"
            >
              <img
                v-if="playlist.imageUrl"
                :src="playlist.imageUrl"
                alt=""
                width="20"
                height="20"
                class="size-5 rounded-sm object-cover"
              />
              <span v-else class="size-5 rounded-sm bg-band" aria-hidden="true" />
              <span class="truncate">{{ playlist.name }}</span>
            </span>
            <span v-if="set.playlists.length === 0" class="text-muted">No playlists</span>
          </p>
          <p class="grid text-[13px] text-muted sm:flex sm:flex-wrap sm:gap-x-1.5">
            <span class="num">{{ trackCountLabel(set) }}</span>
            <span class="hidden sm:inline" aria-hidden="true">·</span>
            <span>
              Edited
              <time :datetime="isoTime(set.editedAt)">{{ formatDateTime(set.editedAt) }}</time>
            </span>
            <span class="hidden sm:inline" aria-hidden="true">·</span>
            <span v-if="!set.lastSave">Not saved to Spotify</span>
            <span v-else>
              <span :class="saveState(set) === 'saved' ? 'text-ok' : 'text-warn'">
                {{
                  saveState(set) === 'saved'
                    ? 'Saved to Spotify'
                    : 'Changed since it was saved to Spotify'
                }}
              </span>
              <time :datetime="isoTime(set.lastSave.savedAt)">
                {{ formatDateTime(set.lastSave.savedAt) }}
              </time>
              <a
                :href="set.lastSave.url"
                target="_blank"
                rel="noopener"
                class="text-accent underline"
                :aria-label="`Open the saved playlist of ${set.name} in Spotify`"
              >
                Open in Spotify
              </a>
            </span>
          </p>
        </div>
        <div class="-ml-3.5 flex flex-wrap sm:ml-0">
          <AppButton variant="ghost" :aria-label="`Rename ${set.name}`" @click="startRename(set)">
            Rename
          </AppButton>
          <AppButton variant="ghost" :aria-label="`Duplicate ${set.name}`" @click="duplicate(set)">
            Duplicate
          </AppButton>
          <AppButton
            variant="ghost"
            :aria-label="`Delete ${set.name}`"
            @click="deleting = { id: set.id, label: `“${set.name}”` }"
          >
            Delete
          </AppButton>
        </div>
      </li>
    </ul>
    <p v-else-if="!sets.loaded" class="text-muted" role="status">Loading your sets…</p>
    <EmptyState v-else-if="empty" title="No sets yet">
      A set is one or more of your playlists, mixed together. It is kept on this device; nothing in
      Spotify changes until you save a mix.
      <template #actions>
        <AppButton @click="creating = true">New set</AppButton>
      </template>
    </EmptyState>

    <!-- Stored sets that failed validation are reported, never hidden (spec §6). -->
    <section
      v-if="sets.unreadable.length"
      class="grid gap-2 rounded-[10px] border border-warn bg-warn-bg p-4"
      aria-labelledby="unreadable-heading"
    >
      <h2 id="unreadable-heading" class="text-lg font-bold">
        {{
          sets.unreadable.length === 1
            ? '1 stored set can’t be read'
            : `${sets.unreadable.length} stored sets can’t be read`
        }}
      </h2>
      <p class="text-sm">They are still on this device, exactly as they were stored.</p>
      <ul class="grid gap-2" aria-labelledby="unreadable-heading">
        <li
          v-for="stored in sets.unreadable"
          :key="stored.id"
          class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div class="grid min-w-0">
            <span class="font-semibold">{{ stored.name ?? 'No readable name' }}</span>
            <span class="num text-[13px] break-all">ID {{ stored.id }}</span>
            <span>{{ stored.problem }}</span>
          </div>
          <AppButton
            variant="danger"
            class="justify-self-start"
            :aria-label="`Delete the unreadable set ${stored.name ?? stored.id}`"
            @click="
              deleting = {
                id: stored.id,
                label: `the unreadable set ${stored.name ? `“${stored.name}”` : stored.id}`,
              }
            "
          >
            Delete
          </AppButton>
        </li>
      </ul>
    </section>

    <NewSetDialog v-model:open="creating" @created="(set) => $emit('created', set)" />

    <AppDialog
      :open="renaming !== null"
      title="Rename set"
      description="Sets are kept on this device. Renaming one changes nothing in Spotify."
      @update:open="(open) => open || (renaming = null)"
    >
      <form class="grid gap-4" @submit.prevent="rename">
        <label class="grid gap-1 text-sm font-medium">
          Name
          <input
            v-model="newName"
            type="text"
            class="rounded-lg border border-rule bg-surface px-3 py-2 font-normal"
          />
        </label>
        <div class="flex justify-end gap-2">
          <AppButton variant="secondary" @click="renaming = null">Cancel</AppButton>
          <AppButton type="submit" :disabled="!newName.trim()">Rename</AppButton>
        </div>
      </form>
    </AppDialog>

    <AppDialog
      :open="deleting !== null"
      :title="`Delete ${deleting?.label ?? 'set'}?`"
      description="This removes the set from this device and can’t be undone. Nothing in Spotify is touched: your playlists and saved mixes stay as they are."
      @update:open="(open) => open || (deleting = null)"
    >
      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" @click="deleting = null">Cancel</AppButton>
        <AppButton variant="danger" @click="remove">Delete set</AppButton>
      </div>
    </AppDialog>
  </section>
</template>
