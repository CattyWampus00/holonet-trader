import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/db'
import type { ParsedMail } from '../src/shared/types'

const sale = (id: string, ts: number, item: string, qty: number, price: number): ParsedMail => ({
  mailId: id, timestamp: ts, kind: 'sale', vendor: 'Shop', itemName: item, quantity: qty, price, counterparty: 'Bob'
})
const future = () => Math.floor(Date.now() / 1000) + 3600

describe('Store', () => {
  it('ignores duplicate mails', () => {
    const s = new Store(':memory:')
    expect(s.insertEvent('A', sale('1', 10, 'Thing', 1, 100)).inserted).toBe(true)
    expect(s.insertEvent('A', sale('1', 10, 'Thing', 1, 100)).inserted).toBe(false)
    expect(s.insertEvent('B', sale('1', 10, 'Thing', 1, 100)).inserted).toBe(true) // same id, other character
  })

  it('reduces stock only for sales after the item was added', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 10, 'Crate Thing', 25, 2500)) // old sale, before the item exists
    const id = s.saveItem({ name: 'crate thing', onHand: 100, costEach: 50, lowThreshold: null, notes: '' })
    expect(s.getItem(id)!.onHand).toBe(100) // history did not touch the manual count
    s.insertEvent('A', sale('2', future(), 'Crate Thing', 25, 2500)) // new sale
    expect(s.getItem(id)!.onHand).toBe(75)
    s.insertEvent('A', sale('2', future(), 'Crate Thing', 25, 2500)) // duplicate
    expect(s.getItem(id)!.onHand).toBe(75)
  })

  it('never goes below zero and remembers aliases', () => {
    const s = new Store(':memory:')
    const id = s.saveItem({ name: 'Armor Attachment', onHand: 1, costEach: 0, lowThreshold: 2, notes: '' })
    s.insertEvent('A', sale('1', future(), 'Constitution Armor Attachment', 1, 700000))
    expect(s.unmatched()).toHaveLength(1)
    s.linkAlias('constitution armor attachment', id)
    expect(s.getItem(id)!.onHand).toBe(0)
    expect(s.unmatched()).toHaveLength(0)
    s.insertEvent('A', sale('2', future(), 'Constitution Armor Attachment', 3, 1))
    expect(s.getItem(id)!.onHand).toBe(0)
  })

  it('undoes a wrong link: stock comes back and the sales are unmatched again', () => {
    const s = new Store(':memory:')
    const id = s.saveItem({ name: 'Rifle Scope', onHand: 10, costEach: 0, lowThreshold: null, notes: '' })
    const other = s.saveItem({ name: 'Pistol Grip', onHand: 5, costEach: 0, lowThreshold: null, notes: '' })
    s.insertEvent('A', sale('1', future(), 'Pistol Barrel', 2, 100))
    s.linkAlias('pistol barrel', id) // the mis-click
    s.insertEvent('A', sale('2', future(), 'Pistol Barrel', 3, 100)) // later sale follows the wrong link
    expect(s.getItem(id)!.onHand).toBe(5)
    const link = { key: 'pistol barrel', name: 'Pistol Barrel', sales: 2, itemId: id, itemName: 'Rifle Scope' }
    expect(s.linkedNames(id)).toEqual([link])
    expect(s.linkedNames(other)).toEqual([])
    expect(s.linkedNames()).toEqual([link]) // every link, for the overview list

    expect(s.unlinkAlias('pistol barrel')).toBe(5)
    expect(s.getItem(id)!.onHand).toBe(10)
    expect(s.linkedNames(id)).toEqual([])
    expect(s.unmatched()).toMatchObject([{ key: 'pistol barrel', sales: 2, units: 5 }])
    expect(s.unlinkAlias('pistol barrel')).toBe(0) // second undo does nothing

    s.linkAlias('pistol barrel', other) // the right link works afterwards
    expect(s.getItem(other)!.onHand).toBe(0)
    expect(s.getItem(id)!.onHand).toBe(10)
  })

  it('archives a retired item: sales stay matched, restock brings it back', () => {
    const s = new Store(':memory:')
    const id = s.saveItem({ name: 'Ore (Fakeium)', onHand: 3, costEach: 10, lowThreshold: null, notes: '' })
    s.insertEvent('A', sale('1', future(), 'Ore (Fakeium)', 3, 30))
    expect(s.getItem(id)).toMatchObject({ onHand: 0, archived: false })

    s.setArchived(id, true)
    expect(s.getItem(id)!.archived).toBe(true)
    expect(s.unmatched()).toEqual([]) // its sales did not fall back to unmatched
    s.setArchived(id, true) // archiving twice is harmless
    expect(s.getItem(id)!.archived).toBe(true)

    s.adjustStock(id, -1, 'correction') // a removal keeps it archived
    expect(s.getItem(id)!.archived).toBe(true)
    s.adjustStock(id, 50, 'bought from another player')
    expect(s.getItem(id)).toMatchObject({ onHand: 50, archived: false })

    s.setArchived(id, true)
    s.saveItem({ id, name: 'Ore (Fakeium)', onHand: 0, costEach: 12, lowThreshold: null, notes: '' }) // edit without stock
    expect(s.getItem(id)!.archived).toBe(true)
    s.saveItem({ id, name: 'Ore (Fakeium)', onHand: 5, costEach: 12, lowThreshold: null, notes: '' }) // edit adds stock
    expect(s.getItem(id)!.archived).toBe(false)
    s.setArchived(id, true)
    s.setArchived(id, false) // Restore button
    expect(s.getItem(id)!.archived).toBe(false)
  })

  it('ignores and un-ignores unmatched sale names', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 10, 'Odd Thing', 1, 5))
    s.insertEvent('A', sale('2', 11, 'Odd Thing', 2, 5))
    s.insertEvent('A', sale('3', 12, 'Other Thing', 1, 5))
    s.ignoreName('odd thing')
    expect(s.unmatched().map((u) => u.key)).toEqual(['other thing'])
    expect(s.ignoredNames()).toEqual([{ key: 'odd thing', name: 'Odd Thing', sales: 2 }])
    s.ignoreName('odd thing') // twice is harmless
    s.unignoreName('odd thing')
    expect(s.unmatched().map((u) => u.key).sort()).toEqual(['odd thing', 'other thing'])
    expect(s.ignoredNames()).toEqual([])
  })

  it('summarises revenue', () => {
    const s = new Store(':memory:')
    s.insertEvent('A', sale('1', 1000, 'X', 2, 500))
    s.insertEvent('A', sale('2', 2000, 'Y', 1, 700))
    expect(s.summary(0, 5000).totals).toMatchObject({ sales: 2, revenue: 1200, units: 3 })
  })
})

