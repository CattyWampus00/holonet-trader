import { cleanItemName } from './mailParser'

/**
 * Rules for harvesters and factories (see docs/STRUCTURES_PLAN.md). Pure functions, no database.
 * Numbers always come from the game's own windows (after modifiers); nothing here models modifiers.
 */

export type StructureKind = 'harvester' | 'factory' | 'house' | 'vendor'
export type StructureState = 'running' | 'idle' | 'packed'

/** Lots each character may use in game. */
export const MAX_LOTS = 10

export const STATE_LABEL: Record<StructureState, string> = { running: 'Running', idle: 'Idle', packed: 'Packed up' }
export const KIND_LABEL: Record<StructureKind, string> = { harvester: 'Harvester', factory: 'Factory', house: 'House', vendor: 'Vendor' }
export const KINDS: StructureKind[] = ['harvester', 'factory', 'house', 'vendor']

/** Houses and vendors only pay maintenance: no power, no hopper (Step 8). */
export function usesPower(kind: StructureKind): boolean {
  return kind === 'harvester' || kind === 'factory'
}

/** The states a kind can be in: a house is placed or packed up; a vendor is just active. */
export function statesFor(kind: StructureKind): StructureState[] {
  if (kind === 'house') return ['running', 'packed']
  if (kind === 'vendor') return ['running']
  return ['running', 'idle', 'packed']
}

/** "Running" reads wrong for a house or vendor. */
export function stateLabel(kind: StructureKind, state: StructureState): string {
  if (state === 'running' && kind === 'house') return 'Placed'
  if (state === 'running' && kind === 'vendor') return 'Active'
  return STATE_LABEL[state]
}

/**
 * What a structure uses up in a given state. Confirmed in game by the owner (2026-11-26):
 * - a turned-off harvester uses maintenance but no power
 * - a factory uses power whenever it is placed, making items or not
 * - a packed-up structure (a deed) uses nothing and keeps its leftover surplus
 * - houses and vendors use maintenance only
 */
export function drains(kind: StructureKind, state: StructureState): { maintenance: boolean; power: boolean } {
  if (state === 'packed') return { maintenance: false, power: false }
  if (!usesPower(kind)) return { maintenance: true, power: false }
  if (state === 'running') return { maintenance: true, power: true }
  return { maintenance: true, power: kind === 'factory' }
}

