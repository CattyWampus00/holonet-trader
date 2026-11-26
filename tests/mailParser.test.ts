import { describe, expect, it } from 'vitest'
import { cleanItemName, itemKey, newItemName, parseMail, splitQuantity } from '../src/shared/mailParser'

const mail = (id: string, sender: string, subject: string, ts: number, body: string) =>
  [id, sender, subject, `TIMESTAMP: ${ts}`, body].join('\r\n')

describe('parseMail', () => {
  it('parses a crate sale', () => {
    const r = parseMail(
      mail('100', 'SWG.Omega.auctioner', 'Vendor Sale Complete', 1776442748,
        'Vendor: Test Shop has sold "Armorweave Belt - Socketed     25" to "Some Buyer" for 2500 credits. See the attached waypoint for location.\r\nThe sale took place at Talus, on Talus.')
    )
    expect(r).toMatchObject({
      mailId: '100', timestamp: 1776442748, kind: 'sale', vendor: 'Test Shop',
      itemName: 'Armorweave Belt - Socketed', quantity: 25, price: 2500,
      counterparty: 'Some Buyer', city: 'Talus', planet: 'Talus'
    })
  })

  it('treats a name with no trailing number as quantity 1 and handles apostrophes', () => {
    const r = parseMail(
      mail('101', 'SWG.Omega.auctioner', 'Vendor Sale Complete', 1,
        'Vendor: A has sold "Constitution Armor Attachment" to "Illvar Vel\'ith" for 700000 credits.')
    )
    expect(r).toMatchObject({ itemName: 'Constitution Armor Attachment', quantity: 1, counterparty: "Illvar Vel'ith", price: 700000 })
  })

  it('parses a vendor purchase', () => {
    const r = parseMail(
      mail('102', 'SWG.Omega.auctioner', 'Vendor Item Purchased', 2,
        'You have won the auction of "a Rebel medic kit" from "Seller" for 800000 credits. See the attached waypoint for location.\r\nThe sale took place at Talus, on Talus.')
    )
    expect(r).toMatchObject({ kind: 'purchase', itemName: 'a Rebel medic kit', quantity: 1, price: 800000, counterparty: 'Seller' })
  })

  it('parses unsold, offers (with comma prices) and vendor-empty', () => {
    expect(parseMail(mail('1', 'x', 'Vendor Sale Unsuccessful', 3,
      'Your auction of "Steel (Sages) 1000000" from Vendor: Resources has ended and has not been purchased.\r\nThe item was being sold at Talus, on Talus.')))
      .toMatchObject({ kind: 'unsold', vendor: 'Resources', itemName: 'Steel (Sages)', quantity: 1000000 })
    expect(parseMail(mail('2', 'x', 'Your Offer to a Vendor', 4,
      'You have offered "Schematic Deed: Crafted Armor Color Kit" for 500,000 credits to a vendor.')))
      .toMatchObject({ kind: 'offer_out', price: 500000 })
    expect(parseMail(mail('3', 'x', 'Item Offered to Your Vendor', 5,
      '"Bob" has offered "a Rebel medic kit      1" for 800000 credits to your vendor.')))
      .toMatchObject({ kind: 'offer_in', counterparty: 'Bob', quantity: 1, price: 800000 })
    expect(parseMail(mail('4', 'x', 'An update about your vendor', 6, 'Vendor: PURCHASING DROID is now empty.  If this vendor...')))
      .toMatchObject({ kind: 'vendor_empty', vendor: 'PURCHASING DROID' })
  })

  it('ignores player chat mails and malformed files', () => {
    expect(parseMail(mail('9', 'SWG.Omega.mudon', 'Shipwright Suit', 7, 'hi'))).toBeNull()
    expect(parseMail('garbage')).toBeNull()
  })
})

describe('cleanItemName', () => {
  it('removes color codes and the reset code but keeps capitalization', () => {
    expect(cleanItemName('\\#FFFFFF+35 \\#B978F11st, 2nd and 3rd Order Power Bit Pack')).toBe('+35 1st, 2nd and 3rd Order Power Bit Pack')
    expect(cleanItemName('Red \\#FF0000Hot\\#. Sauce')).toBe('Red Hot Sauce')
    expect(cleanItemName('  Plain   Name ')).toBe('Plain Name')
  })
})

describe('number styles in mails', () => {
  const sale = (credits: string, item = 'Large Rectangular Pane of Glass') =>
    `1\r\nSWG.Omega.auctioner\r\nVendor Sale Complete\r\nTIMESTAMP: 1786779250\r\nVendor: BackRoom Deals has sold "${item}" to "Some Buyer" for ${credits} credits. See the attached waypoint for location.\r\nThe sale took place at Talus, on Talus.`
  it('reads credits written plain, with commas, or with dots', () => {
    expect(parseMail(sale('650000'))!.price).toBe(650000)
    expect(parseMail(sale('650,000'))!.price).toBe(650000)
    expect(parseMail(sale('650.000'))!.price).toBe(650000) // seen in real mails from 15 Aug 2026
    expect(parseMail(sale('1.250.000'))!.price).toBe(1250000)
  })
  it('reads item amounts written with separators', () => {
    expect(parseMail(sale('3.000', 'Steel (Sages) 1.000.000'))).toMatchObject({ itemName: 'Steel (Sages)', quantity: 1000000, price: 3000 })
  })
})

