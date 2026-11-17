/**
 * Price math for the Prices screen. Pure functions, no database or UI, so the
 * numbers on screen, in charts and in any future alert all come from one place.
 *
 * Every comparison uses the UNIT price (credits for one item). A crate of 25
 * sold for 2,500 credits is 100 per item, so crates and singles compare fairly.
 */

/** One sale. `price` is the total credits for the whole crate; `quantity` is the crate size. */
export interface PricePoint {
  ts: number // unix seconds
  price: number
  quantity: number
}

export type Trend = 'up' | 'down' | 'flat' | 'unknown'

/** How many of the latest sales make up the "recent" price. */
export const RECENT_WINDOW = 5
/** The earlier window needs at least this many sales before a trend is shown. */
export const MIN_PREVIOUS = 2
/** A change smaller than this fraction (5%) counts as "flat". */
export const FLAT_BAND = 0.05

export interface PriceSummary {
  sales: number
  units: number
  /** Lowest, average and highest unit price across every point. Null when there are no sales. */
  low: number | null
  average: number | null
  high: number | null
  /** The most recent sale. */
  last: { ts: number; unitPrice: number } | null
  /** Median unit price of the latest RECENT_WINDOW sales. */
  recentMedian: number | null
  /** Median of the RECENT_WINDOW sales before those, or null when fewer than MIN_PREVIOUS exist. */
  previousMedian: number | null
  /** Distinct crate sizes seen, smallest first (for the "sold in crates of 1, 25, 100" note). */
  crateSizes: number[]
}

/** Credits for one item. A zero or missing crate size is treated as a single item. */
export function unitPrice(p: PricePoint): number {
  return p.quantity > 0 ? p.price / p.quantity : p.price
}

/** Middle value (average of the two middle values for an even count). Null for an empty list. */
export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Summarises a list of sales in any order. Does not change the input. */
export function summarize(points: PricePoint[], window = RECENT_WINDOW): PriceSummary {
  if (!points.length) {
    return { sales: 0, units: 0, low: null, average: null, high: null, last: null, recentMedian: null, previousMedian: null, crateSizes: [] }
  }
  const newestFirst = [...points].sort((a, b) => b.ts - a.ts)
  const units = newestFirst.map(unitPrice)
  const recent = units.slice(0, window)
  const previous = units.slice(window, window * 2)
  return {
    sales: points.length,
    units: points.reduce((n, p) => n + p.quantity, 0),
    low: Math.min(...units),
    average: units.reduce((a, b) => a + b, 0) / units.length,
    high: Math.max(...units),
    last: { ts: newestFirst[0]!.ts, unitPrice: units[0]! },
    recentMedian: median(recent),
    previousMedian: previous.length >= MIN_PREVIOUS ? median(previous) : null,
    crateSizes: [...new Set(points.map((p) => p.quantity))].sort((a, b) => a - b)
  }
}

/**
 * Is the price going up, down, or holding steady?
 *
 * @param recent   median unit price of the latest sales (null if none)
 * @param previous median unit price of the sales before them (null if there was not enough history)
 * @param flatBand fraction of change that still counts as "flat" (0.05 means within 5%)
 */
export function classifyTrend(recent: number | null, previous: number | null, flatBand = FLAT_BAND): Trend {
  if (recent === null || previous === null) return 'unknown' // not enough history to compare

  // Prices can't be compared as a fraction of zero: staying at 0 is flat, anything above 0 is a rise.
  if (previous === 0) return recent === 0 ? 'flat' : 'up'

  // Compare the size of the move with the size of the price, so a 5% move means the same
  // for a 40,000 credit item and a 700,000 credit one. The tiny tolerance stops a move of
  // exactly 5% from tipping over because of floating-point rounding (105 vs 100).
  const move = recent - previous
  if (Math.abs(move) <= flatBand * previous * (1 + 1e-9)) return 'flat'
  return move > 0 ? 'up' : 'down'
}
