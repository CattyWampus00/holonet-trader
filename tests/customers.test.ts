import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import { itemsInSale, summarizeCustomers } from '../src/shared/customers'
import type { ParsedMail } from '../src/shared/types'

describe('itemsInSale', () => {
  it('counts crate contents in full but a resource sale as one', () => {
    expect(itemsInSale('Mabari Belt - RE - Socketed', 25)).toBe(25)
    expect(itemsInSale('Luck Armor Attachment', 1)).toBe(1)
    expect(itemsInSale('Copper (Dohen)', 1000000)).toBe(1)
    expect(itemsInSale(null, 0)).toBe(1)
  })
})

describe('summarizeCustomers', () => {
  const s = (buyer: string, price: number, quantity = 1, itemName = 'Thing', ts = 1) => ({ buyer, itemName, quantity, price, ts })

  it('adds up credits, purchases, items and the latest purchase per buyer, biggest spender first', () => {
    const rows = summarizeCustomers([
      s('Zed Example', 100, 1, 'Thing', 5),
      s('Ann Example', 300, 25, 'Crate Thing', 7),
      s('Zed Example', 250, 1, 'Thing', 9),
      s('Ann Example', 50, 1, 'Copper (Dohen)', 3)
    ])
    expect(rows).toEqual([
      { name: 'Ann Example', credits: 350, purchases: 2, items: 26, lastTs: 7 },
      { name: 'Zed Example', credits: 350, purchases: 2, items: 2, lastTs: 9 }
    ])
  })

  it('breaks credit ties by purchases, then name', () => {
    const rows = summarizeCustomers([s('B Example', 100), s('A Example', 50), s('A Example', 50), s('C Example', 100)])
    expect(rows.map((r) => r.name)).toEqual(['A Example', 'B Example', 'C Example'])
  })

  it('is empty when nobody bought anything', () => {
    expect(summarizeCustomers([])).toEqual([])
  })
})

describe('Store.customerList', () => {
  const sale = (mailId: string, buyer: string, price: number, extra: Partial<ParsedMail> = {}): ParsedMail => ({
    mailId, timestamp: 1_700_000_000, kind: 'sale', vendor: 'V', itemName: 'Thing', quantity: 1, price, counterparty: buyer, ...extra
  })

  it('only counts sales, respects the date range and the character filter', () => {
    const s = new Store(':memory:')
    s.insertEvent('One', sale('1', 'Ann Example', 100))
    s.insertEvent('One', sale('2', 'Ann Example', 200, { timestamp: 1_800_000_000 })) // outside the range below
    s.insertEvent('Two', sale('3', 'Bob Example', 500))
    s.insertEvent('One', { ...sale('4', 'Ann Example', 999), kind: 'purchase' }) // a purchase is not a customer
    expect(s.customerList(0, 1_750_000_000).map((r) => [r.name, r.credits])).toEqual([['Bob Example', 500], ['Ann Example', 100]])
    expect(s.customerList(0, 1_750_000_000, 'One').map((r) => [r.name, r.credits])).toEqual([['Ann Example', 100]])
  })
})