describe('newItemName', () => {
  it('cleans the name when the matching key stays the same, otherwise keeps the raw name', () => {
    const plain = '\\#FFFFFF+35 Power Bit Pack'
    expect(newItemName(plain, itemKey(plain))).toBe('+35 Power Bit Pack')
    const reset = 'Red \\#FF0000Hot\\#. Sauce'
    expect(newItemName(reset, itemKey(reset))).toBe(reset)
  })
})

describe('splitQuantity / itemKey', () => {
  it('splits crate sizes and resource amounts', () => {
    expect(splitQuantity('Mabari Belt - RE     25')).toEqual({ name: 'Mabari Belt - RE', quantity: 25 })
    // Legends' October patch made comma-separated numbers the default; amounts must parse either way
    expect(splitQuantity('Steel (Sages) 1,000,000')).toEqual({ name: 'Steel (Sages)', quantity: 1000000 })
    expect(splitQuantity('Mabari Belt - RE     2,500')).toEqual({ name: 'Mabari Belt - RE', quantity: 2500 })
    expect(splitQuantity('Weapon Powerup - X (7)    1,200')).toEqual({ name: 'Weapon Powerup - X (7)', quantity: 1, uses: 1200 })
    // power-ups: the trailing number is remaining uses, never a crate size
    expect(splitQuantity('Weapon Powerup - Heavy Weapon Damage (7)    216')).toEqual({ name: 'Weapon Powerup - Heavy Weapon Damage (7)', quantity: 1, uses: 216 })
    expect(splitQuantity('Armor Powerup - Pistol Damage (7) 248')).toEqual({ name: 'Armor Powerup - Pistol Damage (7)', quantity: 1, uses: 248 })
    expect(splitQuantity('Clothing Powerup - Healing Potency (13)')).toEqual({ name: 'Clothing Powerup - Healing Potency (13)', quantity: 1 })
    expect(splitQuantity('Steel (Sages) 1000000')).toEqual({ name: 'Steel (Sages)', quantity: 1000000 })
    expect(splitQuantity('Plain Item')).toEqual({ name: 'Plain Item', quantity: 1 })
  })
  it('normalizes keys', () => {
    expect(itemKey('  Agility   Modifier Bit ')).toBe('agility modifier bit')
    expect(itemKey('\\#FFFFFFBUYING \\#B978F1Tauntaun')).toBe('buying tauntaun')
  })
})

describe('structure mails', () => {
  it('reads a factory that stopped making items', () => {
    const r = parseMail(mail('200', 'SWG.Omega.system', 'Manufacturing station finished', 1777000000,
      'Your manufacturing station, Test Weapon Factory, has stopped making items.'))
    expect(r).toMatchObject({ kind: 'factory_done', structure: 'Test Weapon Factory', timestamp: 1777000000 })
  })

  it('reads an empty structure maintenance pool, with negative coordinates', () => {
    const r = parseMail(mail('201', 'SWG.Omega.system', 'Structure maintenance pool empty!', 1777000100,
      'Your Elite Mineral Harvester (-1234, 567  tatooine) has an empty maintenance pool. It will start deducting from your bank account automatically.'))
    expect(r).toMatchObject({ kind: 'structure_maint', structure: 'Elite Mineral Harvester', planet: 'tatooine' })
  })

  it('reads a finished construction and the lots left', () => {
    const r = parseMail(mail('202', 'SWG.Omega.system', 'Construction Complete', 1777000200,
      'Construction of your Elite Mineral Harvester is now complete. You have 4 lots remaining.'))
    expect(r).toMatchObject({ kind: 'construction', structure: 'Elite Mineral Harvester', lotsLeft: 4 })
    const one = parseMail(mail('203', 'SWG.Omega.system', 'Construction Complete', 1777000300,
      'Construction of your Food Factory is now complete. You have 1 lot remaining.'))
    expect(one).toMatchObject({ lotsLeft: 1 })
  })

  it('ignores a structure mail with an unknown shape', () => {
    expect(parseMail(mail('204', 'SWG.Omega.system', 'Construction Complete', 1777000400, 'Something else entirely.'))).toBeNull()
  })
})

describe('vendor and structure spots (Step 8)', () => {
  it('reads the vendor maintenance mail: no real name, only the spot', () => {
    const r = parseMail(mail('300', 'SWG.Omega.Galactic Housing Authority', 'Vendor maintenance pool empty!', 1777000500,
      'Your vendor terminal_name:[vendor_terminal] (-1234.567, 890.125  Talus) has an empty maintenance pool. It has been deactivated and cannot list new items for sales or be offered items.'))
    expect(r).toMatchObject({ kind: 'vendor_maint', x: -1234.567, y: 890.125, planet: 'Talus' })
    expect(r!.structure).toBeUndefined()
  })

  it('keeps an odd vendor mail as a plain vendor notice', () => {
    expect(parseMail(mail('301', 'SWG.Omega.Galactic Housing Authority', 'Vendor maintenance pool empty!', 1777000600, 'Something else.')))
      .toMatchObject({ kind: 'vendor_maint' })
  })

  it('reads the spot from a structure maintenance mail', () => {
    const r = parseMail(mail('302', 'SWG.Omega.system', 'Structure maintenance pool empty!', 1777000700,
      'Your Test House (1275, -2318  talus) has an empty maintenance pool. It will start deducting from your bank account automatically.'))
    expect(r).toMatchObject({ structure: 'Test House', x: 1275, y: -2318, planet: 'talus' })
  })
})
