import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import { isPowerup, isResource } from '../src/shared/mailParser'
import type { ParsedMail } from '../src/shared/types'

const sale = (mailId: string, over: Partial<ParsedMail> = {}): ParsedMail => ({
  mailId, timestamp: 1_700_000_000, kind: 'sale', vendor: 'Test Vendor', itemName: 'Weapon Powerup - Heavy Weapon Damage (7)',
  quantity: 1, uses: 248, price: 100000, counterparty: 'Some Buyer', ...over
})

describe('isPowerup', () => {
  it('matches Weapon, Armor and Clothing power-ups only', () => {
    expect(isPowerup('Weapon Powerup - X (7)')).toBe(true)
    expect(isPowerup('armor powerup - y (3)')).toBe(true)
    expect(isPowerup('+35 Power Bit Pack')).toBe(false)
  })
})

describe('parser version', () => {
  it('forgets scanned files once when the parser version changes, so skipped mails are read again', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ht-')), 'v.db')
    const s = new Store(path)
    s.markScanned('T', 'a.mail')
    s.db.close()
    expect([...new Store(path).knownFiles('T')]).toEqual(['a.mail']) // same version: kept

    const raw = new DatabaseSync(path)
    raw.exec("UPDATE settings SET value='1' WHERE key='parserVersion'") // pretend an older app wrote it
    raw.close()
    const after = new Store(path)
    expect([...after.knownFiles('T')]).toEqual([])
    after.markScanned('T', 'b.mail')
    after.db.close()
    expect([...new Store(path).knownFiles('T')]).toEqual(['b.mail']) // and only once
  })
})

describe('isResource', () => {
  it('matches Type (Name) resources, with or without color codes, but not power-ups or plain items', () => {
    expect(isResource('Copper (Dohen)')).toBe(true)
    expect(isResource('\\#FFFFFFKnown Inert Gas (Opasao)\\#.')).toBe(true)
    expect(isResource('Weapon Powerup - Heavy Weapon Damage (7)')).toBe(false)
    expect(isResource('Mabari Belt - RE - Socketed')).toBe(false)
  })
})

describe('power-up uses', () => {
  it('stores uses separately and keeps the sale as one item', () => {
    const s = new Store(':memory:')
    s.insertEvent('Tester', sale('1'))
    const [row] = s.listEvents({ kinds: ['sale'] })
    expect(row!.quantity).toBe(1)
    expect(row!.uses).toBe(248)
    expect(s.priceList(0, 2_000_000_000)[0]!.lastUnitPrice).toBe(100000)
  })

  it('leaves uses empty for normal items', () => {
    const s = new Store(':memory:')
    s.insertEvent('Tester', sale('2', { itemName: 'Steel Crate', quantity: 25, uses: undefined }))
    expect(s.listEvents({})[0]!.uses).toBeNull()
  })

  it('migrates an old database: moves the number to uses and keeps a backup copy', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ht-')), 'old.db')
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE events(id INTEGER PRIMARY KEY, character TEXT NOT NULL, mail_id TEXT NOT NULL, ts INTEGER NOT NULL,
      kind TEXT NOT NULL, vendor TEXT, item_name TEXT, item_key TEXT, quantity INTEGER NOT NULL DEFAULT 1,
      price INTEGER NOT NULL DEFAULT 0, counterparty TEXT, city TEXT, planet TEXT, item_id INTEGER, UNIQUE(character, mail_id));
      INSERT INTO events(character,mail_id,ts,kind,item_name,item_key,quantity,price) VALUES
      ('T','1',1,'sale','Weapon Powerup - A (7)','weapon powerup - a (7)',248,90000),
      ('T','2',2,'sale','Steel Crate','steel crate',25,5000);`)
    old.close()

    const s = new Store(path)
    const rows = s.listEvents({})
    const pu = rows.find((r) => r.itemName!.startsWith('Weapon'))!
    const steel = rows.find((r) => r.itemName === 'Steel Crate')!
    expect([pu.quantity, pu.uses]).toEqual([1, 248])
    expect([steel.quantity, steel.uses]).toEqual([25, null])
    expect(existsSync(`${path}.before-uses-fix.bak`)).toBe(true)
    s.db.close()
    // opening again must not change anything
    const again = new Store(path)
    expect(again.listEvents({}).find((r) => r.itemName!.startsWith('Weapon'))!.uses).toBe(248)
    again.db.close()
  })
})
