import { describe, expect, it } from 'vitest'
import { clampToYear, pastYears, rangeBounds, rangeLabel, toInputDate, viewBounds } from '../src/renderer/src/dateRange'

const NOW = new Date(2026, 10, 16, 15, 30) // 16 Nov 2026, 3:30pm local
const ts = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => Math.floor(new Date(y, m - 1, d, h, mi, s).getTime() / 1000)

describe('rangeBounds', () => {
  it('today covers local midnight to 23:59:59', () => {
    expect(rangeBounds({ preset: 'today', from: '', to: '' }, NOW)).toEqual({ from: ts(2026, 11, 16), to: ts(2026, 11, 16, 23, 59, 59) })
  })
  it('7 days includes today and the 6 days before', () => {
    expect(rangeBounds({ preset: '7', from: '', to: '' }, NOW).from).toBe(ts(2026, 11, 10))
  })
  it('all time starts at 0', () => {
    expect(rangeBounds({ preset: 'all', from: '', to: '' }, NOW).from).toBe(0)
  })
  it('custom includes the whole "to" day', () => {
    expect(rangeBounds({ preset: 'custom', from: '2026-10-01', to: '2026-10-31' }, NOW)).toEqual({ from: ts(2026, 10, 1), to: ts(2026, 10, 31, 23, 59, 59) })
  })
  it('custom fixes dates typed backwards', () => {
    expect(rangeBounds({ preset: 'custom', from: '2026-10-31', to: '2026-10-01' }, NOW)).toEqual({ from: ts(2026, 10, 1), to: ts(2026, 10, 31, 23, 59, 59) })
  })
  it('custom with nothing filled in falls back to all time', () => {
    expect(rangeBounds({ preset: 'custom', from: '', to: '' }, NOW).from).toBe(0)
  })
})

describe('helpers', () => {
  it('formats local dates for the picker', () => {
    expect(toInputDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('labels ranges', () => {
    expect(rangeLabel({ preset: 'all', from: '', to: '' }, NOW)).toBe('All time')
    expect(rangeLabel({ preset: 'today', from: '', to: '' }, NOW)).toMatch(/2026/)
  })
})

describe('financial year (year-end close)', () => {
  const Y2027 = ts(2027, 1, 1) // local midnight, Jan 1
  const JAN5 = new Date(2027, 0, 5, 10, 0)

  it('This year runs from local midnight on Jan 1 to the end of today', () => {
    expect(rangeBounds({ preset: 'year', from: '', to: '' }, NOW)).toEqual({ from: ts(2026, 1, 1), to: ts(2026, 11, 16, 23, 59, 59) })
    expect(rangeBounds({ preset: 'year', from: '', to: '' }, JAN5).from).toBe(Y2027)
  })

  it('no closed year changes nothing', () => {
    const b = rangeBounds({ preset: 'all', from: '', to: '' }, JAN5)
    expect(clampToYear(b, null)).toEqual(b)
  })

  it('after a close, ranges never reach back before the new year', () => {
    expect(clampToYear(rangeBounds({ preset: 'all', from: '', to: '' }, JAN5), Y2027).from).toBe(Y2027)
    expect(clampToYear(rangeBounds({ preset: '30', from: '', to: '' }, JAN5), Y2027).from).toBe(Y2027) // 30 days would reach into December
    expect(clampToYear(rangeBounds({ preset: 'today', from: '', to: '' }, JAN5), Y2027).from).toBe(ts(2027, 1, 5)) // already inside: unchanged
  })

  it('a sale at 11:59:59 pm on Dec 31 stays in the closed year; midnight starts the new one', () => {
    const { from } = clampToYear(rangeBounds({ preset: 'all', from: '', to: '' }, JAN5), Y2027)
    expect(ts(2026, 12, 31, 23, 59, 59) < from).toBe(true)
    expect(ts(2027, 1, 1, 0, 0, 0) >= from).toBe(true)
  })

  it('labels say what is actually shown', () => {
    expect(rangeLabel({ preset: 'all', from: '', to: '' }, JAN5, Y2027)).toMatch(/^Since /)
    expect(rangeLabel({ preset: 'custom', from: '2026-12-01', to: '2026-12-31' }, JAN5, Y2027)).toMatch(/in the closed year$/)
    expect(rangeLabel({ preset: 'all', from: '', to: '' }, JAN5, null)).toBe('All time')
  })
})

describe('looking back at a closed year (Step 5)', () => {
  const start2027 = ts(2027, 1, 1)
  it('offers only years before the current financial year, newest first', () => {
    expect(pastYears([2027, 2025, 2026], start2027)).toEqual([2026, 2025])
    expect(pastYears([2027, 2026], null)).toEqual([]) // nothing closed: everything is current
  })
  it('a chosen year shows all of it, whatever the date bar says', () => {
    const now = new Date(2027, 2, 10)
    expect(viewBounds({ preset: '30', from: '', to: '' }, start2027, 2026, now)).toEqual({ from: ts(2026, 1, 1), to: ts(2026, 12, 31, 23, 59, 59) })
  })
  it('no chosen year: the date range, clamped to the current financial year', () => {
    const now = new Date(2027, 0, 5)
    expect(viewBounds({ preset: '30', from: '', to: '' }, start2027, null, now)).toEqual({ from: start2027, to: ts(2027, 1, 5, 23, 59, 59) })
  })
})
