<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { AppButton, EmptyState } from '@/shared/ui'
import { useSetsStore } from '../../model/sets-store'
import { useSetWorkspace } from '../../model/useSetWorkspace'
import AddPlaylistsDialog from './AddPlaylistsDialog.vue'
import ChangeSummaryLine from './ChangeSummaryLine.vue'
import { provideWorkspaceUi } from './context'
import MixControls from './MixControls.vue'
import MixOrder from './MixOrder.vue'
import MixResult from './MixResult.vue'
import SaveDialog from './SaveDialog.vue'
import SaveStatus from './SaveStatus.vue'
import TrackColumn from './TrackColumn.vue'
import { useWide } from './useWide'
import WsIcon from './WsIcon.vue'

/**
 * The workspace of one set (spec §9): its tracks on the left, the mix always in view
 * on the right, and nothing but those two scrolling. It belongs to one set: give it
 * the set ID as `key`.
 */
const { setId, homeTo } = defineProps<{ setId: string; homeTo: RouteLocationRaw }>()

const ws = useSetWorkspace(setId)
const ui = provideWorkspaceUi(ws)
const sets = useSetsStore()
const wide = useWide()

// ── The set's name, edited in place ────────────────────────────────────────────────
const name = ref('')
watch(
  () => ws.set.value?.name,
  (stored) => {
    name.value = stored ?? ''
  },
  { immediate: true },
)
function rename() {
  ws.rename(name.value)
  name.value = ws.set.value?.name ?? ''
}
function resetName(event: Event) {
  name.value = ws.set.value?.name ?? ''
  ;(event.target as HTMLElement).blur()
}

// ── Save to Spotify: a dialog asks first (spec §8.5) ───────────────────────────────
const saveOpen = ref(false)

// ── Phone: the same tools as tabs under the chart (W10) ────────────────────────────
type Tab = 'tracks' | 'mix' | 'order'
const TABS: { id: Tab; label: string }[] = [
  { id: 'tracks', label: 'Tracks' },
  { id: 'mix', label: 'Mix' },
  { id: 'order', label: 'Order' },
]
const tab = ref<Tab>('tracks')
// A track asked for from the chart or a pair is shown in the list.
watch(
  () => ui.revealed.value,
  () => {
    tab.value = 'tracks'
  },
)
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg">
    <header
      class="flex h-11 shrink-0 items-center gap-2 border-b border-rule bg-surface pr-2 pl-1 sm:gap-3 sm:pr-3"
    >
      <RouterLink
        :to="homeTo"
        class="flex h-8 shrink-0 items-center gap-0.5 rounded px-1.5 text-[13px] text-muted hover:bg-band hover:text-ink"
        aria-label="Back to your sets"
      >
        <WsIcon name="back" /> Sets
      </RouterLink>
      <template v-if="ws.set.value">
        <h1 class="sr-only">{{ ws.set.value.name }}</h1>
        <input
          v-model="name"
          type="text"
          aria-label="Set name"
          title="Rename the set"
          class="h-8 min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1.5 font-display text-[17px] font-bold tracking-tight hover:border-rule focus:border-accent focus:bg-surface sm:max-w-[420px]"
          @change="rename"
          @keydown.enter="($event.target as HTMLElement).blur()"
          @keydown.esc.stop="resetName"
        />
        <span class="ml-auto flex min-w-0 items-center gap-3">
          <span
            v-if="sets.saveError"
            role="alert"
            class="hidden max-w-[30ch] truncate text-xs text-warn md:inline"
            :title="`Your latest changes couldn’t be stored on this device (${sets.saveError}). They are tried again with your next change.`"
          >
            Not stored on this device
          </span>
          <SaveStatus class="max-lg:hidden" />
          <AppButton
            class="h-8 whitespace-nowrap"
            :disabled="!ws.saveInput.value"
            :title="
              ws.saveInput.value
                ? 'Asks for the playlist’s name first. Nothing is written until you confirm.'
                : 'There is no mix to save yet'
            "
            @click="saveOpen = true"
          >
            Save to Spotify
          </AppButton>
        </span>
      </template>
    </header>

    <template v-if="ws.set.value">
      <!-- Laptop: tracks and the mix side by side; only their own areas scroll (W1, W2). -->
      <main
        v-if="wide"
        class="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        data-layout="wide"
      >
        <TrackColumn class="border-r border-rule bg-surface" />
        <aside
          class="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden px-3.5 pt-2.5 pb-3"
          aria-label="Mix"
        >
          <ChangeSummaryLine />
          <MixResult />
          <MixControls />
          <MixOrder class="min-h-0 flex-1 border-t border-rule pt-2.5" />
        </aside>
      </main>

      <!-- Phone: the chart stays on top; the tools are tabs under it (W10). -->
      <main v-else class="flex min-h-0 flex-1 flex-col" data-layout="narrow">
        <div class="shrink-0 border-b border-rule px-2.5 py-2">
          <MixResult :chart-height="132" />
        </div>
        <div
          role="tablist"
          aria-label="Tools"
          class="flex shrink-0 border-b border-rule bg-surface"
        >
          <button
            v-for="option in TABS"
            :id="`tab-${option.id}`"
            :key="option.id"
            type="button"
            role="tab"
            :aria-selected="tab === option.id"
            :aria-controls="`panel-${option.id}`"
            class="flex-1 border-b-2 px-2 py-2 text-[13px] font-medium"
            :class="
              tab === option.id ? 'border-accent text-accent' : 'border-transparent text-muted'
            "
            @click="tab = option.id"
          >
            {{ option.label }}
          </button>
        </div>
        <!-- Hidden, not removed: a tab keeps its scroll, filter and folds (W5). -->
        <TrackColumn
          v-show="tab === 'tracks'"
          id="panel-tracks"
          role="tabpanel"
          aria-labelledby="tab-tracks"
          class="min-h-0 flex-1 bg-surface"
        />
        <div
          v-show="tab === 'mix'"
          id="panel-mix"
          role="tabpanel"
          aria-labelledby="tab-mix"
          class="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3"
        >
          <SaveStatus />
          <ChangeSummaryLine />
          <MixControls />
        </div>
        <div
          v-show="tab === 'order'"
          id="panel-order"
          role="tabpanel"
          aria-labelledby="tab-order"
          class="min-h-0 flex-1 overflow-y-auto p-3"
        >
          <MixOrder />
        </div>
      </main>
      <AddPlaylistsDialog />
      <SaveDialog v-model:open="saveOpen" />
    </template>

    <p v-else-if="ws.status.value === 'loading'" class="p-6 text-muted" role="status">
      Loading the set…
    </p>
    <div v-else class="mx-auto w-full max-w-[640px] p-6">
      <EmptyState
        :title="ws.status.value === 'unreadable' ? 'This set can’t be read' : 'Set not found'"
      >
        <p>{{ ws.statusMessage.value }}</p>
        <p v-if="ws.status.value === 'unreadable'" class="mt-1">
          It is still stored on this device, as <span class="num">{{ setId }}</span
          >.
        </p>
      </EmptyState>
    </div>
  </div>
</template>
