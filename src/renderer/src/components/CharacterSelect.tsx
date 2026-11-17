import type { CharacterInfo } from '@shared/types'

/** Pick one player character, or "All characters". Lists every character the game made a mail folder for. */
export default function CharacterSelect({ characters, value, onChange }: { characters: CharacterInfo[]; value: string; onChange: (name: string) => void }) {
  if (!characters.length) return null
  // A remembered character that no longer exists falls back to "all" instead of showing an empty screen.
  const current = characters.some((c) => c.name === value) ? value : ''
  return (
    <label className="charselect">
      <span className="muted">Character</span>
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        <option value="">All characters</option>
        {characters.map((c) => (
          <option key={c.name} value={c.name}>{c.name}{c.mailCount === 0 ? ' (no mail yet)' : ''}</option>
        ))}
      </select>
    </label>
  )
}
