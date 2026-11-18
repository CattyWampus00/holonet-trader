import { useState } from 'react'
import type { DetectedLocation, ScanResult } from '@shared/types'
import { THEMES } from '@shared/themes'
import { api, type Settings } from '../api'
import { applyTheme } from '../theme'

export default function SettingsPage({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const [found, setFound] = useState<DetectedLocation[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [threshold, setThreshold] = useState(String(settings.lowThreshold))

  const detect = async () => { setBusy(true); setFound(await api.detectLocations()); setBusy(false) }
  const browse = async () => setFound(await api.pickLocation())
  const choose = async (dir: string) => {
    setBusy(true)
    setResult(await api.setLocation(dir))
    setBusy(false)
    onChange()
  }
  const rescan = async () => { setBusy(true); setResult(await api.scan()); setBusy(false); onChange() }

  return (
    <>
      <h2>Settings</h2>
      <h3>Game mail folder</h3>
      <div className="panel">
        {settings.location ? (
          <>
            <p style={{ marginTop: 0 }}>Watching <b>{settings.location.serverDir}</b></p>
            <table>
              <thead><tr><th>Character</th><th className="num">Mail files</th></tr></thead>
              <tbody>{settings.location.characters.map((c) => <tr key={c.name}><td>{c.name}</td><td className="num">{c.mailCount}</td></tr>)}</tbody>
            </table>
          </>
        ) : (
          <p style={{ marginTop: 0 }}>
            In game, run <code>/mailsave</code> (or <code>/mail</code>, <code>/mai</code>) while logged in on each character.
            That writes your mails into the game's profile folder, which HoloNet Trader reads. It never touches the game itself.
          </p>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={detect} disabled={busy}>{busy ? 'Working…' : 'Auto-detect'}</button>
          <button className="btn ghost" onClick={browse}>Browse…</button>
          {settings.location && <button className="btn ghost" onClick={rescan} disabled={busy}>Scan now</button>}
        </div>
        {result && (
          <p className="muted">Read {result.scanned} new files, added {result.added} events ({result.matchedToInventory} matched your inventory) in {result.durationMs} ms.</p>
        )}
        {found && found.length === 0 && (
          <p className="muted">Nothing found. Use Browse and pick your launcher folder (the one that contains <code>profiles</code>).</p>
        )}
        {found?.map((loc) => (
          <div key={loc.serverDir} className="card" style={{ marginTop: 8 }}>
            <div><b>{loc.serverDir}</b></div>
            <div className="muted">Account {loc.account} · {loc.characters.map((c) => `${c.name} (${c.mailCount})`).join(', ')}</div>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => choose(loc.serverDir)}>Use this folder</button>
          </div>
        ))}
      </div>

      <h3>Theme</h3>
      <div className="themes">
        {THEMES.map((t) => (
          <button
            key={t.id}
            data-theme={t.id}
            className={'theme-card' + (settings.theme === t.id ? ' on' : '')}
            aria-pressed={settings.theme === t.id}
            onClick={async () => { applyTheme(t.id); await api.setTheme(t.id); onChange() }}
          >
            <div className="name">{t.label}{settings.theme === t.id && <span className="check">SELECTED</span>}</div>
            <div className="blurb">{t.blurb}</div>
            <div className="swatches">
              <i style={{ background: 'var(--panel)' }} /><i style={{ background: 'var(--accent)' }} />
              <i style={{ background: 'var(--good)' }} /><i style={{ background: 'var(--warn)' }} /><i style={{ background: 'var(--bad)' }} />
            </div>
          </button>
        ))}
      </div>

      <h3>Low-stock warning</h3>
      <div className="panel">
        <p style={{ marginTop: 0 }} className="muted">Default level for items that don't have their own. You can set a different level on each item.</p>
        <div className="row">
          <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ width: 100 }} />
          <button className="btn" onClick={async () => { await api.setThreshold(Number(threshold) || 0); onChange() }}>Save</button>
        </div>
      </div>

      <h3>Updates</h3>
      <div className="panel">
        <p style={{ marginTop: 0 }} className="muted">
          When this is on, the installed app asks GitHub whether a newer version exists a few seconds after it starts, and downloads it quietly.
          The update installs when you close the app. Nothing about you or your sales is sent. This is the only time the app uses the internet.
        </p>
        <label className="row">
          <input type="checkbox" checked={settings.autoUpdate} onChange={async (e) => { await api.setAutoUpdate(e.target.checked); onChange() }} />
          Check for updates automatically
        </label>
      </div>

      <h3>Window</h3>
      <div className="panel">
        <p style={{ marginTop: 0 }} className="muted">F11 switches full screen on and off, Esc leaves full screen, and Ctrl+Q quits.</p>
        <div className="row">
          <button className="btn ghost" onClick={() => api.toggleFullScreen()}>Toggle full screen</button>
          <button className="btn" onClick={() => api.quitApp()}>Exit HoloNet Trader</button>
        </div>
      </div>
    </>
  )
}
