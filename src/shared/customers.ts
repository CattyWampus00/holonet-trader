import { isResource } from './mailParser'
import type { CustomerRow } from './types'

/** One sale as the Customers screen needs it. */
export interface SaleLine {
  buyer: string
  itemName: string | null
  quantity: number
  price: number
  ts: number
}

/**
 * How many items a sale counts as. A crate of 25 is 25 items, but a resource sale (50,000 units of copper) counts
 * as 1, otherwise one bulk resource buyer would hide everyone else. Power-ups are quantity 1 already.
 */
export function itemsInSale(itemName: string | null, quantity: number): number {
  if (itemName && isResource(itemName)) return 1
  return Math.max(1, quantity)
}

/** One row per buyer, biggest spender first (ties: more purchases, then name). */
export function summarizeCustomers(sales: SaleLine[]): CustomerRow[] {
  const by = new Map<string, CustomerRow>()
  for (const s of sales) {
    const row = by.get(s.buyer) ?? { name: s.buyer, credits: 0, purchases: 0, items: 0, lastTs: 0 }
    row.credits += s.price
    row.purchases += 1
    row.items += itemsInSale(s.itemName, s.quantity)
    row.lastTs = Math.max(row.lastTs, s.ts)
    by.set(s.buyer, row)
  }
  return [...by.values()].sort((a, b) => b.credits - a.credits || b.purchases - a.purchases || a.name.localeCompare(b.name))
}
