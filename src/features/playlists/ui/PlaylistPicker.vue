<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { EmptyState } from '@/shared/ui'
import { FOLLOWED_REASON, type PlaylistSummary } from '../domain/types'
import { usePlaylists } from '../model/queries'

/**
 * The user's playlists, searchable. With `linkTo` each mixable playlist is a link;
 * without it the picker selects: each is a checkbox and `selected` holds the chosen
 * playlists in the order they were ticked.
 */
const props = defineProps<{
  linkTo?: (playlist: PlaylistSummary) => RouteLocationRaw
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

const isSelected = (p: PlaylistSummary) => selected.value.some((chosen) => chosen.id === p.id)
const toggle = (p: PlaylistSummary) => {
  selected.value = isSelected(p)
    ? selected.value.filter((chosen) => chosen.id !== p.id)
    : [...selected.value, p]
}

const rowTag = (p: PlaylistSummary) => {
  if (!props.linkTo) return 'label'
  return p.canMix ? RouterLink : 'div'
}
const rowProps = (p: PlaylistSummary) => {
  if (!props.linkTo) return {}
  return p.canMix ? { to: props.linkTo(p) } : { 'aria-disabled': 'true' }
}
</script>

<template>
  <section class="grid gap-3" aria-labelledby="playlists-heading">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid">
        <h2 id="playlists-heading" :class="linkTo ? 'text-xl font-bold' : 'text-base font-bold'">
          Your playlists
        </h2>
        <!-- A search can hide chosen playlists; this line keeps them in view. -->
        <p v-if="!linkTo" class="text-[13px] text-muted" role="status">
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

    <ul v-else class="grid gap-2" :class="{ 'max-h-[42vh] overflow-y-auto p-0.5': !linkTo }">
      <li v-for="p in filtered" :key="p.id">
        <component
          :is="rowTag(p)"
          v-bind="rowProps(p)"
          class="grid items-center gap-x-3.5 rounded-lg border border-rule bg-surface px-3.5 py-2.5"
          :class="[
            linkTo ? 'grid-cols-[48px_minmax(0,1fr)]' : 'grid-cols-[auto_48px_minmax(0,1fr)]',
            p.canMix ? 'hover:border-accent' : 'opacity-70',
            !linkTo && p.canMix ? 'cursor-pointer has-checked:border-accent' : '',
          ]"
        >
          <input
            v-if="!linkTo"
            type="checkbox"
            class="size-4 accent-accent"
            :checked="isSelected(p)"
            :disabled="!p.canMix"
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
            <span v-if="!p.canMix" class="text-[13px] text-warn">
              Followed, can’t be mixed. {{ FOLLOWED_REASON }}
            </span>
          </span>
        </component>
      </li>
    </ul>
  </section>
</template>
