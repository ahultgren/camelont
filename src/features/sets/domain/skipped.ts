import type { SkippedItems } from './types'

const count = (n: number, noun: string) => `${String(n)} ${noun}${n === 1 ? '' : 's'}`

/** How many items a playlist's copy leaves out. */
export const skippedCount = (skipped: SkippedItems): number =>
  skipped.localFiles + skipped.episodes + skipped.unavailable

/** "2 local files, 1 episode", or '' when nothing was skipped. */
export function describeSkipped(skipped: SkippedItems): string {
  return [
    skipped.localFiles ? count(skipped.localFiles, 'local file') : '',
    skipped.episodes ? count(skipped.episodes, 'episode') : '',
    skipped.unavailable ? count(skipped.unavailable, 'unavailable track') : '',
  ]
    .filter(Boolean)
    .join(', ')
}
