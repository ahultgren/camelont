<script setup lang="ts">
import { ref } from 'vue'
import { AppButton } from '@/shared/ui'
import { useAuthStore } from '../model/auth-store'

const auth = useAuthStore()
const busy = ref(false)

async function login() {
  busy.value = true
  try {
    await auth.login()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppButton :disabled="busy" @click="login">Log in with Spotify</AppButton>
</template>
