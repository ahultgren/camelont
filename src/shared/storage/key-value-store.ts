/**
 * Persistence port. Values come back as `unknown`: callers validate them with zod,
 * since stored data may predate the current schema.
 */
export interface KeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  setMany(entries: readonly (readonly [string, unknown])[]): Promise<void>
  getMany(keys: readonly string[]): Promise<unknown[]>
  delete(key: string): Promise<void>
  entries(): Promise<[string, unknown][]>
  clear(): Promise<void>
}
