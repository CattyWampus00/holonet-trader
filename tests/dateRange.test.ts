import { describe, expect, it } from 'vitest'
import { rangeBounds, rangeLabel, toInputDate } from '../src/renderer/src/dateRange'

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
