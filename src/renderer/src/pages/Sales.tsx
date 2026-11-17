import { useEffect, useState } from 'react'
import { cleanItemName } from '@shared/mailParser'
import type { CharacterInfo, SaleRow } from '@shared/types'
import { api, credits, dateTime } from '../api'
import CharacterSelect from '../components/CharacterSelect'
import DateRangeBar from '../components/DateRangeBar'
import { rangeBounds, type RangeValue } from '../dateRange'
import { loadCharacter, loadRange, saveCharacter, saveRange } from '../rangeStore'

const KINDS: Record<string, string> = { sale: 'Sold', purchase: 'Bought', unsold: 'Unsold', expired: 'Expired', offer_in: 'Offer received', offer_out: 'Offer made' }

function toCsv(rows: SaleRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Date', 'Character', 'Type', 'Vendor', 'Item', 'Qty', 'Uses', 'Credits', 'Buyer/Seller', 'City', 'Planet']
  const lines = rows.map((r) => [dateTime(r.ts), r.character, KINDS[r.kind] ?? r.kind, r.vendor, r.itemName ? cleanItemName(r.itemName) : '', r.quantity, r.uses, r.price, r.counterparty, r.city, r.planet].map(esc).join(','))
  return [head.join(','), ...lines].join('\r\n')
}

export default function Sales({ version, characters }: { version: number; characters: CharacterInfo[] }) {
  const [rows, setRows] = useState<SaleRow[]>([])
  const [kind, setKind] = useState('sale')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<RangeValue>(() => loadRange('sales'))
  const [character, setCharacter] = useState(loadCharacter)

  useEffect(() => {
    const { from, to } = rangeBounds(range)
    const t = setTimeout(() => api.events({ kinds: kind === 'all' ? Object.keys(KINDS) : [kind], search: search || undefined, from: from || undefined, to, character: characters.some((c) => c.name === character) ? character : undefined, limit: 2000 }).then(setRows), 200)
    return () => clearTimeout(t)
  }, [kind, search, range, character, characters, version])

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }))
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
        <DateRangeBar value={range} onChange={(v) => { setRange(v); saveRange('sales', v) }} />
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
