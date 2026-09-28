export interface Page<T> {
  items: T[]
  /** Absolute URL of the next page, or null on the last page. */
  next: string | null
}

/** Follows `next` links until the last page (or `maxPages`) and returns all items. */
export async function paginate<T>(
  fetchPage: (urlOrPath: string) => Promise<Page<T>>,
  first: string,
  maxPages = 200,
): Promise<T[]> {
  const items: T[] = []
  let next: string | null = first
  for (let page = 0; next !== null && page < maxPages; page++) {
    const result: Page<T> = await fetchPage(next)
    items.push(...result.items)
    next = result.next
  }
  return items
}
