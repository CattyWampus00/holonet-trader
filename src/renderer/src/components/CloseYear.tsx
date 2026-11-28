import { useState } from 'react'
import { api, credits, type ArchiveResult } from '../api'

const CHECKS = [
  'I ran /mailsave on every character, so all of the year\'s sales mail is in.',
  'Sales not matched (Inventory tab) are linked or ignored, so the year\'s totals are complete.',
  'I counted my vendor stock and fixed the on-hand numbers. They carry into the new year.'
]

/**
 * Year-end close (docs/YEAR_END_PLAN.md, Step 3). A checklist, then a folder for the archive. The year closes only
 * after its archive is saved and checked; cancelling or an error leaves it open. Nothing is deleted.
 */
export default function CloseYearModal({ year, onClose, onDone }: { year: number; onClose: () => void; onDone: () => void }) {
  const [ticked, setTicked] = useState(CHECKS.map(() => false))
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<ArchiveResult | { error: string } | null>(null)
  const done = out && !('error' in out)

  const close = async () => {
    setBusy(true)
    const r = await api.closeYear(year)
    setBusy(false)
    if (!r) return // folder picker cancelled: nothing happened
    setOut(r)
    if (!('error' in r)) onDone()
  }

  return (
    <div className="modal-back" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h3 style={{ marginTop: 0 }}>Close the {year} financial year</h3>
        {!done ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              The Dashboard, Sales Log and Customers start fresh on 1 Jan {year + 1}. Nothing is deleted: Prices keeps every
              year, your stock and structures carry on, and {year} is saved as an archive in a folder you choose.
              You can reopen {year} in Settings.
            </p>
            {CHECKS.map((c, i) => (
              <label key={c} className="check">
                <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />
                <span>{c}</span>
              </label>
            ))}
            {out && 'error' in out && <div className="banner bad" style={{ marginTop: 12 }}>{out.error}</div>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn" disabled={busy || !ticked.every(Boolean)} onClick={close}>
                {busy ? 'Saving the archive…' : `Choose folder and close ${year}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              {year} is closed. Its archive is saved and checked: {credits(out.sales)} sales and {credits(out.purchases)} purchases.
            </p>
            <p className="muted">Folder: {out.folder}. Back it up like any important document.</p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn ghost" onClick={() => api.openArchiveFolder()}>Open folder</button>
              <button className="btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
