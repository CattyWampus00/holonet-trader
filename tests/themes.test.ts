import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../src/shared/themes'

const css = readFileSync('src/renderer/src/styles.css', 'utf8')

/** Reads the --tokens out of the [data-theme="id"] block (holonet also owns :root). */
function tokens(id: string): Record<string, string> {
  const m = new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`).exec(css)
  expect(m, `missing CSS block for theme "${id}"`).not.toBeNull()
  return Object.fromEntries([...m![1]!.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1]!, x[2]!.trim()]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const REQUIRED = ['bg', 'panel', 'panel2', 'line', 'row-hover', 'text', 'muted', 'accent', 'accent-ink', 'good', 'warn', 'bad', 'chart-bar', 'scrim']

describe.each(THEMES.map((t) => t.id))('theme %s', (id) => {
  const t = tokens(id)

  it('defines every token', () => {
    for (const k of REQUIRED) expect(t[k], `--${k}`).toBeTruthy()
  })

  it('is readable (WCAG AA 4.5:1 for text, 3:1 for status colors)', () => {
    expect(contrast(t['text']!, t['bg']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['text']!, t['panel']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['muted']!, t['panel']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['accent-ink']!, t['accent']!)).toBeGreaterThanOrEqual(4.5)
    for (const k of ['good', 'warn', 'bad', 'accent']) expect(contrast(t[k]!, t['panel']!), `--${k} on panel`).toBeGreaterThanOrEqual(3)
  })
})
