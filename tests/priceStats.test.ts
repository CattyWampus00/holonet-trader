import { describe, expect, it } from 'vitest'
import { classifyTrend, FLAT_BAND, median, MIN_PREVIOUS, RECENT_WINDOW, summarize, unitPrice, type PricePoint } from '../src/shared/priceStats'

const pt = (ts: number, price: number, quantity = 1): PricePoint => ({ ts, price, quantity })

describe('unitPrice', () => {
  it('divides a crate price by its size', () => {
    expect(unitPrice(pt(1, 2500, 25))).toBe(100)
  })
  it('treats a missing crate size as a single item', () => {
    expect(unitPrice(pt(1, 700, 0))).toBe(700)
  })
})

describe('median', () => {
  it('handles empty, odd and even lists without changing the input', () => {
    const v = [5, 1, 3]
    expect(median([])).toBeNull()
    expect(median(v)).toBe(3)
    expect(v).toEqual([5, 1, 3])
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })
})

describe('summarize', () => {
  it('returns an empty summary for no sales', () => {
    expect(summarize([])).toMatchObject({ sales: 0, low: null, high: null, last: null, recentMedian: null, previousMedian: null, crateSizes: [] })
  })

  it('compares crates and singles fairly', () => {
    const s = summarize([pt(1, 100, 1), pt(2, 2500, 25), pt(3, 500, 5)])
    expect(s.low).toBe(100)
    expect(s.high).toBe(100)
    expect(s.average).toBe(100)
    expect(s.units).toBe(31)
    expect(s.crateSizes).toEqual([1, 5, 25])
  })

  it('does not depend on the input order and picks the newest sale as last', () => {
    const a = summarize([pt(30, 300), pt(10, 100), pt(20, 200)])
    const b = summarize([pt(10, 100), pt(20, 200), pt(30, 300)])
    expect(a).toEqual(b)
    expect(a.last).toEqual({ ts: 30, unitPrice: 300 })
  })

  it('uses the latest RECENT_WINDOW sales for the recent median and the ones before for the previous median', () => {
    // ten sales; the five newest cost 200, the five before cost 100
    const pts = [...Array(5)].map((_, i) => pt(i + 1, 100)).concat([...Array(5)].map((_, i) => pt(i + 6, 200)))
    const s = summarize(pts)
    expect(RECENT_WINDOW).toBe(5)
    expect(s.recentMedian).toBe(200)
    expect(s.previousMedian).toBe(100)
  })

  it('has no previous median until there are MIN_PREVIOUS earlier sales', () => {
    const six = [...Array(RECENT_WINDOW + MIN_PREVIOUS - 1)].map((_, i) => pt(i + 1, 100))
    expect(summarize(six).previousMedian).toBeNull()
    const seven = [...Array(RECENT_WINDOW + MIN_PREVIOUS)].map((_, i) => pt(i + 1, 100))
    expect(summarize(seven).previousMedian).toBe(100)
  })

  it('still gives a recent median for a single sale', () => {
    const s = summarize([pt(1, 250)])
    expect(s.recentMedian).toBe(250)
    expect(s.previousMedian).toBeNull()
  })
})

describe('classifyTrend', () => {
  it('is unknown without enough history', () => {
    expect(classifyTrend(null, 100)).toBe('unknown')
    expect(classifyTrend(100, null)).toBe('unknown')
    expect(classifyTrend(null, null)).toBe('unknown')
  })

  it('calls small moves flat and big moves up or down', () => {
    expect(classifyTrend(102, 100)).toBe('flat')
    expect(classifyTrend(98, 100)).toBe('flat')
    expect(classifyTrend(110, 100)).toBe('up')
    expect(classifyTrend(90, 100)).toBe('down')
    expect(classifyTrend(100, 100)).toBe('flat')
  })

  it('treats a move of exactly the flat band as flat, in both directions', () => {
    expect(FLAT_BAND).toBe(0.05)
    expect(classifyTrend(105, 100)).toBe('flat')
    expect(classifyTrend(95, 100)).toBe('flat')
    expect(classifyTrend(105.01, 100)).toBe('up')
    expect(classifyTrend(94.99, 100)).toBe('down')
  })

  it('judges the move as a share of the price, so item value does not matter', () => {
    expect(classifyTrend(42_000, 40_000)).toBe('flat') // +5%
    expect(classifyTrend(735_000, 700_000)).toBe('flat') // +5%
    expect(classifyTrend(800_000, 700_000)).toBe('up') // about +14%
    expect(classifyTrend(30_000, 40_000)).toBe('down') // -25%
  })

  it('uses a custom flat band', () => {
    expect(classifyTrend(110, 100, 0.2)).toBe('flat')
    expect(classifyTrend(130, 100, 0.2)).toBe('up')
  })

  it('does not divide by zero', () => {
    expect(classifyTrend(0, 0)).toBe('flat')
    expect(classifyTrend(50, 0)).toBe('up')
  })

  it('matches real data: Luck Armor style price drops are called down', () => {
    // recent median 250,000 against an earlier median of 800,000
    expect(classifyTrend(250_000, 800_000)).toBe('down')
  })
})
