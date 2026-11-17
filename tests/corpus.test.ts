import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMail } from '../src/shared/mailParser'

/**
 * Optional sanity check against a REAL mail folder. Run with:
 *   SWG_MAIL_DIR="D:\SWGLegendsLauncher\profiles\<acct>\Omega\mail_<Char>" npm test
 * Skipped when the variable is not set, so CI and other machines are unaffected.
 */
const dir = process.env.SWG_MAIL_DIR
describe.skipIf(!dir || !existsSync(dir))('real mail corpus', () => {
  it('parses every vendor mail it recognises', () => {
    const files = readdirSync(dir!).filter((f) => f.endsWith('.mail'))
    const vendorSubjects = ['Vendor Sale Complete', 'Vendor Item Purchased', 'Vendor Sale Unsuccessful']
    let vendorMails = 0
    const failed: string[] = []
    const counts: Record<string, number> = {}
    for (const f of files) {
      const raw = readFileSync(join(dir!, f), 'utf8')
      const subject = raw.replace(/\r/g, '').split('\n')[2]
      const parsed = parseMail(raw)
      if (parsed) counts[parsed.kind] = (counts[parsed.kind] ?? 0) + 1
      if (vendorSubjects.includes(subject ?? '')) {
        vendorMails++
        if (!parsed) failed.push(f)
      }
    }
    console.log('corpus:', files.length, 'files', counts)
    expect(failed.slice(0, 5)).toEqual([])
    expect(vendorMails).toBeGreaterThanOrEqual(0)
  })
})
