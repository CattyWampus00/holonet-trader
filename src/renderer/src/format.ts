import type { Trend } from '@shared/priceStats'

/**
 * Formats a per-item price. Cheap items keep up to 2 decimals (a resource can cost 0.05 each),
 * everything else is shown in whole credits with thousands separators.
 */
export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n > 0 && n < 10) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return Math.round(n).toLocaleString('en-US')
}

/** Arrow plus a word, so the trend never relies on color alone. */
export const TREND_LABEL: Record<Trend, { arrow: string; word: string }> = {
  up: { arrow: '▲', word: 'Up' },
  down: { arrow: '▼', word: 'Down' },
  flat: { arrow: '→', word: 'Flat' },
  unknown: { arrow: '', word: 'Not enough history' }
}

/** "Sold as: 1, 25, 100" for items that sold in crates; empty when only singles were sold. */
export function crateNote(sizes: number[], resource = false): string {
  if (!sizes.some((s) => s > 1)) return ''
  return resource
    ? `sold in amounts of ${sizes.map((s) => s.toLocaleString('en-US')).join(', ')} units`
    : `crates of ${sizes.map((s) => s.toLocaleString('en-US')).join(', ')}`
}
