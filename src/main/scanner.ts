import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMail } from '../shared/mailParser'
import type { DetectedLocation, ScanResult } from '../shared/types'
import type { Store } from './db'

/**
 * Reads every new .mail file for every character in the location.
 * Files already seen are skipped by name, so re-scanning is cheap and safe,
 * and a mail can never be counted twice.
 */
export function scan(store: Store, loc: DetectedLocation): ScanResult & { lowItemIds: number[] } {
  const t0 = Date.now()
  const res = { scanned: 0, added: 0, skipped: 0, unparsed: 0, matchedToInventory: 0, durationMs: 0 }
  const lowItemIds = new Set<number>()

  for (const ch of loc.characters) {
    let files: string[]
    try { files = readdirSync(ch.dir).filter((f) => f.endsWith('.mail')) } catch { continue }
    const known = store.knownFiles(ch.name)
    const fresh = files.filter((f) => !known.has(f))
    res.skipped += files.length - fresh.length

    store.transaction(() => {
      for (const file of fresh) {
        res.scanned++
        let raw: string
        try { raw = readFileSync(join(ch.dir, file), 'utf8') } catch { continue }
        const parsed = parseMail(raw)
        if (!parsed) res.unparsed++
        else {
          const r = store.insertEvent(ch.name, parsed)
          if (r.inserted) {
            res.added++
            if (r.lowItemId) { res.matchedToInventory++; lowItemIds.add(r.lowItemId) }
          }
        }
        store.markScanned(ch.name, file)
      }
    })
  }
  res.durationMs = Date.now() - t0
  return { ...res, lowItemIds: [...lowItemIds] }
}
