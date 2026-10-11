import { onBeforeUnmount, ref } from 'vue'

/** Two columns from this width up; below it the tools are tabs (spec W10). */
const WIDE = '(min-width: 1024px)'

/** Whether the window is wide enough for the two-column workspace. */
export function useWide() {
  // Where widths can't be asked for (tests), the laptop layout is the one to show.
  const query = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null
  const wide = ref(query?.matches ?? true)
  const update = (event: MediaQueryListEvent) => {
    wide.value = event.matches
  }
  query?.addEventListener('change', update)
  onBeforeUnmount(() => query?.removeEventListener('change', update))
  return wide
}
