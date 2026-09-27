import type { KeyValueStore } from './key-value-store'

/** In-memory adapter for tests. Values are cloned, as IndexedDB would. */
export function createMemoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, unknown>(
    Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]),
  )
  return {
    get: (key) => Promise.resolve(structuredClone(data.get(key))),
    getMany: (keys) => Promise.resolve(keys.map((key) => structuredClone(data.get(key)))),
    set: (key, value) => {
      data.set(key, structuredClone(value))
      return Promise.resolve()
    },
    setMany: (entries) => {
      for (const [key, value] of entries) data.set(key, structuredClone(value))
      return Promise.resolve()
    },
    delete: (key) => {
      data.delete(key)
      return Promise.resolve()
    },
    entries: () =>
      Promise.resolve(
        [...data.entries()].map(([k, v]): [string, unknown] => [k, structuredClone(v)]),
      ),
    clear: () => {
      data.clear()
      return Promise.resolve()
    },
  }
}
