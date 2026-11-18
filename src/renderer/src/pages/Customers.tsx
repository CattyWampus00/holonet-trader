import { useEffect, useMemo, useState } from 'react'
import type { CharacterInfo, CustomerRow } from '@shared/types'
import { api, credits, dateTime } from '../api'
import CharacterSelect from '../components/CharacterSelect'
import DateRangeBar from '../components/DateRangeBar'
import { rangeBounds, type RangeValue } from '../dateRange'
import { loadCharacter, loadRange, saveCharacter, saveRange } from '../rangeStore'

type SortKey = 'name' | 'credits' | 'purchases' | 'items' | 'lastTs'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Customer' },
  { key: 'credits', label: 'Credits spent', num: true },
  { key: 'purchases', label: 'Purchases', num: true },
  { key: 'items', label: 'Items', num: true },
  { key: 'lastTs', label: 'Last bought', num: true }
]

export default function Customers({ version, characters }: { version: number; characters: CharacterInfo[] }) {
  const [range, setRange] = useState<RangeValue>(() => loadRange('customers'))
  const [character, setCharacter] = useState(loadCharacter)
  const [rows, setRows] = useState<CustomerRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'credits', dir: 'desc' })

  useEffect(() => {
    const { from, to } = rangeBounds(range)
    const ch = characters.some((c) => c.name === character) ? character : undefined
    api.customerList(from, to, ch).then(setRows)
  }, [range, character, characters, version])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sign = sort.dir === 'asc' ? 1 : -1
    const list = (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q))
    return list.sort((a, b) =>
      sign * (sort.key === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a[sort.key] - b[sort.key]) ||
      b.credits - a.credits || a.name.localeCompare(b.name))
  }, [rows, search, sort])

  const clickHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))

  const total = shown.reduce((n, r) => n + r.credits, 0)

  return (
    <>
      <h2>Customers</h2>
      <div className="filters">
        <DateRangeBar value={range} onChange={(v) => { setRange(v); saveRange('customers', v) }} />
        <CharacterSelect characters={characters} value={character} onChange={(c) => { setCharacter(c); saveCharacter(c) }} />
      </div>
      <div className="row">
        <input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <span className="muted">
          {rows ? `${shown.length} of ${rows.length} customers · ${credits(total)} credits` : 'Loading…'} · items: a crate counts all its contents, a resource sale counts as 1
        </span>
      </div>

      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button className="sortbtn" onClick={() => clickHeader(c.key)}>
                    {c.label}
                    <span aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{credits(r.credits)}</td>
                <td className="num">{credits(r.purchases)}</td>
                <td className="num">{credits(r.items)}</td>
                <td className="num">{dateTime(r.lastTs)}</td>
              </tr>
            ))}
            {rows && shown.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="muted">No customers in this date range{character ? ` for ${character}` : ''}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
