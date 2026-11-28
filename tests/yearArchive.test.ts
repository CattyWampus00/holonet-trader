import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import type { ParsedMail } from '../src/shared/types'
import { archiveFiles, canCloseYear, closeReminder, customersCsv, lateMail, lateMailText, localStamp, salesCsv, summaryCsv, toCsv, yearBounds, yearStartFrom } from '../src/shared/yearArchive'

const at = (y: number, m: number, d: number, h = 12, mi = 0, s = 0) => Math.floor(new Date(y, m - 1, d, h, mi, s).getTime() / 1000)
const mail = (id: string, ts: number, kind: 'sale' | 'purchase', item: string, price: number, who = 'Buyera'): ParsedMail =>
  ({ mailId: id, timestamp: ts, kind, vendor: 'Testshop', itemName: item, quantity: 1, price, counterparty: who })

describe('year archive CSV', () => {
  it('a year is local Jan 1 00:00:00 to Dec 31 23:59:59', () => {
    expect(yearBounds(2026)).toEqual({ from: at(2026, 1, 1, 0), to: at(2026, 12, 31, 23, 59, 59) })
  })

  it('quotes every cell, doubles quotes, and starts with a byte-order mark for Excel', () => {
    const text = toCsv(['A', 'B'], [['Bit, "Heavy"', null]])
    expect(text.startsWith('﻿')).toBe(true)
    expect(text.slice(1)).toBe('"A","B"\r\n"Bit, ""Heavy""",""\r\n')
  })

  it('sales lines drop in-game color codes and use sortable local dates', () => {
    const csv = salesCsv([{ id: 1, character: 'Testchar', ts: at(2026, 12, 31, 23, 58), kind: 'sale', vendor: 'Testshop', itemName: '\\#7CFC0010 Crates of 25: \\#ffffff Knife', quantity: 250, uses: null, price: 25000, counterparty: 'Buyera', city: 'Talus', planet: 'Talus', itemId: null }])
    expect(csv).toContain('"2026-12-31 23:58","Testchar","Sold","Testshop","10 Crates of 25: Knife","250","","25000","Buyera","Talus","Talus"')
    expect(localStamp(at(2027, 1, 1, 0, 0))).toBe('2027-01-01 00:00')
  })

  it('customers and summary sheets', () => {
    expect(customersCsv([{ name: 'Buyera', credits: 900, purchases: 2, items: 3, lastTs: at(2026, 5, 1, 9, 5) }])).toContain('"Buyera","900","2","3","2026-05-01 09:05"')
    const sum = summaryCsv({ year: 2026, sales: 2, units: 3, revenue: 900, spent: 100, byCharacter: [{ name: 'Testchar', sales: 2, revenue: 900 }], byVendor: [{ name: 'Testshop', sales: 2, revenue: 900 }], byItem: [{ name: 'Knife', sales: 2, units: 3, revenue: 900 }] })
    expect(sum).toContain('"Net after purchases","","","","800"')
    expect(sum).toContain('"Item","Knife","2","3","900"')
  })
})

