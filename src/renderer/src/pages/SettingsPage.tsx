import { useEffect, useState } from 'react'
import type { DetectedLocation, ScanResult } from '@shared/types'
import { THEMES } from '@shared/themes'
import { api, credits, type ArchiveResult, type Settings } from '../api'
import { applyTheme } from '../theme'
import CloseYearModal from '../components/CloseYear'
import { canCloseYear } from '@shared/yearArchive'

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

      <FinancialYear settings={settings} onChange={onChange} />
      <YearArchive />

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

/**
 * Year archive (docs/YEAR_END_PLAN.md, Step 2): save any year's sales to a folder of your choice. Reading only:
 * nothing in the app changes. Closing a year (Step 3) will use the same files.
 */
function YearArchive() {
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<ArchiveResult | { error: string } | null>(null)
  useEffect(() => { api.salesYears().then((y) => { setYears(y); setYear(y[0] ?? null) }) }, [])

  const save = async () => {
    if (year == null) return
    setBusy(true)
    setOut(null)
    const r = await api.exportYear(year)
    setBusy(false)
    if (r) setOut(r)
  }

  return (
    <>
      <h3>Year archive</h3>
      <div className="panel">
        <p style={{ marginTop: 0 }} className="muted">
          Saves a year's sales to a folder you choose: a full copy of the app's data, plus Sales, Customers and Summary
          spreadsheets that open in Excel. Nothing in the app is changed or deleted. Saving the same year again replaces its files.
        </p>
        {years.length === 0 ? <div className="muted">No sales yet.</div> : (
          <div className="row">
            <select value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn" disabled={busy || year == null} onClick={save}>{busy ? 'Saving…' : `Save ${year ?? ''} archive…`}</button>
          </div>
        )}
        {out && 'error' in out && <div className="banner bad" style={{ marginTop: 12, marginBottom: 0 }}>{out.error}</div>}
        {out && !('error' in out) && (
          <div className="banner row" style={{ marginTop: 12, marginBottom: 0, justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
            <span>Saved {out.files.length} files: {credits(out.sales)} sales and {credits(out.purchases)} purchases, checked against the copy. Folder: {out.folder}</span>
            <button className="btn ghost" onClick={() => api.openArchiveFolder()}>Open folder</button>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Year-end close (docs/YEAR_END_PLAN.md, Step 3): which financial year the Dashboard, Sales Log and Customers show,
 * closing a year that has ended (or from Dec 26), and reopening the newest closed year. Nothing is ever deleted.
 */
function FinancialYear({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const [years, setYears] = useState<number[]>([])
  const [closing, setClosing] = useState<number | null>(null)
  const [confirmReopen, setConfirmReopen] = useState(false)
  useEffect(() => { api.salesYears().then(setYears) }, [settings])
  const closed = settings.closedYears
  const newest = closed.length ? Math.max(...closed) : null
  const closable = years.filter((y) => canCloseYear(y, new Date(), closed)).sort((a, b) => a - b)
  const day = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const thisYear = new Date().getFullYear()

  return (
    <>
      <h3>Financial year</h3>
      <div className="panel">
        <p style={{ marginTop: 0 }}>
          {settings.salesYearStart == null
            ? <>No year closed yet: the Dashboard, Sales Log and Customers include every sale.</>
            : <>The Dashboard, Sales Log and Customers show sales since <b>{day(settings.salesYearStart)}</b>. Closed: {[...closed].sort().join(', ')}. Prices keeps every year.</>}
        </p>
        <div className="row">
          {closable.map((y) => <button key={y} className="btn" onClick={() => setClosing(y)}>Close {y}…</button>)}
          {closable.length === 0 && <span className="muted">Closing {thisYear} becomes possible on 26 Dec {thisYear}.</span>}
          {newest != null && !confirmReopen && <button className="btn ghost" onClick={() => setConfirmReopen(true)}>Reopen {newest}…</button>}
        </div>
        {newest != null && confirmReopen && (
          <div className="banner row" style={{ marginTop: 12, marginBottom: 0, justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
            <span>Reopen {newest}? Its sales show again on the Dashboard, Sales Log and Customers. Its archive files stay where they are.</span>
            <span className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <button className="btn" onClick={async () => { await api.reopenYear(newest); setConfirmReopen(false); onChange() }}>Reopen</button>
              <button className="btn ghost" onClick={() => setConfirmReopen(false)}>Cancel</button>
            </span>
          </div>
        )}
      </div>
      {closing != null && <CloseYearModal year={closing} onClose={() => setClosing(null)} onDone={onChange} />}
    </>
  )
}
