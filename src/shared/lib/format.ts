/** 225000 → "3:45". */
export const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}