describe('Store.exportYear', () => {
  const dirs: string[] = []
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
  const folder = () => { const d = mkdtempSync(join(tmpdir(), 'holonet-archive-')); dirs.push(d); return join(d, 'Archives') }

  const seeded = () => {
    const s = new Store(':memory:')
    s.insertEvent('Testchar', mail('a', at(2025, 12, 31, 23, 59, 59), 'sale', 'Old Knife', 100)) // last second of 2025
    s.insertEvent('Testchar', mail('b', at(2026, 1, 1, 0, 0, 0), 'sale', 'Knife', 500))          // first second of 2026
    s.insertEvent('Testchar', mail('c', at(2026, 6, 1), 'sale', 'Bit, "Heavy"', 400, 'Buyerb'))
    s.insertEvent('Testchar', mail('d', at(2026, 7, 1), 'purchase', 'Supplies', 100, 'Sellera'))
    s.insertEvent('Testchar', mail('e', at(2027, 1, 1, 0, 0, 0), 'sale', 'New Knife', 700))      // next year
    return s
  }

  it('writes the db copy and three CSVs for exactly that year, changing nothing', () => {
    const s = seeded()
    const before = s.listEvents({ limit: 100 }).length
    const out = folder()
    const r = s.exportYear(2026, out)
    expect(r).toMatchObject({ sales: 2, purchases: 1 })
    const n = archiveFiles(2026)
    expect(readdirSync(out).sort()).toEqual([n.customers, n.db, n.sales, n.summary].sort()) // no .tmp files left
    const sales = readFileSync(join(out, n.sales), 'utf8').trim().split('\r\n')
    expect(sales).toHaveLength(1 + 3) // header + 2 sales + 1 purchase; the 2025 and 2027 mails are left out
    expect(sales[1]).toContain('"2026-01-01 00:00"')
    expect(readFileSync(join(out, n.customers), 'utf8')).toContain('"Buyera","500"')
    expect(readFileSync(join(out, n.summary), 'utf8')).toContain('"Year","2026","2","2","900"')
    const copy = new DatabaseSync(join(out, n.db), { readOnly: true })
    expect((copy.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(5) // a full copy
    copy.close()
    expect(s.listEvents({ limit: 100 }).length).toBe(before) // nothing deleted or changed
  })

  it('writing the same year again replaces its files (late mail)', () => {
    const s = seeded()
    const out = folder()
    s.exportYear(2026, out)
    s.insertEvent('Testchar', mail('late', at(2026, 12, 31, 23, 58), 'sale', 'Knife', 500))
    expect(s.exportYear(2026, out).sales).toBe(3)
    expect(readFileSync(join(out, archiveFiles(2026).sales), 'utf8').trim().split('\r\n')).toHaveLength(1 + 4)
  })

  it('lists the years that have sales', () => {
    expect(seeded().salesYears()).toEqual([2027, 2026, 2025])
  })

  it('counts sales and purchases per local year', () => {
    expect(seeded().yearCounts()).toEqual({ 2025: { sales: 1, purchases: 0 }, 2026: { sales: 2, purchases: 1 }, 2027: { sales: 1, purchases: 0 } })
  })
})

describe('late mail', () => {
  const saved = { 2026: { sales: 2, purchases: 1 } }

  it('a closed year whose database count grew since its archive was saved', () => {
    expect(lateMail([2026], saved, { 2026: { sales: 5, purchases: 1 } }, {})).toEqual([{ year: 2026, sales: 3, purchases: 0 }])
    expect(lateMail([2026], saved, { 2026: { sales: 2, purchases: 1 } }, {})).toEqual([]) // archive up to date
  })

  it('skips open years and years with no remembered archive', () => {
    const now = { 2026: { sales: 5, purchases: 1 }, 2027: { sales: 9, purchases: 0 } }
    expect(lateMail([], saved, now, {})).toEqual([])           // 2026 not closed (reopened)
    expect(lateMail([2026, 2027], saved, now, {})).toHaveLength(1) // 2027 closed but never archived here
  })

  it('Not now hides it until more mail for that year arrives', () => {
    expect(lateMail([2026], saved, { 2026: { sales: 4, purchases: 1 } }, { 2026: 5 })).toEqual([])
    expect(lateMail([2026], saved, { 2026: { sales: 5, purchases: 1 } }, { 2026: 5 })).toEqual([{ year: 2026, sales: 3, purchases: 0 }])
  })

  it('re-reading the same mail is not late mail', () => {
    const s = new Store(':memory:')
    s.insertEvent('Testchar', mail('a', at(2026, 6, 1), 'sale', 'Knife', 500))
    const was = s.yearCounts()
    s.insertEvent('Testchar', mail('a', at(2026, 6, 1), 'sale', 'Knife', 500)) // the same mail id again: ignored
    expect(lateMail([2026], was, s.yearCounts(), {})).toEqual([])
    s.insertEvent('Testchar', mail('z', at(2026, 12, 31, 23, 58), 'purchase', 'Supplies', 100))
    expect(lateMail([2026], was, s.yearCounts(), {})).toEqual([{ year: 2026, sales: 0, purchases: 1 }])
  })

  it('says what arrived', () => {
    expect(lateMailText({ year: 2026, sales: 3, purchases: 0 })).toBe('3 sales')
    expect(lateMailText({ year: 2026, sales: 1, purchases: 2 })).toBe('1 sale and 2 purchases')
    expect(lateMailText({ year: 2026, sales: 0, purchases: 1 })).toBe('1 purchase')
  })
})

describe('closing a year', () => {
  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12)

  it('the financial year starts on Jan 1 after the newest closed year', () => {
    expect(yearStartFrom([])).toBeNull()
    expect(yearStartFrom([2026])).toBe(at(2027, 1, 1, 0))
    expect(yearStartFrom([2025, 2026])).toBe(at(2027, 1, 1, 0))
  })

  it('a year can close once it ended, or from Dec 26 of that year; never twice, never out of order', () => {
    expect(canCloseYear(2026, d(2026, 11, 27), [])).toBe(false) // November: too early
    expect(canCloseYear(2026, d(2026, 12, 25), [])).toBe(false)
    expect(canCloseYear(2026, d(2026, 12, 26), [])).toBe(true)
    expect(canCloseYear(2026, d(2027, 3, 1), [])).toBe(true) // forgot until March: still fine
    expect(canCloseYear(2026, d(2027, 1, 2), [2026])).toBe(false) // already closed
    expect(canCloseYear(2025, d(2027, 1, 2), [2026])).toBe(false) // older than a closed year
  })

  it('reminds from Dec 26, is due until Jan 7, then late; Not now and closing stop it', () => {
    const sales = [2026]
    expect(closeReminder(d(2026, 11, 27), [], null, sales)).toBeNull()
    expect(closeReminder(d(2026, 12, 26), [], null, sales)).toEqual({ year: 2026, level: 'due' })
    expect(closeReminder(d(2027, 1, 7), [], null, sales)).toEqual({ year: 2026, level: 'due' })
    expect(closeReminder(d(2027, 1, 8), [], null, sales)).toEqual({ year: 2026, level: 'late' })
    expect(closeReminder(d(2027, 1, 8), [], 2026, sales)).toBeNull() // Not now
    expect(closeReminder(d(2027, 1, 2), [2026], null, sales)).toBeNull() // closed
    expect(closeReminder(d(2027, 1, 2), [], null, [])).toBeNull() // no sales that year: nothing to close
  })
})
