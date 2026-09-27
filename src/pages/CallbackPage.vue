<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoginButton, useAuthStore } from '@/features/auth'
import { EmptyState } from '@/shared/ui'

const auth = useAuthStore()
const router = useRouter()
const error = ref<string | null>(null)

onMounted(async () => {
  const result = await auth.handleCallback(new URLSearchParams(window.location.search))
  if (result.ok) await router.replace({ name: 'home' })
  else error.value = result.message
})
</script>

<template>
  <EmptyState v-if="error" title="Login didn’t work">
    {{ error }}
    <template #actions><LoginButton /></template>
  </EmptyState>
  <p v-else class="text-muted" role="status">Logging you in…</p>
</template>
