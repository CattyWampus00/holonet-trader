import { describe, expect, it } from 'vitest'
import { detectLocations } from '../src/main/detect'

/** Live check of drive auto-detect; only runs when SWG_DETECT=1 (it scans real drives). */
describe.skipIf(!process.env.SWG_DETECT)('detectLocations (live)', () => {
  it('finds the launcher profile folder on this machine', () => {
    const locs = detectLocations()
    console.log(JSON.stringify(locs.map((l) => ({ dir: l.serverDir, chars: l.characters.map((c) => `${c.name}:${c.mailCount}`) })), null, 1))
    expect(locs.length).toBeGreaterThan(0)
  })
})
