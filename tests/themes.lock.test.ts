import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../src/shared/themes'

/**
 * LOCKED THEMES. The look of every theme was approved by the owner, so this test
 * snapshots each theme's exact CSS block. An accidental edit fails the test.
 * To change a theme on purpose, edit it, then run `npx vitest run -u` to accept
 * the new snapshot and say so in docs/PROJECT_STATUS.md.
 */
const css = readFileSync('src/renderer/src/styles.css', 'utf8')

const block = (id: string): string => {
  const m = new RegExp(`(?::root, )?\\[data-theme="${id}"\\]\\s*\\{[^}]*\\}`).exec(css)
  expect(m, `missing CSS block for theme "${id}"`).not.toBeNull()
  return m![0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim() // comments and spacing don't count
}

describe('locked themes', () => {
  it('has exactly the approved theme list', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['holonet', 'imperial', 'rebel', 'jedi', 'sith', 'hutt', 'bounty-hunter', 'mos-eisley'])
  })

  it.each(THEMES.map((t) => t.id))('%s is unchanged', (id) => {
    expect(block(id)).toMatchSnapshot()
  })
})
