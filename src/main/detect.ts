import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CharacterInfo, DetectedLocation } from '../shared/types'

const SKIP = new Set(['windows', '$recycle.bin', 'system volume information', 'programdata', 'appdata', 'node_modules', '$windows.~bt', 'recovery'])

function dirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory() && !SKIP.has(d.name.toLowerCase())).map((d) => d.name)
  } catch {
    return []
  }
}

/** Is `serverDir` a folder that directly contains mail_<Character> folders? */
export function readServerDir(serverDir: string): DetectedLocation | null {
  const characters: CharacterInfo[] = []
  for (const name of dirs(serverDir)) {
    if (!name.startsWith('mail_')) continue
    const dir = join(serverDir, name)
    let mailCount = 0
    try { mailCount = readdirSync(dir).filter((f) => f.endsWith('.mail')).length } catch { /* unreadable */ }
    characters.push({ name: name.slice(5), dir, mailCount })
  }
  if (!characters.length) return null
  const parts = serverDir.split(/[\\/]/)
  return { serverDir, account: parts[parts.length - 2] ?? '', characters }
}

/** Accepts any folder the user picks (launcher root, profiles, account, or server) and finds the mail folders under it. */
export function resolveFromPick(pick: string): DetectedLocation[] {
  const found: DetectedLocation[] = []
  const direct = readServerDir(pick)
  if (direct) return [direct]
  const profiles = existsSync(join(pick, 'profiles')) ? join(pick, 'profiles') : pick
  for (const acct of dirs(profiles)) {
    for (const server of dirs(join(profiles, acct))) {
      const loc = readServerDir(join(profiles, acct, server))
      if (loc) found.push(loc)
    }
  }
  if (!found.length) {
    for (const server of dirs(pick)) {
      const loc = readServerDir(join(pick, server))
      if (loc) found.push(loc)
    }
  }
  return found
}

/**
 * Looks for `<anything>\profiles\<account>\<server>\mail_*` on every drive.
 * The launcher folder can sit on any drive under any name, so we look for the
 * game-made `profiles` folder up to three levels below each drive root.
 * Bounded on purpose: we never walk an entire drive.
 */
export function detectLocations(): DetectedLocation[] {
  const roots: string[] = []
  for (let c = 67; c <= 90; c++) {
    const r = `${String.fromCharCode(c)}:\\`
    if (existsSync(r)) roots.push(r)
  }
  const out = new Map<string, DetectedLocation>()
  const tryProfiles = (base: string) => {
    const p = join(base, 'profiles')
    if (!existsSync(p) || !statSync(p).isDirectory()) return
    for (const loc of resolveFromPick(p)) out.set(loc.serverDir, loc)
  }
  for (const root of roots) {
    tryProfiles(root)
    for (const a of dirs(root)) {
      tryProfiles(join(root, a))
      for (const b of dirs(join(root, a))) {
        tryProfiles(join(root, a, b))
        for (const c of dirs(join(root, a, b))) tryProfiles(join(root, a, b, c))
      }
    }
  }
  return [...out.values()]
}
