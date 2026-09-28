import { clear, createStore, del, entries, get, getMany, set, setMany } from 'idb-keyval'
import type { KeyValueStore } from './key-value-store'

/** IndexedDB adapter: one database per store name, one object store inside it. */
export function createIndexedDbStore(name: string): KeyValueStore {
  const store = createStore(`camelont-${name}`, 'kv')
  return {
    get: (key) => get<unknown>(key, store),
    getMany: (keys) => getMany<unknown>([...keys], store),
    set: (key, value) => set(key, value, store),
    setMany: (items) =>
      setMany(
        items.map(([k, v]) => [k, v]),
        store,
      ),
    delete: (key) => del(key, store),
    entries: () => entries<string, unknown>(store),
    clear: () => clear(store),
  }
}
