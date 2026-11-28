import type { StockStatus } from './types'

/** Used when an item has no threshold of its own. Editable in Settings. */
export const DEFAULT_LOW_THRESHOLD = 5

/**
 * Decide whether an inventory item is fine, running low, or sold out.
 *
 * Rules:
 * - Nothing on hand is always "out", whatever the warning level is.
 * - "Low" means at or below the warning level (an item with 5 left and a warning
 *   level of 5 is low).
 * - An item without its own level uses the app-wide default.
 * - A level of 0 means "only warn me when it is completely gone".
 *
 * @param onHand        units currently in stock (a crate of 25 counts as 25)
 * @param itemThreshold this item's own warning level, or null if not set
 * @param globalDefault the app-wide default warning level
 */
/** Should this item show in "Restock needed", the Inventory badge and low-stock notifications? Archived items never do. */
export function needsRestock(item: { onHand: number; lowThreshold: number | null; archived: boolean }, globalDefault: number): boolean {
  return !item.archived && getStockStatus(item.onHand, item.lowThreshold, globalDefault) !== 'ok'
}

export function getStockStatus(onHand: number, itemThreshold: number | null, globalDefault: number): StockStatus {
  if (onHand <= 0) return 'out'
  const warnAt = itemThreshold ?? globalDefault
  return onHand <= warnAt ? 'low' : 'ok'
}

/**
 * Cost each can be a fraction of a credit (low-quality resources often cost 0.5). The game only deals in whole
 * credits, so a stack's value always rounds UP: 25 units at 0.5 is 13. The tiny rounding first stops float noise
 * (0.07 × 100 = 7.000000000000001) from adding a credit that isn't there.
 */
export function stockValue(onHand: number, costEach: number): number {
  return Math.ceil(Math.round(onHand * costEach * 1e6) / 1e6)
}

/** Cost each as typed in the item form: blank or bad input = 0, never negative, fractions kept. */
export function parseCost(text: string): number {
  const n = Number(text.trim().replace(/,/g, '')) // "1,200" is twelve hundred
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Cost each for display: "0.5", "1,200", "2.25" (at most 2 decimals, never rounded to a whole credit). */
export function costText(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
