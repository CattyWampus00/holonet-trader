import { describe, expect, it } from 'vitest'
import type { PriceRow } from '../src/shared/types'
import { crateNote, formatPrice } from '../src/renderer/src/format'
import { filterPriceRows, sortPriceRows } from '../src/renderer/src/priceSort'

const row = (name: string, o: Partial<PriceRow> = {}): PriceRow => ({
  key: name.toLowerCase(), name, sales: 1, units: 1, low: 1, average: 1, high: 1, lastTs: 1, lastUnitPrice: 1,
  recentMedian: 1, previousMedian: null, trend: 'unknown', crateSizes: [1], ...o
})

describe('formatPrice', () => {
  it('uses whole credits with separators for normal prices', () => {
    expect(formatPrice(700000)).toBe('700,000')
    expect(formatPrice(40000.4)).toBe('40,000')
    expect(formatPrice(10)).toBe('10')
  })
  it('keeps up to 2 decimals for very cheap items', () => {
    expect(formatPrice(0.05)).toBe('0.05')
    expect(formatPrice(2.5)).toBe('2.5')
    expect(formatPrice(9.999)).toBe('10')
  })
  it('shows a dash for nonsense', () => {
    expect(formatPrice(NaN)).toBe('—')
  })
})

describe('crateNote', () => {
  it('only mentions crates when something sold in a crate', () => {
    expect(crateNote([1])).toBe('')
    expect(crateNote([1, 25, 100])).toBe('crates of 1, 25, 100')
    expect(crateNote([25])).toBe('crates of 25')
  })
  it('calls resource amounts units, not crates', () => {
    expect(crateNote([50000, 1000000], true)).toBe('sold in amounts of 50,000, 1,000,000 units')
    expect(crateNote([1], true)).toBe('')
  })
})

describe('sortPriceRows', () => {
  const rows = [row('Beta', { sales: 5, recentMedian: 200, trend: 'down' }), row('alpha', { sales: 9, recentMedian: 100, trend: 'up' }), row('Gamma', { sales: 5, recentMedian: 300, trend: 'unknown' })]

  it('sorts text ignoring case, and numbers both ways', () => {
    expect(sortPriceRows(rows, 'name', 'asc').map((r) => r.name)).toEqual(['alpha', 'Beta', 'Gamma'])
    expect(sortPriceRows(rows, 'recentMedian', 'desc').map((r) => r.name)).toEqual(['Gamma', 'Beta', 'alpha'])
    expect(sortPriceRows(rows, 'recentMedian', 'asc').map((r) => r.name)).toEqual(['alpha', 'Beta', 'Gamma'])
  })
  it('orders trends rising, flat, falling, then unknown', () => {
    const all = [row('a', { trend: 'unknown' }), row('b', { trend: 'down' }), row('c', { trend: 'flat' }), row('d', { trend: 'up' })]
    expect(sortPriceRows(all, 'trend', 'asc').map((r) => r.trend)).toEqual(['up', 'flat', 'down', 'unknown'])
  })
  it('breaks ties by most sales then name, and does not change the input', () => {
    const before = rows.map((r) => r.name)
    expect(sortPriceRows(rows, 'sales', 'asc').map((r) => r.name)).toEqual(['Beta', 'Gamma', 'alpha'])
    expect(rows.map((r) => r.name)).toEqual(before)
  })
})

describe('filterPriceRows', () => {
  const rows = [row('Luck Armor Attachment', { sales: 20 }), row('Agility Modifier Bit', { sales: 1 })]
  it('filters by search text, ignoring case', () => {
    expect(filterPriceRows(rows, 'LUCK', 1).map((r) => r.name)).toEqual(['Luck Armor Attachment'])
    expect(filterPriceRows(rows, '  ', 1)).toHaveLength(2)
  })
  it('filters by minimum sales', () => {
    expect(filterPriceRows(rows, '', 2).map((r) => r.name)).toEqual(['Luck Armor Attachment'])
  })
})

import { chartPoints, hasCrates, recentSales, valueOf } from '../src/renderer/src/priceDetail'
import type { PricePointRow } from '../src/shared/types'

const pp = (ts: number, price: number, quantity = 1): PricePointRow => ({ ts, price, quantity, unitPrice: price / quantity, vendor: 'V', buyer: 'B', character: 'C' })

describe('price detail helpers', () => {
  it('values a sale per item or per crate', () => {
    const crate = pp(1, 2500, 25)
    expect(valueOf(crate, 'unit')).toBe(100)
    expect(valueOf(crate, 'crate')).toBe(2500)
  })
  it('lists newest first, limits the count, and can show everything', () => {
    const pts = [pp(1, 10), pp(3, 30), pp(2, 20)]
    expect(recentSales(pts, 2, false).map((p) => p.ts)).toEqual([3, 2])
    expect(recentSales(pts, 2, true).map((p) => p.ts)).toEqual([3, 2, 1])
    expect(pts.map((p) => p.ts)).toEqual([1, 3, 2]) // input untouched
  })
  it('builds chart points oldest first on the chosen basis', () => {
    const pts = [pp(30, 300, 3), pp(10, 100, 1)]
    expect(chartPoints(pts, 'unit').map((c) => [c.x, c.y])).toEqual([[10, 100], [30, 100]])
    expect(chartPoints(pts, 'crate').map((c) => [c.x, c.y])).toEqual([[10, 100], [30, 300]])
  })
  it('offers the per-crate view only when crates exist', () => {
    expect(hasCrates([1])).toBe(false)
    expect(hasCrates([1, 25])).toBe(true)
  })
})
