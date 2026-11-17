import type { PriceRow } from '@shared/types'

export type SortKey = 'name' | 'sales' | 'lastUnitPrice' | 'recentMedian' | 'high' | 'trend' | 'lastTs'
export type SortDir = 'asc' | 'desc'

/** Sorting a trend column goes rising, flat, falling, then items with no trend. */
const TREND_RANK: Record<PriceRow['trend'], number> = { up: 0, flat: 1, down: 2, unknown: 3 }

/** Returns a sorted copy. Ties fall back to most sales, then name, so the order is stable between renders. */
export function sortPriceRows(rows: PriceRow[], key: SortKey, dir: SortDir): PriceRow[] {
  const sign = dir === 'asc' ? 1 : -1
  const cmp = (a: PriceRow, b: PriceRow): number => {
    switch (key) {
      case 'name': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      case 'trend': return TREND_RANK[a.trend] - TREND_RANK[b.trend]
      default: return a[key] - b[key]
    }
  }
  return [...rows].sort((a, b) => sign * cmp(a, b) || b.sales - a.sales || a.name.localeCompare(b.name))
}

/** Rows that match the search text and have at least `minSales` sales. */
export function filterPriceRows(rows: PriceRow[], search: string, minSales: number): PriceRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter((r) => r.sales >= minSales && (!q || r.name.toLowerCase().includes(q)))
}
