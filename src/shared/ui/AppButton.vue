<script setup lang="ts">
import { buttonClasses, type ButtonVariant } from './button'

const { variant = 'primary', type = 'button' } = defineProps<{
  variant?: ButtonVariant
  type?: 'button' | 'submit'
}>()
</script>

<template>
  <button :type="type" :class="buttonClasses(variant)">
    <slot />
  </button>
</template>
