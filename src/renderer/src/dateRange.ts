/** Pure date-range logic for the date bar (kept apart from React so it can be unit tested). */
import { yearBounds } from '../../shared/yearArchive'

export type Preset = 'today' | '7' | '30' | '90' | 'year' | 'all' | 'custom'

export interface RangeValue {
  preset: Preset
  /** Local dates as YYYY-MM-DD, used when preset is 'custom'. */
  from: string
  to: string
}

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' }
]

const DAY = 86400

/** YYYY-MM-DD for a Date in LOCAL time (toISOString would shift to UTC). */
export function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function parseInputDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Unix-second bounds (inclusive) for a range value. `now` is injectable for tests. */
export function rangeBounds(v: RangeValue, now = new Date()): { from: number; to: number } {
  const today = Math.floor(startOfDay(now).getTime() / 1000)
  const endOfToday = today + DAY - 1
  switch (v.preset) {
    case 'today': return { from: today, to: endOfToday }
    case '7': return { from: today - 6 * DAY, to: endOfToday }
    case '30': return { from: today - 29 * DAY, to: endOfToday }
    case '90': return { from: today - 89 * DAY, to: endOfToday }
    case 'year': return { from: Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000), to: endOfToday }
    case 'all': return { from: 0, to: endOfToday }
    case 'custom': {
      const a = parseInputDate(v.from)
      const b = parseInputDate(v.to)
      if (!a && !b) return { from: 0, to: endOfToday }
      let from = a ? Math.floor(a.getTime() / 1000) : 0
      let to = b ? Math.floor(startOfDay(b).getTime() / 1000) + DAY - 1 : endOfToday
      if (from > to) [from, to] = [Math.floor(startOfDay(b!).getTime() / 1000), Math.floor(startOfDay(a!).getTime() / 1000) + DAY - 1] // user typed them backwards
      return { from, to }
    }
  }
}

/**
 * Year-end close (docs/YEAR_END_PLAN.md): once a financial year is closed, the Dashboard, Sales Log and Customers never
 * look before the new year's start. Nothing is deleted; Prices does not use this and keeps every year.
 * `yearStart` is unix seconds (local midnight, Jan 1), or null when no year has been closed.
 */
export function clampToYear(b: { from: number; to: number }, yearStart: number | null): { from: number; to: number } {
  return yearStart == null ? b : { from: Math.max(b.from, yearStart), to: b.to }
}

/**
 * Looking back (docs/YEAR_END_PLAN.md, Step 5): years before the current financial year that have sales, newest first.
 * They can be browsed on the Sales Log and Customers. Empty while no year is closed, since everything is current then.
 */
export function pastYears(salesYears: number[], yearStart: number | null): number[] {
  if (yearStart == null) return []
  return salesYears.filter((y) => yearBounds(y).to < yearStart).sort((a, b) => b - a)
}

/**
 * What the Sales Log and Customers show: a past year chosen with the Year control shows that whole year (the date bar
 * is set aside); otherwise the date range, clamped to the current financial year.
 */
export function viewBounds(range: RangeValue, yearStart: number | null, year: number | null, now = new Date()): { from: number; to: number } {
  return year != null ? yearBounds(year) : clampToYear(rangeBounds(range, now), yearStart)
}

/** Human label such as "30 Oct 2026 to 16 Nov 2026" or "All time" (after a year close: "Since 1 Jan 2027"). */
export function rangeLabel(v: RangeValue, now = new Date(), yearStart: number | null = null): string {
  const f = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  if (v.preset === 'all') return yearStart == null ? 'All time' : `Since ${f(yearStart)}`
  const { from, to } = clampToYear(rangeBounds(v, now), yearStart)
  if (from > to) return `Before ${f(yearStart!)}: in the closed year`
  return from === 0 ? `Up to ${f(to)}` : f(from) === f(to) ? f(from) : `${f(from)} to ${f(to)}`
}
