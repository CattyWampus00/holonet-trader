import { describe, expect, it } from 'vitest'
import { costText, DEFAULT_LOW_THRESHOLD, getStockStatus, needsRestock, parseCost, stockValue } from '../src/shared/stock'

describe('getStockStatus', () => {
  it('is out when nothing is left, even when the warning level is set (the owner\'s 0 on hand / warn at 5 case)', () => {
    expect(getStockStatus(0, 5, 5)).toBe('out')
    expect(getStockStatus(0, null, 5)).toBe('out')
    expect(getStockStatus(0, 0, 5)).toBe('out')
  })

  it('is low at or below the warning level and ok above it', () => {
    expect(getStockStatus(3, 5, 99)).toBe('low')
    expect(getStockStatus(5, 5, 99)).toBe('low') // exactly at the level counts as low
    expect(getStockStatus(6, 5, 99)).toBe('ok')
  })

  it('uses the app-wide default when the item has no level of its own', () => {
    expect(getStockStatus(5, null, 5)).toBe('low')
    expect(getStockStatus(6, null, 5)).toBe('ok')
    expect(getStockStatus(50, null, 100)).toBe('low')
  })

  it('prefers the item level over the default, in both directions', () => {
    expect(getStockStatus(20, 50, 5)).toBe('low') // stricter than the default
    expect(getStockStatus(20, 10, 100)).toBe('ok') // looser than the default
  })

  it('treats a level of 0 as "only warn when gone", not "never warn"', () => {
    expect(getStockStatus(1, 0, 5)).toBe('ok')
    expect(getStockStatus(0, 0, 5)).toBe('out')
  })

  it('has a sensible built-in default', () => {
    expect(DEFAULT_LOW_THRESHOLD).toBe(5)
  })
})

describe('needsRestock', () => {
  it('flags low and out items, but never archived ones', () => {
    expect(needsRestock({ onHand: 0, lowThreshold: null, archived: false }, 5)).toBe(true)
    expect(needsRestock({ onHand: 3, lowThreshold: null, archived: false }, 5)).toBe(true)
    expect(needsRestock({ onHand: 9, lowThreshold: null, archived: false }, 5)).toBe(false)
    expect(needsRestock({ onHand: 0, lowThreshold: null, archived: true }, 5)).toBe(false) // despawned resource
  })
})

describe('fractional cost each', () => {
  it('a stack value always rounds up to a whole credit', () => {
    expect(stockValue(25, 0.5)).toBe(13)
    expect(stockValue(1, 0.5)).toBe(1)
    expect(stockValue(4, 0.5)).toBe(2)
    expect(stockValue(0, 0.5)).toBe(0)
    expect(stockValue(100, 0.07)).toBe(7) // float noise is not a credit
  })
  it('reads what the player types', () => {
    expect(parseCost('0.5')).toBe(0.5)
    expect(parseCost('.5')).toBe(0.5)
    expect(parseCost('1,200')).toBe(1200)
    expect(parseCost('')).toBe(0)
    expect(parseCost('-3')).toBe(0)
    expect(parseCost('abc')).toBe(0)
  })
  it('shows fractions instead of rounding them away', () => {
    expect(costText(0.5)).toBe('0.5')
    expect(costText(1200)).toBe('1,200')
  })
})
