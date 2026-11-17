import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import type { ParsedMail } from '../src/shared/types'

const sale = (id: string, ts: number, item: string, qty: number, price: number, extra: Partial<ParsedMail> = {}): ParsedMail => ({
  mailId: id, timestamp: ts, kind: 'sale', vendor: 'Shop', itemName: item, quantity: qty, price, counterparty: 'Bob', ...extra
})

/** Seven sales of "Widget": two old ones at 100 each, then five newer at 200 each. */
const withWidgets = () => {
  const s = new Store(':memory:')
  ;[100, 100, 200, 200, 200, 200, 200].forEach((p, i) => s.insertEvent('Alpha', sale(`w${i}`, 1000 + i * 10, 'Widget', 1, p)))
  return s
}

describe('Store.priceList', () => {
  it('gives one row per item with per-unit stats, most-sold first', () => {
    const s = withWidgets()
    s.insertEvent('Alpha', sale('g1', 5000, 'Gadget', 1, 50))
    const rows = s.priceList(0, 99999)
    expect(rows.map((r) => r.name)).toEqual(['Widget', 'Gadget'])
    expect(rows[0]).toMatchObject({ sales: 7, low: 100, high: 200, recentMedian: 200, previousMedian: 100, trend: 'up', lastUnitPrice: 200 })
  })

  it('divides crate prices by crate size so crates and singles compare', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 10, 'Belt', 1, 100))
    s.insertEvent('A', sale('2', 20, 'Belt', 25, 2500)) // 100 each
    s.insertEvent('A', sale('3', 30, 'Belt', 100, 10000)) // 100 each
    const [row] = s.priceList(0, 99)
    expect(row).toMatchObject({ low: 100, high: 100, average: 100, units: 126, crateSizes: [1, 25, 100] })
  })

  it('says unknown trend with too little history, but still has a recent price', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 10, 'Rare', 1, 900))
    expect(s.priceList(0, 99)[0]).toMatchObject({ sales: 1, recentMedian: 900, previousMedian: null, trend: 'unknown' })
  })

  it('respects the date range and the character filter', () => {
    const s = new Store(':memory:')
    s.insertEvent('Alpha', sale('1', 100, 'Thing', 1, 10))
    s.insertEvent('Beta', sale('1', 200, 'Thing', 1, 30))
    s.insertEvent('Beta', sale('2', 900, 'Thing', 1, 50))
    expect(s.priceList(0, 1000)[0]!.sales).toBe(3)
    expect(s.priceList(150, 1000)[0]!.sales).toBe(2) // date range drops the oldest
    expect(s.priceList(0, 1000, 'Alpha')[0]!.high).toBe(10) // character filter
    expect(s.priceList(0, 1000, 'Nobody')).toEqual([])
  })

  it('ignores purchases, offers and mails without an item', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', { ...sale('1', 10, 'Thing', 1, 10), kind: 'purchase' })
    s.insertEvent('A', { ...sale('2', 20, 'Thing', 1, 10), kind: 'offer_in' })
    s.insertEvent('A', { mailId: '3', timestamp: 30, kind: 'vendor_maint' })
    expect(s.priceList(0, 99)).toEqual([])
  })

  it('groups different spellings of the same name and shows the newest spelling', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 10, 'luck armor  attachment', 1, 100))
    s.insertEvent('A', sale('2', 20, 'Luck Armor Attachment', 1, 100))
    const rows = s.priceList(0, 99)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('Luck Armor Attachment')
  })
})

describe('Store.priceSeries', () => {
  it('returns every sale oldest first with unit prices, vendor and buyer', () => {
    const s = withWidgets()
    s.insertEvent('Alpha', sale('x', 1005, 'Widget', 2, 400, { vendor: 'Other Shop', counterparty: 'Zed' }))
    const { row, points } = s.priceSeries('widget', 0, 99999)
    expect(points).toHaveLength(8)
    expect(points.map((p) => p.ts)).toEqual([...points.map((p) => p.ts)].sort((a, b) => a - b))
    expect(points.find((p) => p.vendor === 'Other Shop')).toMatchObject({ unitPrice: 200, quantity: 2, buyer: 'Zed', character: 'Alpha' })
    expect(row).toMatchObject({ name: 'Widget', sales: 8 })
  })

  it('is empty for an unknown item or a range with no sales', () => {
    const s = withWidgets()
    expect(s.priceSeries('nothing', 0, 99999)).toEqual({ row: null, points: [] })
    expect(s.priceSeries('widget', 90000, 99999)).toEqual({ row: null, points: [] })
  })

  it('matches the numbers in priceList for the same item', () => {
    const s = withWidgets()
    expect(s.priceSeries('widget', 0, 99999).row).toEqual(s.priceList(0, 99999).find((r) => r.key === 'widget'))
  })
})
