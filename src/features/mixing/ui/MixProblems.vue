<script setup lang="ts">
import { computed } from 'vue'
import { EmptyState } from '@/shared/ui'
import { describeConstraintError, type ConstraintError } from '../domain/constraints'
import { describeDiagnostic, trackNamer, type Diagnostic } from '../domain/diagnostics'
import type { MixTrack } from '../domain/types'

/** Why there is no mix: invalid constraints or an infeasible set, in plain language. */
const {
  tracks,
  errors = [],
  diagnostics = [],
} = defineProps<{
  tracks: readonly MixTrack[]
  errors?: readonly ConstraintError[]
  diagnostics?: readonly Diagnostic[]
}>()

const name = computed(() => trackNamer(tracks))
const lines = computed(() => [
  ...errors.map((e) => describeConstraintError(e, name.value)),
  ...diagnostics.map((d) => describeDiagnostic(d, name.value)),
])
</script>

<template>
  <EmptyState
    :title="errors.length ? 'These constraints can’t all hold' : 'No clash-free mix is possible'"
  >
    <ul class="grid list-disc gap-1.5 pl-5">
      <li v-for="line in lines" :key="line">{{ line }}</li>
    </ul>
    <p class="mt-2">
      {{
        errors.length
          ? 'Change the constraints above.'
          : 'Exclude a track or change the constraints, and the mix updates.'
      }}
    </p>
  </EmptyState>
</template>
