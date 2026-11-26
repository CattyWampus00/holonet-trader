import type { ParsedMail } from './types'

/**
 * Parses the text of one `.mail` file written by SWG Legends' /mailsave.
 *
 * File layout (CRLF line endings):
 *   line 1: mail id
 *   line 2: sender          e.g. SWG.Omega.auctioner
 *   line 3: subject         e.g. Vendor Sale Complete
 *   line 4: TIMESTAMP: <unix seconds>
 *   line 5+: body
 *
 * Returns null for mails we don't track (player chat, orders, etc.).
 */
export function parseMail(raw: string): ParsedMail | null {
  const lines = raw.replace(/\r/g, '').split('\n')
  const mailId = lines[0]?.trim()
  const subject = lines[2]?.trim() ?? ''
  const tsMatch = /^TIMESTAMP:\s*(\d+)/.exec(lines[3] ?? '')
  if (!mailId || !tsMatch) return null

  const base = { mailId, timestamp: Number(tsMatch[1]) }
  const body = lines.slice(4).join('\n')
  const where = parseWhere(body)

  switch (subject) {
    case 'Vendor Sale Complete': {
      const m = /Vendor:\s*(.+?) has sold "(.+)" to "(.+?)" for ([\d.,]+) credits/s.exec(body)
      if (!m) return null
      const { name, quantity, uses } = splitQuantity(m[2]!)
      return { ...base, kind: 'sale', vendor: m[1], itemName: name, quantity, uses, price: money(m[4]!), counterparty: m[3], ...where }
    }
    case 'Vendor Item Purchased': {
      const m = /won the auction of "(.+)" from "(.+?)" for ([\d.,]+) credits/s.exec(body)
      if (!m) return null
      const { name, quantity, uses } = splitQuantity(m[1]!)
      return { ...base, kind: 'purchase', itemName: name, quantity, uses, price: money(m[3]!), counterparty: m[2], ...where }
    }
    case 'Vendor Sale Unsuccessful': {
      const m = /Your auction of "(.+)" from Vendor:\s*(.+?) has ended/s.exec(body)
      if (!m) return null
      const { name, quantity, uses } = splitQuantity(m[1]!)
      return { ...base, kind: 'unsold', vendor: m[2], itemName: name, quantity, uses, ...where }
    }
    case 'Item Offered to Your Vendor': {
      const m = /"(.+?)" has offered "(.+)" for ([\d.,]+) credits to your vendor/s.exec(body)
      if (!m) return null
      const { name, quantity, uses } = splitQuantity(m[2]!)
      return { ...base, kind: 'offer_in', itemName: name, quantity, uses, price: money(m[3]!), counterparty: m[1], ...where }
    }
    case 'Your Offer to a Vendor': {
      const m = /You have offered "(.+)" for ([\d.,]+) credits to a vendor/s.exec(body)
      if (!m) return null
      const { name, quantity, uses } = splitQuantity(m[1]!)
      return { ...base, kind: 'offer_out', itemName: name, quantity, uses, price: money(m[2]!), ...where }
    }
    case 'Auction Item Expired': {
      const m = /that you were auctioning has expired/.exec(body)
      const item = /the "(.+)" that you were auctioning/s.exec(body)
      if (!m) return null
      const { name, quantity, uses } = splitQuantity(item?.[1] ?? '')
      return { ...base, kind: 'expired', itemName: name || undefined, quantity, uses }
    }
    case 'An update about your vendor': {
      const m = /Vendor:\s*(.+?) is now empty/.exec(body)
      return m ? { ...base, kind: 'vendor_empty', vendor: m[1] } : null
    }
    case 'Vendor maintenance pool empty!':
      return { ...base, kind: 'vendor_maint' }
    case 'Manufacturing station finished': {
      const m = /Your manufacturing station, (.+?), has stopped making items/s.exec(body)
      return m ? { ...base, kind: 'factory_done', structure: m[1]!.trim() } : null
    }
    case 'Structure maintenance pool empty!': {
      // "Your <name> (<x>, <y>  <planet>) has an empty maintenance pool." Coordinates may be negative.
      const m = /Your (.+?) \(\s*-?[\d.,]+\s*,\s*-?[\d.,]+\s+(.+?)\s*\) has an empty maintenance pool/s.exec(body)
      return m ? { ...base, kind: 'structure_maint', structure: m[1]!.trim(), planet: m[2] } : null
    }
    case 'Construction Complete': {
      const m = /Construction of your (.+?) is now complete\.\s*You have (\d+) lots? remaining/s.exec(body)
      return m ? { ...base, kind: 'construction', structure: m[1]!.trim(), lotsLeft: Number(m[2]) } : null
    }
    default:
      return null
  }
}