describe('Store character filter', () => {
  const mk = () => {
    const s = new Store(':memory:')
    s.insertEvent('Alpha', sale('1', 1000, 'X', 1, 100))
    s.insertEvent('Alpha', sale('2', 1100, 'Y', 1, 200))
    s.insertEvent('Beta', sale('1', 1200, 'Z', 1, 400))
    return s
  }
  it('limits the summary to one character', () => {
    const s = mk()
    expect(s.summary(0, 5000).totals).toMatchObject({ sales: 3, revenue: 700 })
    expect(s.summary(0, 5000, 'Alpha').totals).toMatchObject({ sales: 2, revenue: 300 })
    expect(s.summary(0, 5000, 'Beta').byDay).toHaveLength(1)
    expect(s.summary(0, 5000, 'Nobody').totals).toMatchObject({ sales: 0, revenue: 0 })
  })
  it('keeps the by-character comparison complete even when filtered', () => {
    expect(mk().summary(0, 5000, 'Alpha').byCharacter).toHaveLength(2)
  })
  it('limits the sales list to one character', () => {
    const rows = mk().listEvents({ character: 'Beta' })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.character).toBe('Beta')
  })
})

describe('Store structures', () => {
  const elite = { name: 'My Elite Ore Harvester', kind: 'harvester' as const, lots: 3, maintPerHour: 84, powerPerHour: 165, storage: 431046, efficiency: null }
  const fromType = (typeId: number, over: Partial<Parameters<Store['saveStructure']>[0]> = {}) => ({
    character: 'Testa', typeId, name: 'Ore field 1', kind: 'harvester' as const, planet: 'Talus', notes: '',
    lots: 3, maintPerHour: 84, powerPerHour: 165, storage: 431046, efficiency: null, ...over
  })

  it('saves machine types and structures that keep their own copy of the stats', () => {
    const s = new Store(':memory:')
    const t = s.saveMachineType(elite)
    expect(s.listMachineTypes()).toEqual([{ id: t, ...elite }])
    const id = s.saveStructure(fromType(t, { storage: 430831 })) // this deed's storage differs a little
    s.saveMachineType({ id: t, ...elite, maintPerHour: 90 }) // editing the type later...
    const [st] = s.listStructures()
    expect(st).toMatchObject({ id, typeName: 'My Elite Ore Harvester', maintPerHour: 84, storage: 430831, state: 'running', lastReading: null })
    s.deleteMachineType(t) // ...or deleting it does not touch the structure's numbers
    expect(s.listStructures()[0]).toMatchObject({ typeId: null, typeName: null, maintPerHour: 84 })
  })

  it('keeps a state history and only records real changes', () => {
    const s = new Store(':memory:')
    const id = s.saveStructure(fromType(s.saveMachineType(elite)))
    s.setStructureState(id, 'idle', 2_000_000_000)
    s.setStructureState(id, 'idle', 2_000_000_100) // same state: ignored
    s.setStructureState(id, 'packed', 2_000_000_200)
    expect(s.structureStates(id).map((x) => x.state)).toEqual(['running', 'idle', 'packed'])
    expect(s.listStructures()[0]).toMatchObject({ state: 'packed', stateSince: 2_000_000_200 })
  })

  it('keeps a resource history per harvester', () => {
    const s = new Store(':memory:')
    const id = s.saveStructure(fromType(s.saveMachineType(elite)))
    s.setHarvesterResource(id, { name: 'Fakeorite', type: 'Crism Siliclastic Ore', concentration: 44 }, 2_000_000_000)
    s.setHarvesterResource(id, { name: 'fakeorite', type: 'Crism Siliclastic Ore', concentration: 45 }, 2_000_000_050) // same one: update only
    s.setHarvesterResource(id, { name: 'Testium', type: 'Iron', concentration: 70 }, 2_000_000_100)
    expect(s.resourceHistory(id).map((r) => [r.name, r.concentration, r.toTs])).toEqual([['Testium', 70, null], ['Fakeorite', 45, 2_000_000_100]])
    expect(s.listStructures()[0]!.resource).toMatchObject({ name: 'Testium', type: 'Iron' })
  })

  it('empties a hopper into inventory, matching resources by their own name', () => {
    const s = new Store(':memory:')
    const id = s.saveStructure(fromType(s.saveMachineType(elite)))
    expect(() => s.emptyHopper(id, 100)).toThrow(/resource/) // no resource set yet

    // 1. No item and no sales yet: a new item named Type (Name).
    s.setHarvesterResource(id, { name: 'Fakeorite', type: 'Crism Siliclastic Ore', concentration: 44 })
    const first = s.emptyHopper(id, 1000)
    expect(first).toMatchObject({ itemName: 'Crism Siliclastic Ore (Fakeorite)', created: true })
    expect(s.emptyHopper(id, 500)).toMatchObject({ itemId: first.itemId, created: false })
    expect(s.getItem(first.itemId)!.onHand).toBe(1500)

    // 2. Sold before under the vendor's broader name: the new item takes that name, so those sales match it.
    s.insertEvent('A', sale('1', 10, 'Ore (Testium)', 5000, 5000))
    s.setHarvesterResource(id, { name: 'Testium', type: 'Crism Siliclastic Ore', concentration: 60 })
    const second = s.emptyHopper(id, 2000)
    expect(second).toMatchObject({ itemName: 'Ore (Testium)', created: true })
    expect(s.unmatched()).toEqual([])

    // 3. An archived item for that resource comes back when harvested again.
    s.setArchived(first.itemId, true)
    s.setHarvesterResource(id, { name: 'Fakeorite', type: 'Crism Siliclastic Ore', concentration: 44 })
    expect(s.emptyHopper(id, 10)).toMatchObject({ itemId: first.itemId, created: false })
    expect(s.getItem(first.itemId)).toMatchObject({ onHand: 1510, archived: false })
    expect(s.hopperLog(id).map((h) => [h.resource, h.amount])).toEqual([['Fakeorite', 10], ['Testium', 2000], ['Fakeorite', 500], ['Fakeorite', 1000]])
  })

  it('stores readings and returns the latest one', () => {
    const s = new Store(':memory:')
    const id = s.saveStructure(fromType(s.saveMachineType(elite)))
    s.addReading(id, { surplusMaint: 63367, surplusPower: 110847, extractionRate: null, hopperPct: 0 }, 2_000_000_000)
    s.addReading(id, { surplusMaint: null, surplusPower: null, extractionRate: null, hopperPct: null }, 2_000_000_500) // empty: skipped
    s.addReading(id, { surplusMaint: 60000, surplusPower: null, extractionRate: 25, hopperPct: 12 }, 2_000_000_300)
    expect(s.listStructures()[0]!.lastReading).toEqual({ ts: 2_000_000_300, surplusMaint: 60000, surplusPower: null, extractionRate: 25, hopperPct: 12 })
    // The countdowns use the newest value of each number, even when the newest reading left it empty.
    expect(s.listStructures()[0]!.latest).toEqual({
      maint: { value: 60000, ts: 2_000_000_300 }, power: { value: 110847, ts: 2_000_000_000 },
      rate: { value: 25, ts: 2_000_000_300 }, hopper: { value: 12, ts: 2_000_000_300 }
    })
    s.setHarvesterResource(id, { name: 'Fakeorite', type: 'Ore', concentration: null })
    s.emptyHopper(id, 100, 2_000_000_400) // emptying counts as a hopper reading of 0%
    expect(s.listStructures()[0]!.latest.hopper).toEqual({ value: 0, ts: 2_000_000_400 })
    s.deleteStructure(id)
    expect(s.listStructures()).toEqual([])
  })
})

