import type { ThemeId } from '@shared/themes'
import type { CustomerRow, DetectedLocation, HarvesterResource, InventoryItem, MachineType, MachineTypeInput, PriceRow, PriceSeries, SaleRow, ScanResult, Structure, StructureInput, StructureMail, StructureReading } from '@shared/types'
import type { StructureState } from '@shared/structures'

export interface Settings { serverDir: string | null; lowThreshold: number; location: DetectedLocation | null; theme: ThemeId; autoUpdate: boolean; version: string }
export interface Row { name: string; sales: number; revenue: number; units?: number }
export interface Summary {
  totals: { sales: number; revenue: number; units: number }
  spent: { spent: number }
  byDay: { day: string; revenue: number; sales: number }[]
  topItems: Row[]
  byVendor: Row[]
  byCharacter: Row[]
}
export interface Unmatched { key: string; name: string; sales: number; units: number }
export interface IgnoredName { key: string; name: string; sales: number }
export interface LinkedName { key: string; name: string; sales: number; itemId: number; itemName: string }
export interface VendorAlert { id: number; character: string; ts: number; kind: 'vendor_empty' | 'vendor_maint'; vendor: string | null }
export interface ItemInput { id?: number; name: string; onHand: number; costEach: number; lowThreshold: number | null; notes: string }

export interface Api {
  getSettings(): Promise<Settings>
  setThreshold(n: number): Promise<void>
  setTheme(id: ThemeId): Promise<void>
  setAutoUpdate(on: boolean): Promise<void>
  quitApp(): Promise<void>
  toggleFullScreen(): Promise<void>
  detectLocations(): Promise<DetectedLocation[]>
  pickLocation(): Promise<DetectedLocation[]>
  setLocation(dir: string): Promise<ScanResult | null>
  scan(): Promise<ScanResult | null>
  events(f?: { kinds?: string[]; from?: number; to?: number; search?: string; character?: string; limit?: number }): Promise<SaleRow[]>
  summary(from: number, to: number, character?: string): Promise<Summary>
  customerList(from: number, to: number, character?: string): Promise<CustomerRow[]>
  priceList(from: number, to: number, character?: string): Promise<PriceRow[]>
  priceSeries(key: string, from: number, to: number, character?: string): Promise<PriceSeries>
  vendorAlerts(): Promise<VendorAlert[]>
  structureMails(): Promise<StructureMail[]>
  listItems(): Promise<InventoryItem[]>
  saveItem(i: ItemInput): Promise<number>
  deleteItem(id: number): Promise<void>
  adjustStock(id: number, delta: number, reason: string): Promise<void>
  /** Archive (retire) an item, or restore it. */
  setArchived(id: number, archived: boolean): Promise<void>
  unmatched(): Promise<Unmatched[]>
  ignoreName(key: string): Promise<void>
  unignoreName(key: string): Promise<void>
  ignoredNames(): Promise<IgnoredName[]>
  machineTypes(): Promise<MachineType[]>
  saveMachineType(t: MachineTypeInput): Promise<number>
  deleteMachineType(id: number): Promise<void>
  structures(): Promise<Structure[]>
  saveStructure(s: StructureInput): Promise<number>
  deleteStructure(id: number): Promise<void>
  setStructureState(id: number, state: StructureState): Promise<void>
  addReading(id: number, r: Omit<StructureReading, 'ts'>): Promise<void>
  setHarvesterResource(id: number, res: { name: string; type: string; concentration: number | null }): Promise<void>
  resourceHistory(id: number): Promise<HarvesterResource[]>
  /** Which inventory item a resource's harvest would go to (itemId null = a new item with this name). */
  resourceTarget(res: { name: string; type: string }): Promise<{ itemId: number | null; itemName: string }>
  emptyHopper(id: number, amount: number): Promise<{ itemId: number; itemName: string; created: boolean }>
  hopperLog(id: number): Promise<{ ts: number; resource: string; amount: number }[]>
  linkAlias(key: string, itemId: number): Promise<void>
  /** One item's links, or every link when no id is given. */
  linkedNames(itemId?: number): Promise<LinkedName[]>
  /** Resolves to the number of units given back to stock. */
  unlinkAlias(key: string): Promise<number>
  onDataChanged(cb: () => void): () => void
}

export const api = (window as unknown as { api: Api }).api

export const credits = (n: number) => Math.round(n).toLocaleString('en-US')
export const dateTime = (ts: number) => new Date(ts * 1000).toLocaleString()
export const dayStart = (daysAgo: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000) - daysAgo * 86400
}
