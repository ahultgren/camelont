export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 dark:text-[#12131b]',
  secondary: 'border border-rule bg-surface text-ink hover:border-accent',
  ghost: 'text-accent hover:bg-band',
  danger: 'border border-warn text-warn hover:bg-warn-bg',
}

/** Classes for anything that should look like a button (e.g. an `<a>`). */
export function buttonClasses(variant: ButtonVariant = 'primary'): string {
  return `${BASE} ${VARIANTS[variant]}`
}
