/** In-memory `Storage` for tests. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

/** Stored tokens that are valid for an hour from `now`. */
export function loggedInStorage(now = Date.now()): MemoryStorage {
  const storage = new MemoryStorage()
  storage.setItem(
    'camelont.auth.tokens',
    JSON.stringify({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      expiresAt: now + 3600_000,
      scope: '',
    }),
  )
  return storage
}
