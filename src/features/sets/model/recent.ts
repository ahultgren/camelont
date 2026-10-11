import { shallowRef } from 'vue'

/**
 * The last few results by key. Reading one inside a computed tracks the store, so a
 * result that arrives later is seen. Kept short: a result is cheap to work out again,
 * and what matters is that undoing a change (or changing something unrelated) is instant.
 */
export function useRecent<Value>(limit: number) {
  const entries = shallowRef<ReadonlyMap<string, Value>>(new Map())
  return {
    get: (key: string): Value | undefined => entries.value.get(key),
    set(key: string, value: Value): void {
      const next = new Map(entries.value)
      next.delete(key)
      next.set(key, value)
      for (const oldest of next.keys()) {
        if (next.size <= limit) break
        next.delete(oldest)
      }
      entries.value = next
    },
  }
}
