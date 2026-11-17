/** Pure date-range logic for the date bar (kept apart from React so it can be unit tested). */

export type Preset = 'today' | '7' | '30' | '90' | 'all' | 'custom'

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

/** Human label such as "30 Oct 2026 to 16 Nov 2026" or "All time". */
export function rangeLabel(v: RangeValue, now = new Date()): string {
  if (v.preset === 'all') return 'All time'
  const { from, to } = rangeBounds(v, now)
  const f = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return from === 0 ? `Up to ${f(to)}` : f(from) === f(to) ? f(from) : `${f(from)} to ${f(to)}`
}
