import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createIndexedDbStore } from './indexeddb-store'
import type { KeyValueStore } from './key-value-store'
import { createMemoryStore } from './memory-store'

let n = 0
const adapters: [string, () => KeyValueStore][] = [
  ['memory', () => createMemoryStore()],
  ['indexeddb', () => createIndexedDbStore(`test-${String(n++)}`)],
]

describe.each(adapters)('%s store', (_name, make) => {
  it('gets what was set', async () => {
    const store = make()
    await store.set('a', { x: 1 })
    expect(await store.get('a')).toEqual({ x: 1 })
    expect(await store.get('missing')).toBeUndefined()
  })

  it('handles many at once', async () => {
    const store = make()
    await store.setMany([
      ['a', 1],
      ['b', 2],
    ])
    expect(await store.getMany(['a', 'b', 'c'])).toEqual([1, 2, undefined])
    expect((await store.entries()).sort()).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('deletes and clears', async () => {
    const store = make()
    await store.setMany([
      ['a', 1],
      ['b', 2],
    ])
    await store.delete('a')
    expect(await store.get('a')).toBeUndefined()
    await store.clear()
    expect(await store.entries()).toEqual([])
  })

  it('does not share references with callers', async () => {
    const store = make()
    const value = { x: 1 }
    await store.set('a', value)
    value.x = 2
    expect(await store.get('a')).toEqual({ x: 1 })
  })
})
