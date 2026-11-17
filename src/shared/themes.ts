/**
 * Available color themes. The actual colors live in styles.css as
 * `[data-theme="<id>"]` blocks. This list only names them for the picker
 * and validates saved values. To add a theme: add a CSS block and an entry here.
 */
export const THEMES = [
  { id: 'holonet', label: 'Holonet', blurb: 'Dark slate with amber (default)' },
  { id: 'imperial', label: 'Imperial', blurb: 'Stark black, crimson, sharp corners' },
  { id: 'rebel', label: 'Rebel Alliance', blurb: 'Worn utility browns, bold orange edges' },
  { id: 'jedi', label: 'Jedi', blurb: 'Calm blue, soft glow, serif headings' },
  { id: 'sith', label: 'Sith', blurb: 'Blood-black, red glow, serif caps' },
  { id: 'hutt', label: 'Hutt Cartel', blurb: 'Murky green, brass, chunky and ornate' },
  { id: 'bounty-hunter', label: 'Bounty Hunter', blurb: 'Gunmetal, hazard yellow, monospace' },
  { id: 'mos-eisley', label: 'Mos Eisley', blurb: 'Light theme, sand and paper' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export const DEFAULT_THEME: ThemeId = 'holonet'

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v)
}
