import type { PricePointRow } from '@shared/types'

/** 'unit' = credits for one item (crates divided by crate size). 'crate' = credits exactly as the mail said. */
export type Basis = 'unit' | 'crate'

/** The price of one sale on the chosen basis. */
export function valueOf(p: PricePointRow, basis: Basis): number {
  return basis === 'crate' ? p.price : p.unitPrice
}

/** Newest first, capped at `limit` unless `showAll`. Returns a new array. */
export function recentSales(points: PricePointRow[], limit: number, showAll: boolean): PricePointRow[] {
  const newestFirst = [...points].sort((a, b) => b.ts - a.ts)
  return showAll ? newestFirst : newestFirst.slice(0, limit)
}

/** Points for the chart, oldest first, with the chosen price as `y`. */
export function chartPoints(points: PricePointRow[], basis: Basis): { x: number; y: number; p: PricePointRow }[] {
  return [...points].sort((a, b) => a.ts - b.ts).map((p) => ({ x: p.ts, y: valueOf(p, basis), p }))
}

/** The per-crate view only makes sense when something sold in a crate bigger than 1. */
export function hasCrates(sizes: number[]): boolean {
  return sizes.some((s) => s > 1)
}