/** A house is nearly full at 95% of its item capacity (Structure Status: Items in Building / Maximum Storage Capacity). */
export function nearlyFull(items: number | null | undefined, capacity: number | null | undefined): boolean {
  return items != null && !!capacity && items >= capacity * 0.95
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

// ---- countdowns (Step 4) ---------------------------------------------------

/** A value the player read in game, and when. */
export interface Stamped { value: number; ts: number }

/** One countdown. `hoursLeft` is null when a number needed for it was never entered. */
export interface Countdown {
  hoursLeft: number | null
  /** What is left now (credits, power units, or hopper room in units), worked out from the last reading. */
  left: number | null
  /** True when the structure's current state does not use this up (the clock is stopped). */
  paused: boolean
}

/**
 * Hours between `from` and `to` that the structure spent in a state where `use` returns true.
 * `history` is the state history, oldest first. Time before the first recorded state counts as that first state.
 */
export function hoursWhere(history: { state: StructureState; ts: number }[], from: number, to: number, use: (s: StructureState) => boolean): number {
  if (to <= from || !history.length) return 0
  let seconds = 0
  for (let i = 0; i < history.length; i++) {
    const start = i === 0 ? -Infinity : history[i]!.ts
    const end = i + 1 < history.length ? history[i + 1]!.ts : Infinity
    if (!use(history[i]!.state)) continue
    const a = Math.max(start, from)
    const b = Math.min(end, to)
    if (b > a) seconds += b - a
  }
  return seconds / 3600
}

/**
 * Countdowns for one structure, worked out from the last reading of each number and the hours since then spent in
 * a state that uses it up (Running and Idle use maintenance; power follows {@link drains}; the hopper fills only
 * while a harvester runs). Rates are the actual ones from the game, so no modifiers are applied here.
 */
export function forecast(s: {
  kind: StructureKind
  maintPerHour: number | null
  powerPerHour: number | null
  storage: number | null
  history: { state: StructureState; ts: number }[]
  latest: { maint: Stamped | null; power: Stamped | null; rate: Stamped | null; hopper: Stamped | null }
}, now: number): { maintenance: Countdown; power: Countdown; hopper: Countdown | null } {
  const current = s.history.length ? s.history[s.history.length - 1]!.state : 'packed'
  const pool = (reading: Stamped | null, perHour: number | null, which: 'maintenance' | 'power'): Countdown => {
    const paused = !drains(s.kind, current)[which]
    if (!reading || !perHour) return { hoursLeft: null, left: reading ? reading.value : null, paused }
    const used = perHour * hoursWhere(s.history, reading.ts, now, (st) => drains(s.kind, st)[which])
    const left = Math.max(0, reading.value - used)
    return { hoursLeft: left / perHour, left, paused }
  }
  const maintenance = pool(s.latest.maint, s.maintPerHour, 'maintenance')
  const power = pool(s.latest.power, s.powerPerHour, 'power')
  if (s.kind !== 'harvester') return { maintenance, power, hopper: null }

  const paused = current !== 'running'
  const { hopper: pct, rate } = s.latest
  if (!pct || !rate || !rate.value || !s.storage) return { maintenance, power, hopper: { hoursLeft: null, left: null, paused } }
  const room = s.storage * (100 - pct.value) / 100
  // The Operate panel rate is units per minute (checked against two real readings: 26% to 50% of a 486,665 hopper in 9.5 h at 203/min).
  const perHour = rate.value * 60
  const filled = perHour * hoursWhere(s.history, pct.ts, now, (st) => st === 'running')
  const left = Math.max(0, room - filled)
  return { maintenance, power, hopper: { hoursLeft: left / perHour, left, paused } }
}

/** How urgent a countdown is: under 2 days is urgent, under 7 days is soon. */
export function attention(hoursLeft: number | null): 'urgent' | 'soon' | null {
  if (hoursLeft == null) return null
  if (hoursLeft < 48) return 'urgent'
  if (hoursLeft < 24 * 7) return 'soon'
  return null
}

export const POOL_LABEL = { maintenance: 'Maintenance runs out', power: 'Power runs out', hopper: 'Hopper full' } as const

/**
 * Everything due within 7 days, soonest first, for the Dashboard's "Needs attention" list. Paused clocks
 * (for example a packed-up deed) are left out because nothing is being used up.
 */
export function needsAttention(
  list: (Parameters<typeof forecast>[0] & { id: number; name: string; character: string })[],
  now: number
): { id: number; name: string; character: string; what: keyof typeof POOL_LABEL; hoursLeft: number; level: 'urgent' | 'soon' }[] {
  const out: ReturnType<typeof needsAttention> = []
  for (const s of list) {
    const f = forecast(s, now)
    for (const what of ['maintenance', 'power', 'hopper'] as const) {
      const c = f[what]
      if (!c || c.paused || c.hoursLeft == null) continue
      const level = attention(c.hoursLeft)
      if (level) out.push({ id: s.id, name: s.name, character: s.character, what, hoursLeft: c.hoursLeft, level })
    }
  }
  return out.sort((a, b) => a.hoursLeft - b.hoursLeft)
}

/** "31 d 10 h" style, like the game's Structure Status window. */
export function formatHours(h: number): string {
  if (h <= 0) return 'empty now'
  const days = Math.floor(h / 24)
  const hours = Math.floor(h - days * 24)
  return days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h` : `${Math.max(1, Math.round(h * 60))} min`
}

/** Maintenance credits per day for structures that are placed (packed-up deeds cost nothing). */
export function upkeepPerDay(list: { maintPerHour: number | null; state: StructureState }[]): number {
  return list.reduce((sum, s) => (usesLots(s.state) && s.maintPerHour ? sum + s.maintPerHour * 24 : sum), 0)
}

// ---- mail hooks (Step 5) ----------------------------------------------------

/** What a structure mail tells us, for matching it to one of the app's structures. */
export interface MailClue {
  /** The character whose mail folder it came from. */
  character: string
  /** The structure's name as the mail shows it (a custom name, or the machine name such as "Elite Mineral Harvester"). */
  name: string
  /** Only the maintenance mail names a planet (lower-case, e.g. "tatooine"). */
  planet?: string
  /** The factory and vendor mails say the kind for sure. */
  kind?: StructureKind
  /** The maintenance mails give the spot (x, y as the game shows them). The vendor mail has no real name, only this. */
  x?: number
  y?: number
}

/** How close (in metres) a mail's spot must be to a saved spot to count as the same structure. */
export const SPOT_RADIUS = 10

/**
 * Which of the app's structures a mail is about, or null when it can't be told.
 * Returning null is safe: the mail is still listed as a notice, it just changes nothing.
 */
export function matchStructure(
  list: {
    id: number; character: string; name: string; typeName: string | null; planet: string; kind: StructureKind; otherNames?: string[]
    x?: number | null; y?: number | null
  }[],
  clue: MailClue
): number | null {
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const want = norm(clue.name)
  const samePlanet = (s: (typeof list)[number]) => !clue.planet || norm(s.planet) === norm(clue.planet)
  // Within a pool: 0. the saved spot (same planet, within SPOT_RADIUS); 1. the custom name the player typed, or
  // another name saved by linking a mail; 2. the machine type's name, narrowed by planet when the mail gives one.
  // Two or more still fitting means the mail can't say which one, so nothing is changed: 'unclear' stops the
  // search instead of trying a wider pool.
  const pick = (pool: typeof list): number | 'unclear' | null => {
    if (clue.x != null && clue.y != null) {
      const near = pool.filter((s) => s.x != null && s.y != null && samePlanet(s) && Math.hypot(s.x - clue.x!, s.y - clue.y!) <= SPOT_RADIUS)
      if (near.length) return near.length === 1 ? near[0]!.id : 'unclear'
    }
    if (!want) return null
    const byName = pool.filter((s) => norm(s.name) === want || (s.otherNames ?? []).some((n) => norm(n) === want))
    if (byName.length) return byName.length === 1 ? byName[0]!.id : 'unclear'
    const byType = pool.filter((s) => norm(s.typeName) === want && (!clue.planet || norm(s.planet) === norm(clue.planet)))
    return byType.length === 1 ? byType[0]!.id : byType.length ? 'unclear' : null
  }
  const ofKind = list.filter((s) => !clue.kind || s.kind === clue.kind)
  // The owner gets the mail, so the receiving character's structures come first. If none fit, the structure may have
  // been transferred in game without being recorded here (/transferStructure sends no mail), so try everyone's.
  const mine = ofKind.filter((s) => norm(s.character) === norm(clue.character))
  const own = pick(mine)
  if (own !== null) return own === 'unclear' ? null : own
  const any = pick(ofKind)
  if (any !== null) return any === 'unclear' ? null : any
  // The vendor mail has no name. A character's only vendor on that planet with no saved spot is the one
  // (a vendor whose saved spot is elsewhere is a different vendor).
  if (clue.kind === 'vendor' && clue.planet) {
    const here = mine.filter((s) => samePlanet(s) && s.x == null)
    if (here.length === 1) return here[0]!.id
  }
  return null
}

/**
 * Whether the Construction Complete "lots remaining" can be compared with the app's count: only when no transfer
 * to or from that character was recorded after the mail (a transfer changes the count the mail saw).
 */
export function lotsComparable(character: string, mailTs: number, structures: { transfers: { from: string; to: string; ts: number }[] }[]): boolean {
  const c = character.toLowerCase()
  return !structures.some((s) => s.transfers.some((t) => t.ts > mailTs && (t.from.toLowerCase() === c || t.to.toLowerCase() === c)))
}

/**
 * Read the resource line of a harvester's Operate panel: `<Name>, a type of <Type>`
 * (for example `Carbigyfed, a type of Crism Siliclastic Ore`). Returns null when the line has another shape.
 */
export function parseOperateResource(line: string): { name: string; type: string } | null {
  const m = /^\s*([^,]+?)\s*,\s*a type of\s+(.+?)\s*$/i.exec(line)
  return m ? { name: m[1]!, type: m[2]! } : null
}

/**
 * The resource's own name inside an item or sale name of the form `Type (Name)`, lower-case, or null.
 * Resource names are unique in game, while the type part differs between the Operate panel
 * ("Crism Siliclastic Ore") and vendor sale mails (a broader class such as "Ore"), so matching uses this.
 */
export function resourceKeyOf(itemName: string): string | null {
  const m = /\(([A-Za-z]+)\)$/.exec(cleanItemName(itemName))
  return m ? m[1]!.toLowerCase() : null
}

/** Inventory name for a harvested resource when no item or sale name exists yet: `Type (Name)`. */
export function resourceItemName(type: string, name: string): string {
  return `${type.trim()} (${name.trim()})`
}
