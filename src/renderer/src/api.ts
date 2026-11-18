import type { ThemeId } from '@shared/themes'
import type { CustomerRow, DetectedLocation, InventoryItem, PriceRow, PriceSeries, SaleRow, ScanResult } from '@shared/types'

export interface Settings { serverDir: string | null; lowThreshold: number; location: DetectedLocation | null; theme: ThemeId }
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
export interface VendorAlert { id: number; character: string; ts: number; kind: 'vendor_empty' | 'vendor_maint'; vendor: string | null }
export interface ItemInput { id?: number; name: string; onHand: number; costEach: number; lowThreshold: number | null; notes: string }

export interface Api {
  getSettings(): Promise<Settings>
  setThreshold(n: number): Promise<void>
  setTheme(id: ThemeId): Promise<void>
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
  listItems(): Promise<InventoryItem[]>
  saveItem(i: ItemInput): Promise<number>
  deleteItem(id: number): Promise<void>
  adjustStock(id: number, delta: number, reason: string): Promise<void>
  unmatched(): Promise<Unmatched[]>
  linkAlias(key: string, itemId: number): Promise<void>
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
