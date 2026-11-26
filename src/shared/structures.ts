/**
 * Rules for harvesters and factories (see docs/STRUCTURES_PLAN.md). Pure functions, no database.
 * Numbers always come from the game's own windows (after modifiers); nothing here models modifiers.
 */

export type StructureKind = 'harvester' | 'factory'
export type StructureState = 'running' | 'idle' | 'packed'

/** Lots each character may use in game. */
export const MAX_LOTS = 10

export const STATE_LABEL: Record<StructureState, string> = { running: 'Running', idle: 'Idle', packed: 'Packed up' }
export const KIND_LABEL: Record<StructureKind, string> = { harvester: 'Harvester', factory: 'Factory' }

/**
 * What a structure uses up in a given state. Confirmed in game by the owner (2026-11-26):
 * - a turned-off harvester uses maintenance but no power
 * - a factory uses power whenever it is placed, making items or not
 * - a packed-up structure (a deed) uses nothing and keeps its leftover surplus
 */
export function drains(kind: StructureKind, state: StructureState): { maintenance: boolean; power: boolean } {
  if (state === 'packed') return { maintenance: false, power: false }
  if (state === 'running') return { maintenance: true, power: true }
  return { maintenance: true, power: kind === 'factory' }
}

/** A placed structure takes lots; a packed-up one (back to a deed) does not. */
export function usesLots(state: StructureState): boolean {
  return state !== 'packed'
}

/** Lots in use per character, counting only structures that are placed. */
export function lotsByCharacter(structures: { character: string; lots: number; state: StructureState }[]): Map<string, number> {
  const used = new Map<string, number>()
  for (const s of structures) {
    if (!usesLots(s.state)) continue
    used.set(s.character, (used.get(s.character) ?? 0) + s.lots)
  }
  return used
}

/**
 * Lots a character would use if one structure were saved with this character, lots and state.
 * `changingId` is the structure being edited (its old numbers are left out), or undefined for a new one.
 */
export function lotsAfter(
  structures: { id: number; character: string; lots: number; state: StructureState }[],
  next: { character: string; lots: number; state: StructureState },
  changingId?: number
): number {
  const others = structures.filter((s) => s.id !== changingId && s.character === next.character && usesLots(s.state))
  return others.reduce((n, s) => n + s.lots, 0) + (usesLots(next.state) ? next.lots : 0)
}
