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
