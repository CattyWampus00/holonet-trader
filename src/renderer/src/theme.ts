import { DEFAULT_THEME, isThemeId, type ThemeId } from '@shared/themes'

const KEY = 'holonet-theme'

/** Sets the theme on the page and remembers it for the next start. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id)
  try { localStorage.setItem(KEY, id) } catch { /* storage unavailable; the database copy still wins on load */ }
}

/** Called before React renders, so the window never flashes the wrong colors. */
export function applySavedThemeEarly(): void {
  let id: unknown = null
  try { id = localStorage.getItem(KEY) } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', isThemeId(id) ? id : DEFAULT_THEME)
}
