import { describe, expect, it } from 'vitest'
import { attention, drains, forecast, formatHours, hoursWhere, lotsAfter, needsAttention, lotsByCharacter, MAX_LOTS, parseOperateResource, resourceItemName, resourceKeyOf, upkeepPerDay } from '../src/shared/structures'

describe('drains', () => {
  it('follows what the owner confirmed in game', () => {
    expect(drains('harvester', 'running')).toEqual({ maintenance: true, power: true })
    expect(drains('harvester', 'idle')).toEqual({ maintenance: true, power: false }) // turned off: no power
    expect(drains('factory', 'idle')).toEqual({ maintenance: true, power: true }) // factories always use power
    expect(drains('factory', 'packed')).toEqual({ maintenance: false, power: false })
    expect(drains('harvester', 'packed')).toEqual({ maintenance: false, power: false })
  })
})

describe('lots', () => {
  const list = [
    { id: 1, character: 'Testa', lots: 3, state: 'running' as const },
    { id: 2, character: 'Testa', lots: 3, state: 'idle' as const },
    { id: 3, character: 'Testa', lots: 1, state: 'packed' as const }, // a deed takes no lots
    { id: 4, character: 'Testb', lots: 1, state: 'running' as const }
  ]

  it('adds up placed structures per character', () => {
    expect(lotsByCharacter(list)).toEqual(new Map([['Testa', 6], ['Testb', 1]]))
    expect(MAX_LOTS).toBe(10)
  })

  it('works out the total a save would give', () => {
    expect(lotsAfter(list, { character: 'Testa', lots: 3, state: 'running' })).toBe(9) // new elite harvester
    expect(lotsAfter(list, { character: 'Testa', lots: 1, state: 'running' }, 3)).toBe(7) // placing the packed factory
    expect(lotsAfter(list, { character: 'Testa', lots: 3, state: 'packed' }, 1)).toBe(3) // packing one up frees 3
    expect(lotsAfter(list, { character: 'Testb', lots: 3, state: 'running' }, 1)).toBe(4) // moved to another character
  })
})

describe('resource names', () => {
  it('reads the Operate panel line', () => {
    expect(parseOperateResource('Fakeorite, a type of Crism Siliclastic Ore')).toEqual({ name: 'Fakeorite', type: 'Crism Siliclastic Ore' })
    expect(parseOperateResource('  Fakeorite ,  A TYPE OF  Ore ')).toEqual({ name: 'Fakeorite', type: 'Ore' })
    expect(parseOperateResource('Steel (Fakeium)')).toBeNull()
  })

  it('matches on the resource name, whatever the type part says', () => {
    expect(resourceKeyOf('Crism Siliclastic Ore (Fakeorite)')).toBe('fakeorite')
    expect(resourceKeyOf('Ore (Fakeorite)')).toBe('fakeorite') // vendor mail form
    expect(resourceKeyOf('\\#FFCC00Steel (Fakeium)\\#.')).toBe('fakeium') // the game's color codes
    expect(resourceKeyOf('Armor Powerup - Pistol Damage (7)')).toBeNull() // digits: not a resource
    expect(resourceKeyOf('Rifle Scope')).toBeNull()
  })

  it('builds the inventory name', () => {
    expect(resourceItemName(' Crism Siliclastic Ore ', 'Fakeorite')).toBe('Crism Siliclastic Ore (Fakeorite)')
  })
})