describe('Structure mails (Step 5)', () => {
  const base = { typeId: null, planet: 'Naboo', notes: '', storage: null, efficiency: null }
  const later = () => Math.floor(Date.now() / 1000) + 60
  const factory = (s: Store) => s.saveStructure({ ...base, character: 'Testchar', name: 'Test Weapon Factory', kind: 'factory', lots: 1, maintPerHour: 20, powerPerHour: 50, state: 'running' })

  it('sets a running factory to Idle when its "finished" mail arrives', () => {
    const s = new Store(':memory:')
    const id = factory(s)
    const ts = later()
    s.insertEvent('Testchar', { mailId: 'f1', timestamp: ts, kind: 'factory_done', structure: 'Test Weapon Factory' })
    const f = s.listStructures().find((x) => x.id === id)!
    expect(f.state).toBe('idle')
    expect(f.stateSince).toBe(ts)
    expect(s.structureMails()[0]).toMatchObject({ kind: 'factory_done', structureId: id })
  })

  it('records a 0 maintenance reading for an empty-pool mail', () => {
    const s = new Store(':memory:')
    const id = factory(s)
    s.insertEvent('Testchar', { mailId: 'm1', timestamp: later(), kind: 'structure_maint', structure: 'Test Weapon Factory', planet: 'naboo' })
    expect(s.listStructures().find((x) => x.id === id)!.latest.maint?.value).toBe(0)
  })

  it('changes nothing for mails older than the structure, or with no match', () => {
    const s = new Store(':memory:')
    const id = factory(s)
    s.insertEvent('Testchar', { mailId: 'old', timestamp: 1000, kind: 'factory_done', structure: 'Test Weapon Factory' })
    s.insertEvent('Testchar', { mailId: 'x', timestamp: later(), kind: 'factory_done', structure: 'Some Other Factory' })
    expect(s.listStructures().find((x) => x.id === id)!.state).toBe('running')
    expect(s.structureMails().map((m) => m.structureId)).toEqual([null]) // the 1000 one is older than 14 days
  })

  it('keeps construction mails with the lots left', () => {
    const s = new Store(':memory:')
    s.insertEvent('Testchar', { mailId: 'c1', timestamp: later(), kind: 'construction', structure: 'Elite Mineral Harvester', lotsLeft: 4 })
    expect(s.structureMails()).toMatchObject([{ kind: 'construction', name: 'Elite Mineral Harvester', lotsLeft: 4, structureId: null }])
  })
})

