import type { RangeValue } from './dateRange'

const DEFAULT: RangeValue = { preset: '30', from: '', to: '' }

/** Remembers each screen's last date range between launches (a convenience only; falls back to 30 days). */
export function loadRange(screen: string): RangeValue {
  try {
    const raw = localStorage.getItem(`holonet-range-${screen}`)
    if (raw) {
      const v = JSON.parse(raw) as RangeValue
      if (['today', '7', '30', '90', 'year', 'all', 'custom'].includes(v.preset)) return { preset: v.preset, from: v.from ?? '', to: v.to ?? '' }
    }
  } catch { /* storage unavailable or corrupt: use default */ }
  return DEFAULT
}

export function saveRange(screen: string, v: RangeValue): void {
  try { localStorage.setItem(`holonet-range-${screen}`, JSON.stringify(v)) } catch { /* ignore */ }
}

/** The chosen player character ('' means all characters). Shared by Dashboard and Sales Log. */
export function loadCharacter(): string {
  try { return localStorage.getItem('holonet-character') ?? '' } catch { return '' }
}
export function saveCharacter(name: string): void {
  try { localStorage.setItem('holonet-character', name) } catch { /* ignore */ }
}