describe('countdowns', () => {
  const T = 2_000_000_000
  const H = 3600
  const harvester = {
    kind: 'harvester' as const, maintPerHour: 84, powerPerHour: 165, storage: 431046,
    history: [{ state: 'running' as const, ts: T - 100 * H }],
    latest: { maint: { value: 63367, ts: T }, power: { value: 110847, ts: T }, rate: null, hopper: null }
  }

  it("matches the game's own countdowns right after a reading", () => {
    const f = forecast(harvester, T)
    expect(formatHours(f.maintenance.hoursLeft!)).toBe('31 d 10 h') // Structure Status said 31 days, 10 h
    expect(formatHours(f.power.hoursLeft!)).toBe('27 d 23 h') // and 27 days, 23 h
    expect(f.hopper).toEqual({ hoursLeft: null, left: null, paused: false }) // no rate or hopper reading yet
  })

  it('only counts hours in a state that uses each pool', () => {
    // running 10 h, idle (off) 20 h, packed up since
    const history = [{ state: 'running' as const, ts: T }, { state: 'idle' as const, ts: T + 10 * H }, { state: 'packed' as const, ts: T + 30 * H }]
    const f = forecast({ ...harvester, history }, T + 100 * H)
    expect(f.maintenance.left).toBe(63367 - 84 * 30) // running + idle
    expect(f.power.left).toBe(110847 - 165 * 10) // running only: an idle harvester uses no power
    expect(f.maintenance.paused).toBe(true) // a deed uses nothing
    const factory = forecast({ ...harvester, kind: 'factory', history: history.slice(0, 2) }, T + 30 * H)
    expect(factory.power.left).toBe(110847 - 165 * 30) // an idle factory still uses power
    expect(factory.hopper).toBeNull()
  })

  it('fills the hopper only while running', () => {
    const history = [{ state: 'running' as const, ts: T }, { state: 'idle' as const, ts: T + 10 * H }]
    const latest = { ...harvester.latest, rate: { value: 25, ts: T }, hopper: { value: 50, ts: T } }
    const f = forecast({ ...harvester, history, latest }, T + 40 * H)
    expect(f.hopper!.left).toBe(431046 * 0.5 - 25 * 10)
    expect(f.hopper!.paused).toBe(true)
    expect(f.maintenance.left).toBe(63367 - 84 * 40)
  })

  it('never goes below empty, and rates the urgency', () => {
    const f = forecast(harvester, T + 2000 * H)
    expect(f.maintenance).toMatchObject({ left: 0, hoursLeft: 0 })
    expect(formatHours(0)).toBe('empty now')
    expect(attention(47)).toBe('urgent')
    expect(attention(100)).toBe('soon')
    expect(attention(24 * 8)).toBeNull()
    expect(attention(null)).toBeNull()
  })

  it('adds up upkeep for placed structures only', () => {
    expect(upkeepPerDay([{ maintPerHour: 84, state: 'running' }, { maintPerHour: 20, state: 'idle' }, { maintPerHour: 84, state: 'packed' }])).toBe((84 + 20) * 24)
  })

  it('splits hours across state changes', () => {
    const history = [{ state: 'running' as const, ts: 0 }, { state: 'idle' as const, ts: 10 * H }, { state: 'running' as const, ts: 20 * H }]
    expect(hoursWhere(history, 5 * H, 25 * H, (s) => s === 'running')).toBe(10)
    expect(hoursWhere(history, 25 * H, 5 * H, () => true)).toBe(0)
  })
})

describe('needsAttention', () => {
  const T = 2_000_000_000
  const H = 3600
  const base = {
    kind: 'harvester' as const, maintPerHour: 100, powerPerHour: 100, storage: 1000, character: 'Testa',
    history: [{ state: 'running' as const, ts: T }],
    latest: { maint: { value: 100 * 24 * 30, ts: T }, power: { value: 100 * 24 * 30, ts: T }, rate: null, hopper: null }
  }
  it('lists what is due within a week, soonest first, skipping paused clocks', () => {
    const list = [
      { ...base, id: 1, name: 'Fine', latest: base.latest },
      { ...base, id: 2, name: 'Low power', latest: { ...base.latest, power: { value: 100 * 30, ts: T } } }, // 30 h
      { ...base, id: 3, name: 'Low maint', latest: { ...base.latest, maint: { value: 100 * 24 * 5, ts: T } } }, // 5 days
      { ...base, id: 4, name: 'Packed', history: [{ state: 'packed' as const, ts: T }], latest: { ...base.latest, maint: { value: 1, ts: T } } }
    ]
    expect(needsAttention(list, T).map((a) => [a.name, a.what, a.level])).toEqual([
      ['Low power', 'power', 'urgent'],
      ['Low maint', 'maintenance', 'soon']
    ])
  })
})
