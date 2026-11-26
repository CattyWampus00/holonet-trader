import { describe, expect, it } from 'vitest'
import { drains, lotsAfter, lotsByCharacter, MAX_LOTS } from '../src/shared/structures'

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