describe('Clearing structure notices (Step 6)', () => {
  const base = { typeId: null, planet: 'Talus', notes: '', storage: null, efficiency: null }
  const later = () => Math.floor(Date.now() / 1000) + 60
  const add = (s: Store, name: string) => s.saveStructure({ ...base, character: 'Testchar', name, kind: 'factory', lots: 1, maintPerHour: 20, powerPerHour: 50, state: 'running' })
  const maintMail = (id: string, name: string, ts: number): ParsedMail => ({ mailId: id, timestamp: ts, kind: 'structure_maint', structure: name, planet: 'talus' })

  it('dismisses a mail by hand', () => {
    const s = new Store(':memory:')
    s.insertEvent('Testchar', maintMail('m1', 'Equipment Factory', later()))
    const [m] = s.structureMails()
    expect(m!.dismissed).toBe(false)
    s.dismissMail(m!.id)
    expect(s.structureMails()[0]!.dismissed).toBe(true)
  })

  it('a maintenance reading above 0 dismisses earlier empty-pool mails for that structure', () => {
    const s = new Store(':memory:')
    const id = add(s, 'Equipment Factory')
    const ts = later()
    s.insertEvent('Testchar', maintMail('m1', 'Equipment Factory', ts))
    expect(s.structureMails()[0]!.dismissed).toBe(false)
    s.addReading(id, { surplusMaint: 5000, surplusPower: null, extractionRate: null, hopperPct: null }, ts + 10)
    expect(s.structureMails()[0]!.dismissed).toBe(true)
  })

  it('linking an unmatched mail applies it and saves the name for later mails', () => {
    const s = new Store(':memory:')
    const id = add(s, 'Gear Maker')
    s.insertEvent('Testchar', maintMail('m1', 'Equipment Factory', later()))
    const [m] = s.structureMails()
    expect(m!.structureId).toBeNull()
    s.linkMail(m!.id, id)
    const g = s.listStructures()[0]!
    expect(g.otherNames).toEqual(['Equipment Factory'])
    expect(g.latest.maint?.value).toBe(0)
    s.insertEvent('Testchar', { mailId: 'f1', timestamp: later() + 5, kind: 'factory_done', structure: 'Equipment Factory' })
    expect(s.listStructures()[0]!.state).toBe('idle') // matched by the saved name
    s.removeStructureName(id, 'Equipment Factory')
    expect(s.listStructures()[0]!.otherNames).toEqual([])
  })

  it('linking a mail older than the structure changes nothing and dismisses it', () => {
    const s = new Store(':memory:')
    s.insertEvent('Testchar', maintMail('old', 'Equipment Factory', Math.floor(Date.now() / 1000) - 86400))
    const id = add(s, 'Gear Maker')
    s.linkMail(s.structureMails()[0]!.id, id)
    expect(s.listStructures()[0]!.latest.maint).toBeNull()
    expect(s.structureMails()[0]).toMatchObject({ structureId: id, dismissed: true })
  })
})
