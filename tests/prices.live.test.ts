import { copyFileSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'

/**
 * Optional check against a COPY of the real app database. Run with:
 *   HT_DB="C:\Users\<you>\AppData\Roaming\holonet-trader\holonettrader.db" npx vitest run tests/prices.live.test.ts
 * It compares the price numbers with plain SQL on the same sales. Skipped when HT_DB is not set.
 */
const src = process.env.HT_DB
describe.skipIf(!src || !existsSync(src))('prices on the real database', () => {
  it('matches plain SQL for the most-sold items', () => {
    const copy = join(tmpdir(), `ht-live-${Date.now()}.db`)
    copyFileSync(src!, copy) // never touch the real file
    const store = new Store(copy)
    const raw = new DatabaseSync(copy, { readOnly: true })
    const rows = store.priceList(0, 4_000_000_000)
    console.log(`items: ${rows.length}`)
    for (const r of rows.slice(0, 6)) {
      console.log(`${r.name.slice(0, 40).padEnd(40)} x${r.sales}  low ${Math.round(r.low)}  recent ${Math.round(r.recentMedian)}  high ${Math.round(r.high)}  trend ${r.trend}`)
    }
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows.slice(0, 25)) {
      const sql = raw
        .prepare("SELECT COUNT(*) n, MIN(1.0*price/quantity) lo, MAX(1.0*price/quantity) hi, AVG(1.0*price/quantity) av FROM events WHERE kind='sale' AND item_key=?")
        .get(r.key) as { n: number; lo: number; hi: number; av: number }
      expect(r.sales).toBe(sql.n)
      expect(r.low).toBeCloseTo(sql.lo, 6)
      expect(r.high).toBeCloseTo(sql.hi, 6)
      expect(r.average).toBeCloseTo(sql.av, 6)
    }
  })
})
