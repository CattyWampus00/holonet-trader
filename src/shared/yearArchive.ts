/**
 * Year-end archive (docs/YEAR_END_PLAN.md, Step 2): pure helpers that turn a year's sales into CSV files that open in
 * Excel. Writing files and copying the database happen in the main process (Store.exportYear); nothing here touches disk.
 */
import { cleanItemName } from './mailParser'
import type { CustomerRow, SaleRow } from './types'

/** Words for each kind of mail in the Sales Log and the archive. */
export const EVENT_LABEL: Record<string, string> = {
  sale: 'Sold', purchase: 'Bought', unsold: 'Unsold', expired: 'Expired', offer_in: 'Offer received', offer_out: 'Offer made'
}

/** A financial year in LOCAL time (owner's choice): Jan 1 00:00:00 to Dec 31 23:59:59, as unix seconds. */
export function yearBounds(year: number): { from: number; to: number } {
  return { from: Math.floor(new Date(year, 0, 1).getTime() / 1000), to: Math.floor(new Date(year + 1, 0, 1).getTime() / 1000) - 1 }
}

// ---- closing a year (Step 3) ----------------------------------------------------
// The app keeps a list of closed years. The current financial year starts on Jan 1 after the newest closed one.
// Closing never deletes anything; reopening takes the newest year off the list.

/** Start of the current financial year (unix seconds, local midnight Jan 1), or null when no year is closed. */
export function yearStartFrom(closed: number[]): number | null {
  return closed.length ? yearBounds(Math.max(...closed)).to + 1 : null
}

/** True from Dec 26 (local) to the end of the year: the window when the year that is ending can be closed early. */
const yearEnding = (now: Date) => now.getMonth() === 11 && now.getDate() >= 26

/**
 * Whether `year` can be closed now: it is not closed yet, it is not older than the newest closed year (years close in
 * order), and it has ended, or it is the current year and it is Dec 26 or later (the player may not play on Jan 1).
 */
export function canCloseYear(year: number, now: Date, closed: number[]): boolean {
  if (closed.includes(year) || (closed.length > 0 && year < Math.max(...closed))) return false
  return year < now.getFullYear() || (year === now.getFullYear() && yearEnding(now))
}

/**
 * The Dashboard's year-end reminder, or null. From Dec 26 it is about the year that is ending; from Jan 1 about the
 * year before. It shows only for a year with sales that is not closed and not put off with "Not now". Dec 26 to Jan 7
 * is "due"; after that it is "late" and quieter.
 */
export function closeReminder(now: Date, closed: number[], snoozed: number | null, yearsWithSales: number[]): { year: number; level: 'due' | 'late' } | null {
  const year = yearEnding(now) ? now.getFullYear() : now.getFullYear() - 1
  if (!yearsWithSales.includes(year) || snoozed === year || !canCloseYear(year, now, closed)) return null
  const due = yearEnding(now) || (now.getMonth() === 0 && now.getDate() <= 7)
  return { year, level: due ? 'due' : 'late' }
}

// ---- late mail (Step 4) -------------------------------------------------------------
// When an archive is saved, the app remembers how many sales and purchases it held. Mail dated in a closed year that is
// imported later (a /mailsave run after the close) raises the database's count above that, and the archive is behind.

export interface YearCount { sales: number; purchases: number }
export interface LateMail { year: number; sales: number; purchases: number }

/**
 * Closed years whose archive is missing mail that has arrived since it was saved. `archived` is the count at the last
 * save, `current` the count in the database now, `dismissed` the database total when the player chose "Not now" (the
 * notice returns if more mail arrives after that). A year with no remembered archive count is skipped.
 */
export function lateMail(closed: number[], archived: Record<string, YearCount>, current: Record<string, YearCount>,
  dismissed: Record<string, number>): LateMail[] {
  const out: LateMail[] = []
  for (const year of [...closed].sort((a, b) => b - a)) {
    const was = archived[year], now = current[year]
    if (!was || !now) continue
    const sales = Math.max(0, now.sales - was.sales), purchases = Math.max(0, now.purchases - was.purchases)
    if (sales + purchases === 0 || dismissed[year] === now.sales + now.purchases) continue
    out.push({ year, sales, purchases })
  }
  return out
}

/** "3 sales", "1 sale and 2 purchases": what arrived late, for the notice. */
export function lateMailText(m: LateMail): string {
  const part = (n: number, one: string) => `${n.toLocaleString('en-US')} ${one}${n === 1 ? '' : 's'}`
  return [m.sales && part(m.sales, 'sale'), m.purchases && part(m.purchases, 'purchase')].filter(Boolean).join(' and ')
}

/** The file names for one year's archive, all in the folder the player picks. */
export function archiveFiles(year: number) {
  return { db: `HoloNet-${year}.db`, sales: `Sales-${year}.csv`, customers: `Customers-${year}.csv`, summary: `Summary-${year}.csv` }
}

/** "2026-12-31 23:58" in local time: sorts correctly and Excel reads it as a date. */
export function localStamp(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * CSV text: every cell quoted (item names have commas), quotes doubled, Windows line ends. Starts with a byte-order
 * mark so Excel reads accented names as UTF-8 instead of garbling them.
 */
export function toCsv(head: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return '﻿' + [head.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n') + '\r\n'
}

/** Every mail row as a spreadsheet line. Item names lose their in-game color codes. Used by the Sales Log export too. */
export function salesCsv(rows: SaleRow[], when: (ts: number) => string = localStamp): string {
  return toCsv(
    ['Date', 'Character', 'Type', 'Vendor', 'Item', 'Qty', 'Uses', 'Credits', 'Buyer/Seller', 'City', 'Planet'],
    rows.map((r) => [when(r.ts), r.character, EVENT_LABEL[r.kind] ?? r.kind, r.vendor, r.itemName ? cleanItemName(r.itemName) : '', r.quantity, r.uses, r.price, r.counterparty, r.city, r.planet])
  )
}

/** The year's customer list, biggest spender first (the order summarizeCustomers gives). */
export function customersCsv(rows: CustomerRow[]): string {
  return toCsv(['Buyer', 'Credits', 'Purchases', 'Items', 'Last purchase'], rows.map((c) => [c.name, c.credits, c.purchases, c.items, localStamp(c.lastTs)]))
}

export interface YearSummary {
  year: number
  sales: number
  units: number
  revenue: number
  spent: number
  byCharacter: { name: string; sales: number; revenue: number }[]
  byVendor: { name: string; sales: number; revenue: number }[]
  byItem: { name: string; sales: number; units: number; revenue: number }[]
}

/** Year totals, then totals by character, by vendor and by item, as one sheet with a Section column. */
export function summaryCsv(s: YearSummary): string {
  const rows: unknown[][] = [
    ['Year', s.year, s.sales, s.units, s.revenue],
    ['Spent on purchases', '', '', '', s.spent],
    ['Net after purchases', '', '', '', s.revenue - s.spent],
    ...s.byCharacter.map((r) => ['Character', r.name, r.sales, '', r.revenue]),
    ...s.byVendor.map((r) => ['Vendor', r.name ?? '', r.sales, '', r.revenue]),
    ...s.byItem.map((r) => ['Item', cleanItemName(r.name ?? ''), r.sales, r.units, r.revenue])
  ]
  return toCsv(['Section', 'Name', 'Sales', 'Units', 'Credits'], rows)
}
