<script setup lang="ts">
import { computed, ref } from 'vue'
import { EmptyState } from '@/shared/ui'
import { FOLLOWED_REASON, type PlaylistSummary } from '../domain/types'
import { usePlaylists } from '../model/queries'

/**
 * The user's playlists, searchable, each a checkbox. `selected` holds the chosen
 * playlists in the order they were ticked.
 */
const { taken = [] } = defineProps<{
  /** IDs of playlists that can't be chosen because they are in use already. */
  taken?: readonly string[]
}>()
const selected = defineModel<PlaylistSummary[]>('selected', { default: () => [] })

const playlists = usePlaylists()
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const all = playlists.data.value ?? []
  return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all
})

const countLabel = (p: PlaylistSummary) =>
  p.trackCount === null ? '' : `${String(p.trackCount)} track${p.trackCount === 1 ? '' : 's'}`

const isTaken = (p: PlaylistSummary) => taken.includes(p.id)
const isSelected = (p: PlaylistSummary) => selected.value.some((chosen) => chosen.id === p.id)
const toggle = (p: PlaylistSummary) => {
  selected.value = isSelected(p)
    ? selected.value.filter((chosen) => chosen.id !== p.id)
    : [...selected.value, p]
}
</script>

<template>
  <section class="grid gap-3" aria-labelledby="playlists-heading">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid">
        <h2 id="playlists-heading" class="text-base font-bold">Your playlists</h2>
        <!-- A search can hide chosen playlists; this line keeps them in view. -->
        <p class="text-[13px] text-muted" role="status">
          {{
            selected.length
              ? `${String(selected.length)} chosen: ${selected.map((p) => p.name).join(', ')}`
              : 'None chosen yet'
          }}
        </p>
      </div>
      <label class="grid gap-1 text-sm text-muted">
        Search
        <!-- Enter must not submit a form the picker sits in. -->
        <input
          v-model="search"
          type="search"
          class="w-64 max-w-full rounded-lg border border-rule bg-surface px-3 py-1.5 text-ink"
          placeholder="Playlist name"
          @keydown.enter.prevent
        />
      </label>
    </div>

    <p v-if="playlists.isPending.value" class="text-muted" role="status">Loading your playlists…</p>
    <EmptyState v-else-if="playlists.isError.value" title="Couldn’t load your playlists">
      {{ playlists.error.value?.message }}
    </EmptyState>
    <EmptyState v-else-if="filtered.length === 0" title="No playlists found">
      {{ search ? 'Nothing matches that name.' : 'Create a playlist in Spotify first.' }}
    </EmptyState>

    <ul v-else class="grid max-h-[34vh] gap-2 overflow-y-auto p-0.5 sm:max-h-[42vh]">
      <li v-for="p in filtered" :key="p.id">
        <label
          class="grid grid-cols-[auto_48px_minmax(0,1fr)] items-center gap-x-3.5 rounded-lg border border-rule bg-surface px-3.5 py-2.5"
          :class="
            p.canMix && !isTaken(p)
              ? 'cursor-pointer hover:border-accent has-checked:border-accent'
              : 'opacity-70'
          "
        >
          <input
            type="checkbox"
            class="size-4 accent-accent"
            :checked="isSelected(p)"
            :disabled="!p.canMix || isTaken(p)"
            @change="toggle(p)"
          />
          <img
            v-if="p.imageUrl"
            :src="p.imageUrl"
            alt=""
            width="48"
            height="48"
            class="size-12 rounded object-cover"
          />
          <span v-else class="size-12 rounded bg-band" aria-hidden="true" />
          <span class="grid min-w-0">
            <span class="truncate font-semibold">{{ p.name }}</span>
            <span class="text-[13px] text-muted">
              <span class="num">{{ countLabel(p) }}</span> · by {{ p.ownerName }}
            </span>
            <span v-if="isTaken(p)" class="text-[13px] text-muted">Already in this set.</span>
            <span v-else-if="!p.canMix" class="text-[13px] text-warn">
              Followed, can’t be mixed. {{ FOLLOWED_REASON }}
            </span>
          </span>
        </label>
      </li>
    </ul>
  </section>
</template>
