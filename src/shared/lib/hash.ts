/**
 * 32-bit FNV-1a hash of a string (over its UTF-16 code units): same text, same unsigned
 * integer. Not cryptographic.
 */
export function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
