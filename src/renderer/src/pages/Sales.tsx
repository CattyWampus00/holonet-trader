import { useEffect, useState } from 'react'
import { cleanItemName } from '@shared/mailParser'
import { EVENT_LABEL as KINDS, salesCsv } from '@shared/yearArchive'
import type { CharacterInfo, SaleRow } from '@shared/types'
import { api, credits, dateTime } from '../api'
import CharacterSelect from '../components/CharacterSelect'
import DateRangeBar from '../components/DateRangeBar'
import YearSelect, { usePastYears } from '../components/YearSelect'
import { viewBounds, type RangeValue } from '../dateRange'
import { loadCharacter, loadRange, saveCharacter, saveRange } from '../rangeStore'

export default function Sales({ version, characters, yearStart = null }: { version: number; characters: CharacterInfo[]; yearStart?: number | null }) {
  const [rows, setRows] = useState<SaleRow[]>([])
  const [kind, setKind] = useState('sale')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<RangeValue>(() => loadRange('sales'))
  const [character, setCharacter] = useState(loadCharacter)
  const years = usePastYears(version, yearStart)
  const [year, setYear] = useState<number | null>(null) // a closed year to look back at; null = the current year
  const viewYear = year != null && years.includes(year) ? year : null

  useEffect(() => {
    const { from, to } = viewBounds(range, yearStart, viewYear)
    const t = setTimeout(() => api.events({ kinds: kind === 'all' ? Object.keys(KINDS) : [kind], search: search || undefined, from: from || undefined, to, character: characters.some((c) => c.name === character) ? character : undefined, limit: 2000 }).then(setRows), 200)
    return () => clearTimeout(t)
  }, [kind, search, range, character, characters, version, yearStart, viewYear])

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([salesCsv(rows, dateTime)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'holonet-trader-sales.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <h2>Sales Log</h2>
      <div className="filters">
        <YearSelect years={years} value={viewYear} yearStart={yearStart} onChange={setYear} />
        {viewYear == null
          ? <DateRangeBar value={range} yearStart={yearStart} onChange={(v) => { setRange(v); saveRange('sales', v) }} />
          : <span className="muted">All of {viewYear}, a closed year. Its full list is in the archive's Sales-{viewYear}.csv.</span>}
        <CharacterSelect characters={characters} value={character} onChange={(c) => { setCharacter(c); saveCharacter(c) }} />
      </div>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Everything</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Search item, vendor, buyer…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 280 }} />
        <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        <span className="muted">{rows.length} shown (newest first, max 2000)</span>
      </div>
      <div className="panel scroll">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Item</th><th className="num">Qty</th><th className="num">Credits</th><th>Vendor</th><th>Buyer / Seller</th><th>Character</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{dateTime(r.ts)}</td><td>{KINDS[r.kind] ?? r.kind}</td><td>{r.itemName ? cleanItemName(r.itemName) : ''}{r.uses ? <span className="muted"> · {r.uses} uses</span> : null}</td>
                <td className="num">{credits(r.quantity)}</td><td className="num">{r.price ? credits(r.price) : ''}</td>
                <td>{r.vendor}</td><td>{r.counterparty}</td><td>{r.character}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