/** "The sale took place at Talus, on Talus." -> { city: 'Talus', planet: 'Talus' } */
function parseWhere(body: string): { city?: string; planet?: string } {
  const m = /(?:took place|was made) at (.+?), on (.+?)\./.exec(body)
  return m ? { city: m[1], planet: m[2] } : {}
}

/**
 * Credits and amounts can be written plain (1000000), with commas (1,000,000, the default after Legends'
 * October 2026 patch) or with dots (1.000.000, seen in some mails). Credits are whole numbers, so either mark
 * is only ever a thousands separator.
 */
function money(s: string): number {
  return Number(s.replace(/[.,]/g, ''))
}

/** A trailing item amount, in any of those styles. */
function amount(s: string): number {
  return money(s)
}

/**
 * Crates show their size as a trailing number separated by several spaces,
 * e.g. `"Mabari Armorweave Belt - RE - Socketed     25"` is a crate of 25.
 * Resources use a single space after the closing paren: `"Steel (Sages) 1000000"`.
 * An item with no trailing number is a single unit.
 */
export function splitQuantity(raw: string): { name: string; quantity: number; uses?: number } {
  // Amounts may carry thousands commas ("1,000,000"): Legends switched numbers to comma format in a patch (Oct 2026).
  const crate = /^(.*?)\s{2,}(\d{1,3}(?:[.,]\d{3})+|\d+)$/s.exec(raw)
  if (crate) return asItem(crate[1]!.trim(), amount(crate[2]!))
  const resource = /^(.*\))\s(\d{1,3}(?:[.,]\d{3})+|\d+)$/s.exec(raw)
  if (resource) return asItem(resource[1]!.trim(), amount(resource[2]!))
  return { name: raw.trim(), quantity: 1 }
}

/** Power-ups (Weapon, Armor, Clothing) show their remaining USES as the trailing number, not a crate size. */
export function isPowerup(name: string): boolean {
  return /powerup/i.test(name)
}

/**
 * Resources are named `Type (Name)`: one word of letters in the brackets, e.g. `Copper (Dohen)`.
 * Their trailing number is an amount in UNITS (1,000,000), not a crate. Power-ups have digits in the
 * brackets, so they never match.
 */
export function isResource(name: string): boolean {
  return /\s\([A-Za-z]+\)$/.test(cleanItemName(name))
}

function asItem(name: string, n: number): { name: string; quantity: number; uses?: number } {
  return isPowerup(name) ? { name, quantity: 1, uses: n } : { name, quantity: n }
}

/**
 * Item name as a player should read it: the game's color codes (`\#FFFFFF`, and the `\#.` reset) are removed.
 * Unlike {@link itemKey} this keeps the original capitalization.
 */
export function cleanItemName(name: string): string {
  return name.replace(/\\#(?:[0-9a-fA-F]{6}|\.)/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Name to pre-fill when making an inventory item from an unmatched sale name. The clean name is used when it
 * keeps the same matching key; otherwise the raw name, so the sales still match the new item.
 */
export function newItemName(raw: string, key: string): string {
  const clean = cleanItemName(raw)
  return itemKey(clean) === key ? clean : raw
}

/**
 * Stable matching key for an item name: lower-case, color codes stripped,
 * whitespace collapsed. Used for inventory matching and aliases.
 */
export function itemKey(name: string): string {
  return name
    .replace(/\\#[0-9a-fA-F]{6}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
