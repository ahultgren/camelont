/** Visual tone of a transition; the move metadata (mixing) maps each move to one. */
export type MoveTone = 'perfect' | 'boost' | 'drop' | 'mood' | 'clash'

/** Text colour class per tone, as on the reference charts. */
export const TONE_TEXT: Record<MoveTone, string> = {
  perfect: 'text-ok',
  boost: 'text-accent',
  drop: 'text-muted',
  mood: 'text-warn',
  clash: 'text-warn',
}

/** CSS colour per tone, for SVG strokes and fills. */
export const TONE_COLOR: Record<MoveTone, string> = {
  perfect: 'var(--ok)',
  boost: 'var(--accent)',
  drop: 'var(--muted)',
  mood: 'var(--warn)',
  clash: 'var(--warn)',
}
