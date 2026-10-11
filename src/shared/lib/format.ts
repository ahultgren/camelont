/** 225000 → "3:45". */
export const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A moment in the reader's own locale and time zone, e.g. "11 Oct 2026, 14:32". */
export const formatDateTime = (ms: number): string => DATE_TIME.format(ms)
