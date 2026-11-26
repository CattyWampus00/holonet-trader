import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import type { ParsedMail } from '../src/shared/types'

const sale = (id: string, ts: number, item: string, qty: number, price: number): ParsedMail => ({
  mailId: id, timestamp: ts, kind: 'sale', vendor: 'Shop', itemName: item, quantity: qty, price, counterparty: 'Bob'
})
const future = () => Math.floor(Date.now() / 1000) + 3600

describe('Store', () => {
  it('ignores duplicate mails', () => {
    const s = new Store(':memory:')
    expect(s.insertEvent('A', sale('1', 10, 'Thing', 1, 100)).inserted).toBe(true)
    expect(s.insertEvent('A', sale('1', 10, 'Thing', 1, 100)).inserted).toBe(false)
    expect(s.insertEvent('B', sale('1', 10, 'Thing', 1, 100)).inserted).toBe(true) // same id, other character
  })

  it('reduces stock only for sales after the item was added', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 10, 'Crate Thing', 25, 2500)) // old sale, before the item exists
    const id = s.saveItem({ name: 'crate thing', onHand: 100, costEach: 50, lowThreshold: null, notes: '' })
    expect(s.getItem(id)!.onHand).toBe(100) // history did not touch the manual count
    s.insertEvent('A', sale('2', future(), 'Crate Thing', 25, 2500)) // new sale
    expect(s.getItem(id)!.onHand).toBe(75)
    s.insertEvent('A', sale('2', future(), 'Crate Thing', 25, 2500)) // duplicate
    expect(s.getItem(id)!.onHand).toBe(75)
  })

  it('never goes below zero and remembers aliases', () => {
    const s = new Store(':memory:')
    const id = s.saveItem({ name: 'Armor Attachment', onHand: 1, costEach: 0, lowThreshold: 2, notes: '' })
    s.insertEvent('A', sale('1', future(), 'Constitution Armor Attachment', 1, 700000))
    expect(s.unmatched()).toHaveLength(1)
    s.linkAlias('constitution armor attachment', id)
    expect(s.getItem(id)!.onHand).toBe(0)
    expect(s.unmatched()).toHaveLength(0)
    s.insertEvent('A', sale('2', future(), 'Constitution Armor Attachment', 3, 1))
    expect(s.getItem(id)!.onHand).toBe(0)
  })

  it('undoes a wrong link: stock comes back and the sales are unmatched again', () => {
    const s = new Store(':memory:')
    const id = s.saveItem({ name: 'Rifle Scope', onHand: 10, costEach: 0, lowThreshold: null, notes: '' })
    const other = s.saveItem({ name: 'Pistol Grip', onHand: 5, costEach: 0, lowThreshold: null, notes: '' })
    s.insertEvent('A', sale('1', future(), 'Pistol Barrel', 2, 100))
    s.linkAlias('pistol barrel', id) // the mis-click
    s.insertEvent('A', sale('2', future(), 'Pistol Barrel', 3, 100)) // later sale follows the wrong link
    expect(s.getItem(id)!.onHand).toBe(5)
    const link = { key: 'pistol barrel', name: 'Pistol Barrel', sales: 2, itemId: id, itemName: 'Rifle Scope' }
    expect(s.linkedNames(id)).toEqual([link])
    expect(s.linkedNames(other)).toEqual([])
    expect(s.linkedNames()).toEqual([link]) // every link, for the overview list

    expect(s.unlinkAlias('pistol barrel')).toBe(5)
    expect(s.getItem(id)!.onHand).toBe(10)
    expect(s.linkedNames(id)).toEqual([])
    expect(s.unmatched()).toMatchObject([{ key: 'pistol barrel', sales: 2, units: 5 }])
    expect(s.unlinkAlias('pistol barrel')).toBe(0) // second undo does nothing

    s.linkAlias('pistol barrel', other) // the right link works afterwards
    expect(s.getItem(other)!.onHand).toBe(0)
    expect(s.getItem(id)!.onHand).toBe(10)
  })

  it('summarises revenue', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 1000, 'X', 2, 500))
    s.insertEvent('A', sale('2', 2000, 'Y', 1, 700))
    expect(s.summary(0, 5000).totals).toMatchObject({ sales: 2, revenue: 1200, units: 3 })
  })
})

describe('Store character filter', () => {
  const mk = () => {
    const s = new Store(':memory:')
    s.insertEvent('Alpha', sale('1', 1000, 'X', 1, 100))
    s.insertEvent('Alpha', sale('2', 1100, 'Y', 1, 200))
    s.insertEvent('Beta', sale('1', 1200, 'Z', 1, 400))
    return s
  }
  it('limits the summary to one character', () => {
    const s = mk()
    expect(s.summary(0, 5000).totals).toMatchObject({ sales: 3, revenue: 700 })
    expect(s.summary(0, 5000, 'Alpha').totals).toMatchObject({ sales: 2, revenue: 300 })
    expect(s.summary(0, 5000, 'Beta').byDay).toHaveLength(1)
    expect(s.summary(0, 5000, 'Nobody').totals).toMatchObject({ sales: 0, revenue: 0 })
  })
  it('keeps the by-character comparison complete even when filtered', () => {
    expect(mk().summary(0, 5000, 'Alpha').byCharacter).toHaveLength(2)
  })
  it('limits the sales list to one character', () => {
    const rows = mk().listEvents({ character: 'Beta' })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.character).toBe('Beta')
  })
})
