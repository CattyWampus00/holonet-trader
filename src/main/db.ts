import { copyFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { summarizeCustomers, type SaleLine } from '../shared/customers'
import { cleanItemName, itemKey } from '../shared/mailParser'
import { classifyTrend, summarize, unitPrice } from '../shared/priceStats'
import type { CustomerRow, HarvesterResource, InventoryItem, MachineType, MachineTypeInput, ParsedMail, PricePointRow, PriceRow, PriceSeries, SaleRow, Structure, StructureInput, StructureReading } from '../shared/types'
import { resourceItemName, resourceKeyOf, type StructureKind, type StructureState } from '../shared/structures'

/**
 * Bump this whenever the mail parser starts understanding mails it used to skip.
 * 2 = thousands separators: commas and dots in credits and item amounts (2026-11-17).
 */
export const PARSER_VERSION = 2

export class Store {
  readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY, character TEXT NOT NULL, mail_id TEXT NOT NULL, ts INTEGER NOT NULL,
        kind TEXT NOT NULL, vendor TEXT, item_name TEXT, item_key TEXT,
        quantity INTEGER NOT NULL DEFAULT 1, price INTEGER NOT NULL DEFAULT 0,
        counterparty TEXT, city TEXT, planet TEXT, item_id INTEGER,
        UNIQUE(character, mail_id));
      CREATE INDEX IF NOT EXISTS ix_events_ts ON events(ts);
      CREATE INDEX IF NOT EXISTS ix_events_kind ON events(kind);
      CREATE INDEX IF NOT EXISTS ix_events_key ON events(item_key);
      CREATE TABLE IF NOT EXISTS items(
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
        on_hand INTEGER NOT NULL DEFAULT 0, cost_each INTEGER NOT NULL DEFAULT 0,
        low_threshold INTEGER, notes TEXT NOT NULL DEFAULT '', tracking_since INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS aliases(
        alias_key TEXT PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS stock_moves(
        id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL, reason TEXT NOT NULL, ts INTEGER NOT NULL, event_id INTEGER UNIQUE);
      CREATE TABLE IF NOT EXISTS scanned_files(
        character TEXT NOT NULL, file TEXT NOT NULL, PRIMARY KEY(character, file));
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ignored_names(item_key TEXT PRIMARY KEY, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS machine_types(
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, lots INTEGER NOT NULL DEFAULT 0,
        maint_per_hour REAL, power_per_hour REAL, storage INTEGER, efficiency REAL);
      CREATE TABLE IF NOT EXISTS structures(
        id INTEGER PRIMARY KEY, character TEXT NOT NULL,
        type_id INTEGER REFERENCES machine_types(id) ON DELETE SET NULL,
        name TEXT NOT NULL, kind TEXT NOT NULL, planet TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        lots INTEGER NOT NULL DEFAULT 0, maint_per_hour REAL, power_per_hour REAL, storage INTEGER, efficiency REAL,
        created_ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS structure_states(
        id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
        state TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS structure_readings(
        id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
        ts INTEGER NOT NULL, surplus_maint REAL, surplus_power REAL, extraction_rate REAL, hopper_pct REAL);
      CREATE TABLE IF NOT EXISTS harvester_resources(
        id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
        name TEXT NOT NULL, type TEXT NOT NULL, concentration REAL, from_ts INTEGER NOT NULL, to_ts INTEGER);
      CREATE TABLE IF NOT EXISTS hopper_empties(
        id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
        ts INTEGER NOT NULL, resource TEXT NOT NULL, amount INTEGER NOT NULL,
        item_id INTEGER REFERENCES items(id) ON DELETE SET NULL);
    `)
    this.migratePowerupUses(path)
    this.addArchivedColumn()
    this.rescanIfParserChanged()
  }

  /**
   * The scanner marks every file it reads as scanned, even mails the parser could not handle. When the parser
   * learns something new (bump PARSER_VERSION), forget what was scanned so those mails are read again. Events
   * are unique per character and mail id, so mails that were already stored are never counted twice.
   */
  private rescanIfParserChanged(): void {
    if (this.getSetting('parserVersion') === String(PARSER_VERSION)) return
    this.transaction(() => {
      this.db.exec('DELETE FROM scanned_files')
      this.setSetting('parserVersion', String(PARSER_VERSION))
    })
  }

  /**
   * Older databases stored a power-up's "uses" (the trailing number) as its quantity.
   * Adds the `uses` column and moves those numbers across, keeping quantity at 1.
   * A copy of the database file is made first, because this rewrites existing rows.
   */
  private migratePowerupUses(path: string): void {
    const cols = this.db.prepare('PRAGMA table_info(events)').all() as { name: string }[]
    const hasUses = cols.some((c) => c.name === 'uses')
    const stale = hasUses
      ? 0
      : (this.db.prepare("SELECT COUNT(*) AS n FROM events WHERE LOWER(item_name) LIKE '%powerup%' AND quantity > 1").get() as { n: number }).n
    if (!hasUses) {
      if (stale > 0 && path !== ':memory:') {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        copyFileSync(path, `${path}.before-uses-fix.bak`)
      }
      this.db.exec('ALTER TABLE events ADD COLUMN uses INTEGER')
    }
    this.transaction(() => {
      this.db.exec("UPDATE events SET uses = quantity, quantity = 1 WHERE LOWER(item_name) LIKE '%powerup%' AND quantity > 1 AND uses IS NULL")
    })
  }

  /**
   * Adds items.archived_at (NULL = active, otherwise when it was archived). Adding an empty column leaves every
   * existing row as it was, so no backup copy is needed for this one.
   */
  private addArchivedColumn(): void {
    const cols = this.db.prepare('PRAGMA table_info(items)').all() as { name: string }[]
    if (!cols.some((c) => c.name === 'archived_at')) this.db.exec('ALTER TABLE items ADD COLUMN archived_at INTEGER')
  }

  // ---- settings -----------------------------------------------------------
  getSetting(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }
  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
  }

  // ---- scanning -----------------------------------------------------------
  knownFiles(character: string): Set<string> {
    const rows = this.db.prepare('SELECT file FROM scanned_files WHERE character=?').all(character) as { file: string }[]
    return new Set(rows.map((r) => r.file))
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  markScanned(character: string, file: string): void {
    this.db.prepare('INSERT OR IGNORE INTO scanned_files(character,file) VALUES(?,?)').run(character, file)
  }

  /**
   * Stores a parsed mail. For sales that match an inventory item (by name or
   * alias) the stock is reduced, but only for sales made AFTER the item was
   * added: your counts are entered by hand "as of now", so older sales must
   * not subtract from them. Returns what happened so the caller can alert.
   */
  insertEvent(character: string, p: ParsedMail): { inserted: boolean; lowItemId?: number } {
    const key = p.itemName ? itemKey(p.itemName) : null
    const itemId = key ? this.findItemId(key) : null
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO events(character,mail_id,ts,kind,vendor,item_name,item_key,quantity,uses,price,counterparty,city,planet,item_id)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(character, p.mailId, p.timestamp, p.kind, p.vendor ?? null, p.itemName ?? null, key, p.quantity ?? 1, p.uses ?? null, p.price ?? 0,
        p.counterparty ?? null, p.city ?? null, p.planet ?? null, itemId)
    if (res.changes === 0) return { inserted: false }
    if (p.kind === 'sale' && itemId !== null) {
      this.applySaleToStock(Number(res.lastInsertRowid), itemId, p.quantity ?? 1, p.timestamp)
      return { inserted: true, lowItemId: itemId }
    }
    return { inserted: true }
  }

  private applySaleToStock(eventId: number, itemId: number, qty: number, ts: number): void {
    const item = this.db.prepare('SELECT tracking_since FROM items WHERE id=?').get(itemId) as { tracking_since: number } | undefined
    if (!item || ts <= item.tracking_since) return
    const r = this.db.prepare('INSERT OR IGNORE INTO stock_moves(item_id,delta,reason,ts,event_id) VALUES(?,?,?,?,?)').run(itemId, -qty, 'sale', ts, eventId)
    if (r.changes) this.db.prepare('UPDATE items SET on_hand = MAX(0, on_hand - ?) WHERE id=?').run(qty, itemId)
  }

  private findItemId(key: string): number | null {
    const direct = this.db.prepare('SELECT id FROM items WHERE key=?').get(key) as { id: number } | undefined
    if (direct) return direct.id
    const alias = this.db.prepare('SELECT item_id FROM aliases WHERE alias_key=?').get(key) as { item_id: number } | undefined
    return alias?.item_id ?? null
  }

  // ---- inventory ----------------------------------------------------------
  listItems(): InventoryItem[] {
    const rows = this.db.prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE').all() as Record<string, unknown>[]
    return rows.map(toItem)
  }

  getItem(id: number): InventoryItem | null {
    const r = this.db.prepare('SELECT * FROM items WHERE id=?').get(id) as Record<string, unknown> | undefined
    return r ? toItem(r) : null
  }

  saveItem(i: { id?: number; name: string; onHand: number; costEach: number; lowThreshold: number | null; notes: string }): number {
    const key = itemKey(i.name)
    const now = Math.floor(Date.now() / 1000)
    if (i.id) {
      const before = this.getItem(i.id)
      this.db.prepare('UPDATE items SET name=?, key=?, on_hand=?, cost_each=?, low_threshold=?, notes=? WHERE id=?')
        .run(i.name.trim(), key, i.onHand, i.costEach, i.lowThreshold, i.notes, i.id)
      if (before && i.onHand > before.onHand) this.setArchived(i.id, false) // got stock back: selling it again
      return i.id
    }
    const r = this.db.prepare('INSERT INTO items(name,key,on_hand,cost_each,low_threshold,notes,tracking_since) VALUES(?,?,?,?,?,?,?)')
      .run(i.name.trim(), key, i.onHand, i.costEach, i.lowThreshold, i.notes, now)
    const id = Number(r.lastInsertRowid)
    // Link any past sales of this name so profit/cost reports include them.
    // They are older than tracking_since, so they do not touch the new stock count.
    this.db.prepare('UPDATE events SET item_id=? WHERE item_key=? AND item_id IS NULL').run(id, key)
    return id
  }

  deleteItem(id: number): void {
    this.db.prepare('UPDATE events SET item_id=NULL WHERE item_id=?').run(id)
    this.db.prepare('DELETE FROM items WHERE id=?').run(id)
  }

  /** Manual stock change (restock, correction, loss). Positive adds, negative removes. */
  adjustStock(id: number, delta: number, reason: string): void {
    this.db.prepare('UPDATE items SET on_hand = MAX(0, on_hand + ?) WHERE id=?').run(delta, id)
    this.db.prepare('INSERT INTO stock_moves(item_id,delta,reason,ts) VALUES(?,?,?,?)').run(id, delta, reason, Math.floor(Date.now() / 1000))
    if (delta > 0) this.setArchived(id, false) // restocking an archived item means it is being sold again
  }

  /**
   * Archive an item that will not be stocked again (for example a resource that despawned), or bring it back.
   * An archived item keeps its sales and links; it just stops counting for restock warnings and inventory value.
   */
  setArchived(id: number, archived: boolean): void {
    if (archived) this.db.prepare('UPDATE items SET archived_at = ? WHERE id=? AND archived_at IS NULL').run(Math.floor(Date.now() / 1000), id)
    else this.db.prepare('UPDATE items SET archived_at = NULL WHERE id=?').run(id)
  }

  /** Sale names that matched nothing in inventory and were not ignored, most frequent first. */
  unmatched(): { key: string; name: string; sales: number; units: number }[] {
    return this.db
      .prepare(`SELECT item_key AS key, MIN(item_name) AS name, COUNT(*) AS sales, SUM(quantity) AS units
                FROM events WHERE kind='sale' AND item_id IS NULL AND item_key IS NOT NULL
                  AND item_key NOT IN (SELECT item_key FROM ignored_names)
                GROUP BY item_key ORDER BY sales DESC LIMIT 300`)
      .all() as never
  }

  // ---- structures (harvesters and factories) ------------------------------
  listMachineTypes(): MachineType[] {
    const rows = this.db.prepare('SELECT * FROM machine_types ORDER BY name COLLATE NOCASE').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number, name: r.name as string, kind: r.kind as StructureKind, lots: r.lots as number,
      maintPerHour: num(r.maint_per_hour), powerPerHour: num(r.power_per_hour), storage: num(r.storage), efficiency: num(r.efficiency)
    }))
  }

  saveMachineType(t: MachineTypeInput): number {
    const vals = [t.name.trim(), t.kind, t.lots, t.maintPerHour, t.powerPerHour, t.storage, t.efficiency] as const
    if (t.id) {
      this.db.prepare('UPDATE machine_types SET name=?, kind=?, lots=?, maint_per_hour=?, power_per_hour=?, storage=?, efficiency=? WHERE id=?').run(...vals, t.id)
      return t.id
    }
    return Number(this.db.prepare('INSERT INTO machine_types(name,kind,lots,maint_per_hour,power_per_hour,storage,efficiency) VALUES(?,?,?,?,?,?,?)').run(...vals).lastInsertRowid)
  }

  /** Structures made from this type keep their own copied stats; they just lose the link to the type. */
  deleteMachineType(id: number): void {
    this.db.prepare('DELETE FROM machine_types WHERE id=?').run(id)
  }

  listStructures(): Structure[] {
    const rows = this.db
      .prepare(`SELECT s.*, t.name AS type_name,
                  (SELECT state FROM structure_states WHERE structure_id = s.id ORDER BY ts DESC, id DESC LIMIT 1) AS state,
                  (SELECT ts FROM structure_states WHERE structure_id = s.id ORDER BY ts DESC, id DESC LIMIT 1) AS state_since
                FROM structures s LEFT JOIN machine_types t ON t.id = s.type_id
                ORDER BY s.character COLLATE NOCASE, s.name COLLATE NOCASE`)
      .all() as Record<string, unknown>[]
    const lastReading = this.db.prepare('SELECT * FROM structure_readings WHERE structure_id=? ORDER BY ts DESC, id DESC LIMIT 1')
    return rows.map((r) => {
      const rd = lastReading.get(r.id as number) as Record<string, unknown> | undefined
      return {
        id: r.id as number, character: r.character as string, typeId: num(r.type_id), typeName: (r.type_name as string | null) ?? null,
        name: r.name as string, kind: r.kind as StructureKind, planet: r.planet as string, notes: r.notes as string, lots: r.lots as number,
        maintPerHour: num(r.maint_per_hour), powerPerHour: num(r.power_per_hour), storage: num(r.storage), efficiency: num(r.efficiency),
        state: ((r.state as StructureState | null) ?? 'packed'), stateSince: (r.state_since as number | null) ?? (r.created_ts as number),
        lastReading: rd
          ? { ts: rd.ts as number, surplusMaint: num(rd.surplus_maint), surplusPower: num(rd.surplus_power), extractionRate: num(rd.extraction_rate), hopperPct: num(rd.hopper_pct) }
          : null,
        resource: r.kind === 'harvester' ? this.currentResource(r.id as number) : null
      }
    })
  }

  /** Create or edit a structure. A new one starts in `s.state` (default Running). */
  saveStructure(s: StructureInput): number {
    const vals = [s.character.trim(), s.typeId, s.name.trim(), s.kind, s.planet.trim(), s.notes, s.lots, s.maintPerHour, s.powerPerHour, s.storage, s.efficiency] as const
    if (s.id) {
      this.db.prepare(`UPDATE structures SET character=?, type_id=?, name=?, kind=?, planet=?, notes=?, lots=?, maint_per_hour=?, power_per_hour=?,
                       storage=?, efficiency=? WHERE id=?`).run(...vals, s.id)
      return s.id
    }
    const now = Math.floor(Date.now() / 1000)
    return this.transaction(() => {
      const id = Number(this.db.prepare(`INSERT INTO structures(character,type_id,name,kind,planet,notes,lots,maint_per_hour,power_per_hour,storage,efficiency,created_ts)
                                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals, now).lastInsertRowid)
      this.db.prepare('INSERT INTO structure_states(structure_id,state,ts) VALUES(?,?,?)').run(id, s.state ?? 'running', now)
      return id
    })
  }

  deleteStructure(id: number): void {
    this.db.prepare('DELETE FROM structures WHERE id=?').run(id)
  }

  /** Record a state change with the time it happened. Saving the state it is already in does nothing. */
  setStructureState(id: number, state: StructureState, ts = Math.floor(Date.now() / 1000)): void {
    const cur = this.db.prepare('SELECT state FROM structure_states WHERE structure_id=? ORDER BY ts DESC, id DESC LIMIT 1').get(id) as { state: string } | undefined
    if (cur?.state === state) return
    this.db.prepare('INSERT INTO structure_states(structure_id,state,ts) VALUES(?,?,?)').run(id, state, ts)
  }

  /** State history, oldest first (used by the countdowns in a later step). */
  structureStates(id: number): { state: StructureState; ts: number }[] {
    return this.db.prepare('SELECT state, ts FROM structure_states WHERE structure_id=? ORDER BY ts, id').all(id) as never
  }

  /** Save one check-in. Every field is optional; a reading with nothing in it is not saved. */
  addReading(id: number, r: Omit<StructureReading, 'ts'>, ts = Math.floor(Date.now() / 1000)): void {
    if ([r.surplusMaint, r.surplusPower, r.extractionRate, r.hopperPct].every((v) => v == null)) return
    this.db.prepare('INSERT INTO structure_readings(structure_id,ts,surplus_maint,surplus_power,extraction_rate,hopper_pct) VALUES(?,?,?,?,?,?)')
      .run(id, ts, r.surplusMaint, r.surplusPower, r.extractionRate, r.hopperPct)
  }

  // ---- harvester resources and hoppers -------------------------------------
  /** The resource a harvester is extracting now, or null. */
  currentResource(structureId: number): HarvesterResource | null {
    const r = this.db.prepare('SELECT * FROM harvester_resources WHERE structure_id=? AND to_ts IS NULL ORDER BY from_ts DESC, id DESC LIMIT 1')
      .get(structureId) as Record<string, unknown> | undefined
    return r ? toResource(r) : null
  }

  /** Every resource period of a harvester, newest first. */
  resourceHistory(structureId: number): HarvesterResource[] {
    return (this.db.prepare('SELECT * FROM harvester_resources WHERE structure_id=? ORDER BY from_ts DESC, id DESC').all(structureId) as Record<string, unknown>[])
      .map(toResource)
  }

  /**
   * Switch a harvester to a resource: the open period is closed and a new one starts. Setting the resource it is
   * already on (same name) only updates the type and concentration.
   */
  setHarvesterResource(structureId: number, res: { name: string; type: string; concentration: number | null }, ts = Math.floor(Date.now() / 1000)): void {
    const name = res.name.trim()
    const cur = this.currentResource(structureId)
    this.transaction(() => {
      if (cur && cur.name.toLowerCase() === name.toLowerCase()) {
        this.db.prepare('UPDATE harvester_resources SET type=?, concentration=? WHERE id=?').run(res.type.trim(), res.concentration, cur.id)
        return
      }
      if (cur) this.db.prepare('UPDATE harvester_resources SET to_ts=? WHERE id=?').run(ts, cur.id)
      this.db.prepare('INSERT INTO harvester_resources(structure_id,name,type,concentration,from_ts) VALUES(?,?,?,?,?)')
        .run(structureId, name, res.type.trim(), res.concentration, ts)
    })
  }

  /**
   * Where a harvested resource goes in inventory. Matching uses the resource's own name (unique in game), because
   * the type part differs between the Operate panel and vendor sale mails:
   * 1. an inventory item whose name ends in `(Name)`;
   * 2. otherwise a new item named like the resource's past sale mails, so those sales match it;
   * 3. otherwise a new item named `Type (Name)`.
   */
  resourceTarget(res: { name: string; type: string }): { itemId: number | null; itemName: string } {
    const key = res.name.trim().toLowerCase()
    const item = this.listItems().find((i) => resourceKeyOf(i.name) === key)
    if (item) return { itemId: item.id, itemName: item.name }
    const sold = this.db.prepare("SELECT item_name FROM events WHERE kind='sale' AND item_key LIKE ? ORDER BY ts DESC LIMIT 1")
      .get(`% (${key})`) as { item_name: string } | undefined
    return { itemId: null, itemName: sold ? cleanItemName(sold.item_name) : resourceItemName(res.type, res.name) }
  }

  /**
   * Empty a harvester's hopper: `amount` units of its current resource go into inventory as a "harvest" stock
   * move (creating the item if needed; an archived item comes back, like any restock). Returns the item used.
   */
  emptyHopper(structureId: number, amount: number, ts = Math.floor(Date.now() / 1000)): { itemId: number; itemName: string; created: boolean } {
    const res = this.currentResource(structureId)
    if (!res) throw new Error('Set the resource this harvester is extracting first.')
    const units = Math.floor(amount)
    if (!(units > 0)) throw new Error('Enter how many units you collected.')
    return this.transaction(() => {
      const target = this.resourceTarget(res)
      const created = target.itemId == null
      const itemId = target.itemId ?? this.saveItem({ name: target.itemName, onHand: 0, costEach: 0, lowThreshold: null, notes: 'Harvested' })
      this.adjustStock(itemId, units, 'harvest')
      this.db.prepare('INSERT INTO hopper_empties(structure_id,ts,resource,amount,item_id) VALUES(?,?,?,?,?)').run(structureId, ts, res.name, units, itemId)
      return { itemId, itemName: target.itemName, created }
    })
  }

  /** Hopper empties of one harvester, newest first. */
  hopperLog(structureId: number): { ts: number; resource: string; amount: number }[] {
    return this.db.prepare('SELECT ts, resource, amount FROM hopper_empties WHERE structure_id=? ORDER BY ts DESC, id DESC').all(structureId) as never
  }

  /** Hide a sale name from "Sales not matched" (a name the player will never stock). */
  ignoreName(key: string): void {
    this.db.prepare('INSERT OR IGNORE INTO ignored_names(item_key, ts) VALUES(?, ?)').run(key, Math.floor(Date.now() / 1000))
  }

  unignoreName(key: string): void {
    this.db.prepare('DELETE FROM ignored_names WHERE item_key=?').run(key)
  }

  /** Ignored sale names with how often each sold, so they can be brought back. */
  ignoredNames(): { key: string; name: string; sales: number }[] {
    return this.db
      .prepare(`SELECT g.item_key AS key,
                       COALESCE((SELECT MIN(item_name) FROM events WHERE item_key = g.item_key), g.item_key) AS name,
                       (SELECT COUNT(*) FROM events WHERE item_key = g.item_key AND kind = 'sale') AS sales
                FROM ignored_names g ORDER BY name COLLATE NOCASE`)
      .all() as never
  }

  /** Remember that sales named `key` belong to `itemId` and re-link existing ones. */
  linkAlias(key: string, itemId: number): void {
    this.db.prepare('INSERT INTO aliases(alias_key,item_id) VALUES(?,?) ON CONFLICT(alias_key) DO UPDATE SET item_id=excluded.item_id').run(key, itemId)
    const rows = this.db.prepare("SELECT id,quantity,ts FROM events WHERE item_key=? AND kind='sale' AND item_id IS NULL").all(key) as { id: number; quantity: number; ts: number }[]
    this.db.prepare('UPDATE events SET item_id=? WHERE item_key=? AND item_id IS NULL').run(itemId, key)
    for (const e of rows) this.applySaleToStock(e.id, itemId, e.quantity, e.ts)
  }

  /**
   * Sale names linked to items by hand (aliases), with how often each sold and which item they point at.
   * Pass an item id for one item's links, or nothing for every link. An item's own name is never listed.
   */
  linkedNames(itemId?: number): { key: string; name: string; sales: number; itemId: number; itemName: string }[] {
    return this.db
      .prepare(`SELECT a.alias_key AS key,
                       COALESCE((SELECT MIN(item_name) FROM events WHERE item_key = a.alias_key), a.alias_key) AS name,
                       (SELECT COUNT(*) FROM events WHERE item_key = a.alias_key AND kind = 'sale') AS sales,
                       i.id AS itemId, i.name AS itemName
                FROM aliases a JOIN items i ON i.id = a.item_id
                WHERE ?1 IS NULL OR a.item_id = ?1
                ORDER BY i.name COLLATE NOCASE, name COLLATE NOCASE`)
      .all(itemId ?? null) as never
  }

  /**
   * Undo a link made by mistake: the exact reverse of linkAlias. Stock that the linked sales took off the item is
   * given back, those sales go back to "not matched", and the alias is forgotten so future sales stay unmatched.
   * Returns how many units were given back (0 when nothing had been taken).
   */
  unlinkAlias(key: string): number {
    const alias = this.db.prepare('SELECT item_id FROM aliases WHERE alias_key=?').get(key) as { item_id: number } | undefined
    if (!alias) return 0
    const itemId = alias.item_id
    return this.transaction(() => {
      const moves = this.db
        .prepare(`SELECT m.id, m.delta FROM stock_moves m JOIN events e ON e.id = m.event_id
                  WHERE e.item_key = ? AND m.item_id = ? AND m.reason = 'sale'`)
        .all(key, itemId) as { id: number; delta: number }[]
      const giveBack = moves.reduce((n, m) => n - m.delta, 0) // sale moves are negative
      if (giveBack > 0) this.db.prepare('UPDATE items SET on_hand = on_hand + ? WHERE id=?').run(giveBack, itemId)
      for (const m of moves) this.db.prepare('DELETE FROM stock_moves WHERE id=?').run(m.id)
      this.db.prepare('UPDATE events SET item_id=NULL WHERE item_key=? AND item_id=?').run(key, itemId)
      this.db.prepare('DELETE FROM aliases WHERE alias_key=?').run(key)
      return giveBack
    })
  }

  // ---- queries for the UI -------------------------------------------------
  listEvents(f: { kinds?: string[]; from?: number; to?: number; search?: string; character?: string; limit?: number }): SaleRow[] {
    const where: string[] = []
    const args: (string | number)[] = []
    if (f.character) { where.push('character = ?'); args.push(f.character) }
    if (f.kinds?.length) { where.push(`kind IN (${f.kinds.map(() => '?').join(',')})`); args.push(...f.kinds) }
    if (f.from) { where.push('ts >= ?'); args.push(f.from) }
    if (f.to) { where.push('ts <= ?'); args.push(f.to) }
    if (f.search) { where.push('(item_name LIKE ? OR vendor LIKE ? OR counterparty LIKE ?)'); const s = `%${f.search}%`; args.push(s, s, s) }
    const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ts DESC LIMIT ${Math.min(f.limit ?? 500, 5000)}`
    return (this.db.prepare(sql).all(...args) as Record<string, unknown>[]).map((r) => ({
      id: r.id as number, character: r.character as string, ts: r.ts as number, kind: r.kind as SaleRow['kind'],
      vendor: r.vendor as string | null, itemName: r.item_name as string | null, quantity: r.quantity as number,
      uses: r.uses as number | null, price: r.price as number, counterparty: r.counterparty as string | null, city: r.city as string | null,
      planet: r.planet as string | null, itemId: r.item_id as number | null
    }))
  }

  /** `character` limits every figure to one player character; omit it for all characters. */
  summary(from: number, to: number, character?: string) {
    const cf = character ? ' AND character = ?' : ''
    // Queries put {CF} right after their date range; it becomes the character filter (and its argument) when one is chosen.
    const q = (sql: string, ...a: (string | number)[]) =>
      this.db.prepare(sql.replace('{CF}', cf)).all(...a, ...(sql.includes('{CF}') && character ? [character] : [])) as Record<string, number | string>[]
    const totals = q(
      `SELECT COUNT(*) AS sales, COALESCE(SUM(price),0) AS revenue, COALESCE(SUM(quantity),0) AS units
       FROM events WHERE kind='sale' AND ts BETWEEN ? AND ?{CF}`, from, to)[0]
    const spent = q("SELECT COALESCE(SUM(price),0) AS spent FROM events WHERE kind='purchase' AND ts BETWEEN ? AND ?{CF}", from, to)[0]
    const byDay = q(
      `SELECT date(ts,'unixepoch','localtime') AS day, SUM(price) AS revenue, COUNT(*) AS sales
       FROM events WHERE kind='sale' AND ts BETWEEN ? AND ?{CF} GROUP BY day ORDER BY day`, from, to)
    const topItems = q(
      `SELECT item_name AS name, COUNT(*) AS sales, SUM(quantity) AS units, SUM(price) AS revenue
       FROM events WHERE kind='sale' AND ts BETWEEN ? AND ?{CF} GROUP BY item_key ORDER BY revenue DESC LIMIT 15`, from, to)
    const byVendor = q(
      `SELECT vendor AS name, COUNT(*) AS sales, SUM(price) AS revenue
       FROM events WHERE kind='sale' AND ts BETWEEN ? AND ?{CF} GROUP BY vendor ORDER BY revenue DESC`, from, to)
    const byCharacter = q(
      `SELECT character AS name, COUNT(*) AS sales, SUM(price) AS revenue
       FROM events WHERE kind='sale' AND ts BETWEEN ? AND ? GROUP BY character ORDER BY revenue DESC`, from, to)
    return { totals, spent, byDay, topItems, byVendor, byCharacter }
  }

  /** Buyers who bought from your vendors in the range, biggest spender first. `character` limits it to one player character. */
  customerList(from: number, to: number, character?: string): CustomerRow[] {
    const rows = this.db
      .prepare(
        `SELECT counterparty AS buyer, item_name AS itemName, quantity, price, ts FROM events
         WHERE kind='sale' AND counterparty IS NOT NULL AND ts BETWEEN ? AND ?${character ? ' AND character = ?' : ''}`
      )
      .all(from, to, ...(character ? [character] : [])) as unknown as SaleLine[]
    return summarizeCustomers(rows)
  }

  // ---- price history ------------------------------------------------------
  /**
   * One row per item that sold in the range, using per-unit prices (see shared/priceStats.ts).
   * Most-sold items first. `character` limits it to one player character.
   */
  priceList(from: number, to: number, character?: string): PriceRow[] {
    const rows = this.db
      .prepare(
        `SELECT item_key AS key, item_name AS name, ts, price, quantity FROM events
         WHERE kind='sale' AND item_key IS NOT NULL AND ts BETWEEN ? AND ?${character ? ' AND character = ?' : ''}
         ORDER BY ts`
      )
      .all(from, to, ...(character ? [character] : [])) as { key: string; name: string; ts: number; price: number; quantity: number }[]

    const groups = new Map<string, { name: string; points: { ts: number; price: number; quantity: number }[] }>()
    for (const r of rows) {
      const g = groups.get(r.key)
      if (g) { g.points.push(r); g.name = r.name } // rows are oldest first, so the name ends up as the newest spelling
      else groups.set(r.key, { name: r.name, points: [r] })
    }
    return [...groups.entries()]
      .map(([key, g]) => toPriceRow(key, g.name, g.points))
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))
  }

  /** Every sale of one item (oldest first) plus its summary row, for the detail chart and table. */
  priceSeries(key: string, from: number, to: number, character?: string): PriceSeries {
    const rows = this.db
      .prepare(
        `SELECT item_name AS name, ts, price, quantity, vendor, counterparty AS buyer, character FROM events
         WHERE kind='sale' AND item_key = ? AND ts BETWEEN ? AND ?${character ? ' AND character = ?' : ''}
         ORDER BY ts LIMIT 5000`
      )
      .all(key, from, to, ...(character ? [character] : [])) as { name: string; ts: number; price: number; quantity: number; vendor: string | null; buyer: string | null; character: string }[]
    if (!rows.length) return { row: null, points: [] }
    const points: PricePointRow[] = rows.map((r) => ({ ts: r.ts, price: r.price, quantity: r.quantity, unitPrice: unitPrice(r), vendor: r.vendor, buyer: r.buyer, character: r.character }))
    return { row: toPriceRow(key, rows[rows.length - 1]!.name, rows), points }
  }

  vendorAlerts() {
    return this.db
      .prepare(`SELECT id,character,ts,kind,vendor FROM events WHERE kind IN ('vendor_empty','vendor_maint') ORDER BY ts DESC LIMIT 20`)
      .all()
  }
}

function toPriceRow(key: string, name: string, points: { ts: number; price: number; quantity: number }[]): PriceRow {
  const s = summarize(points)
  return {
    key, name: cleanItemName(name), sales: s.sales, units: s.units, low: s.low!, average: s.average!, high: s.high!,
    lastTs: s.last!.ts, lastUnitPrice: s.last!.unitPrice, recentMedian: s.recentMedian!, previousMedian: s.previousMedian,
    trend: classifyTrend(s.recentMedian, s.previousMedian), crateSizes: s.crateSizes
  }
}

function toItem(r: Record<string, unknown>): InventoryItem {
  return {
    id: r.id as number, name: r.name as string, key: r.key as string, onHand: r.on_hand as number,
    costEach: r.cost_each as number, lowThreshold: (r.low_threshold as number | null) ?? null, notes: r.notes as string,
    archived: r.archived_at != null
  }
}

function toResource(r: Record<string, unknown>): HarvesterResource {
  return {
    id: r.id as number, name: r.name as string, type: r.type as string, concentration: num(r.concentration),
    fromTs: r.from_ts as number, toTs: num(r.to_ts)
  }
}

/** SQLite gives NULL for empty number columns; keep that as null, everything else as a number. */
function num(v: unknown): number | null {
  return v == null ? null : Number(v)
}
