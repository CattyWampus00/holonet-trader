/** Kinds of events we extract from SWG Legends mails. */
export type EventKind =
  | 'sale' // "Vendor Sale Complete": one of YOUR vendors sold something
  | 'purchase' // "Vendor Item Purchased": you bought from someone else's vendor
  | 'unsold' // "Vendor Sale Unsuccessful": a listing ended unsold
  | 'expired' // "Auction Item Expired"
  | 'offer_in' // "Item Offered to Your Vendor": a buy offer received
  | 'offer_out' // "Your Offer to a Vendor": an offer you made
  | 'vendor_empty' // "An update about your vendor": vendor is now empty
  | 'vendor_maint' // "Vendor maintenance pool empty!"
  | 'factory_done' // "Manufacturing station finished": a factory stopped making items
  | 'structure_maint' // "Structure maintenance pool empty!": now paying from the bank
  | 'construction' // "Construction Complete": a structure was placed; says how many lots are left

export interface ParsedMail {
  mailId: string
  timestamp: number // unix seconds
  kind: EventKind
  vendor?: string
  /** Item name as shown in the mail, with the crate size stripped. */
  itemName?: string
  /** Crate/stack size. 1 when the mail shows no trailing number. */
  quantity?: number
  /** Power-ups only: remaining uses (the trailing number in the name). Quantity is 1 for these. */
  uses?: number
  /** Total credits for the whole crate. */
  price?: number
  /** Buyer (sale) or seller/offerer (purchase, offers). */
  counterparty?: string
  city?: string
  planet?: string
  /** Structure mails: the structure's name as the mail shows it. */
  structure?: string
  /** "Construction Complete": lots the character has left, per the game. */
  lotsLeft?: number
  /** Maintenance mails: the structure's spot as the game shows it. */
  x?: number
  y?: number
}

/** A structure mail, for the notices on the Structures tab and Dashboard. */
export interface StructureMail {
  id: number
  character: string
  ts: number
  kind: 'factory_done' | 'structure_maint' | 'construction' | 'vendor_maint'
  /** The name as the mail shows it ("A vendor" for the vendor mail, which has no real name). */
  name: string
  planet: string | null
  lotsLeft: number | null
  /** The app's structure it was matched to, or null when none matched. */
  structureId: number | null
  /** The player dismissed it, or a later maintenance reading dealt with it. Dismissed mails stay listed but raise no banner. */
  dismissed: boolean
}

export interface CharacterInfo {
  name: string
  dir: string
  mailCount: number
}

export interface DetectedLocation {
  /** e.g. D:\SWGLegendsLauncher\profiles\<account>\Omega */
  serverDir: string
  account: string
  characters: CharacterInfo[]
}

export interface ScanResult {
  scanned: number
  added: number
  skipped: number
  unparsed: number
  matchedToInventory: number
  durationMs: number
}

export interface SaleRow {
  id: number
  character: string
  ts: number
  kind: EventKind
  vendor: string | null
  itemName: string | null
  quantity: number
  /** Power-ups only: remaining uses; null for everything else. */
  uses: number | null
  price: number
  counterparty: string | null
  city: string | null
  planet: string | null
  itemId: number | null
}

export interface InventoryItem {
  id: number
  name: string
  key: string
  onHand: number
  costEach: number
  /** Per-item low-stock threshold; null means "use the global default". */
  lowThreshold: number | null
  notes: string
  /** Retired: no longer stocked (for example a despawned resource). Skipped by restock warnings and inventory value. */
  archived: boolean
}

export type StockStatus = 'ok' | 'low' | 'out'

/** One row of the Prices table: how a single item has sold. All prices are per single unit. */
export interface PriceRow {
  key: string
  name: string
  sales: number
  units: number
  low: number
  average: number
  high: number
  lastTs: number
  lastUnitPrice: number
  /** Median of the latest 5 sales. */
  recentMedian: number
  /** Median of the 5 sales before those; null when there is not enough history. */
  previousMedian: number | null
  trend: 'up' | 'down' | 'flat' | 'unknown'
  /** Crate sizes this item has sold in, smallest first. */
  crateSizes: number[]
}

/** One row of the Customers table: everything one buyer has bought from your vendors. */
export interface CustomerRow {
  name: string
  /** Total credits spent. */
  credits: number
  /** Number of sales (mails). */
  purchases: number
  /** Items bought: crate contents count in full, a resource sale counts as 1. */
  items: number
  lastTs: number
}

/** One sale for the item detail chart and table. */
export interface PricePointRow {
  ts: number
  price: number // credits for the whole crate
  quantity: number
  unitPrice: number
  vendor: string | null
  buyer: string | null
  character: string
}

export interface PriceSeries {
  row: PriceRow | null
  /** Oldest first, ready for a chart. */
  points: PricePointRow[]
}

/** A machine type the player saved: fixed stats copied from the game's Structure Status window. */
export interface MachineType {
  id: number
  name: string
  kind: import('./structures').StructureKind
  lots: number
  maintPerHour: number | null
  powerPerHour: number | null
  storage: number | null
  efficiency: number | null
}
export type MachineTypeInput = Omit<MachineType, 'id'> & { id?: number }

/** One check-in, copied from Structure Status (and the Operate panel for harvesters). Empty fields stay null. */
export interface StructureReading {
  ts: number
  surplusMaint: number | null
  surplusPower: number | null
  extractionRate: number | null
  hopperPct: number | null
  /** Houses: Number of Items in Building. Vendors: Number of Items For Sale. */
  items: number | null
}

/** One period of a harvester extracting one resource. `toTs` is null while it is the current resource. */
export interface HarvesterResource {
  id: number
  /** The resource's own name, e.g. "Carbigyfed" (unique in game). */
  name: string
  /** The type as the Operate panel shows it, e.g. "Crism Siliclastic Ore". */
  type: string
  concentration: number | null
  fromTs: number
  toTs: number | null
}

/** One real placed (or packed-up) harvester or factory. It keeps its own copy of the type's stats. */
export interface Structure {
  id: number
  character: string
  typeId: number | null
  typeName: string | null
  name: string
  kind: import('./structures').StructureKind
  planet: string
  notes: string
  lots: number
  maintPerHour: number | null
  powerPerHour: number | null
  storage: number | null
  efficiency: number | null
  /** Where it stands (x, y as the game shows them), used to match maintenance mails. Optional. */
  x: number | null
  y: number | null
  state: import('./structures').StructureState
  stateSince: number
  lastReading: StructureReading | null
  /** Harvesters: the resource being extracted now. */
  resource: HarvesterResource | null
  /** Extra names it matches in mail, saved by linking a mail to it (for example a name changed in game). */
  otherNames: string[]
  /** /transferStructure history (entered by hand), oldest first. `character` is always the current owner. */
  transfers: { from: string; to: string; ts: number }[]
  /** State history, oldest first. */
  history: { state: import('./structures').StructureState; ts: number }[]
  /** The newest reading of each number (a reading may leave some empty), used by the countdowns. */
  latest: {
    maint: import('./structures').Stamped | null
    power: import('./structures').Stamped | null
    rate: import('./structures').Stamped | null
    hopper: import('./structures').Stamped | null
    items: import('./structures').Stamped | null
  }
}
export type StructureInput = Omit<Structure, 'id' | 'typeName' | 'state' | 'stateSince' | 'lastReading' | 'resource' | 'otherNames' | 'transfers' | 'history' | 'latest' | 'x' | 'y'> & {
  id?: number
  /** Optional spot (x, y as the game shows them). */
  x?: number | null
  y?: number | null
  /** Only used when creating: the state it starts in. */
  state?: import('./structures').StructureState
}
