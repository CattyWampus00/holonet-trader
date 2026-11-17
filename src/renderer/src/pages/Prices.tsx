import { useEffect, useMemo, useState } from 'react'
import type { CharacterInfo, PriceRow } from '@shared/types'
import { api } from '../api'
import CharacterSelect from '../components/CharacterSelect'
import DateRangeBar from '../components/DateRangeBar'
import PriceDetail from '../components/PriceDetail'
import { rangeBounds, type RangeValue } from '../dateRange'
import { isResource } from '@shared/mailParser'
import { crateNote, formatPrice, TREND_LABEL } from '../format'
import { filterPriceRows, sortPriceRows, type SortDir, type SortKey } from '../priceSort'
import { loadCharacter, loadRange, saveCharacter, saveRange } from '../rangeStore'

const MIN_SALES: { value: number; label: string }[] = [
  { value: 1, label: 'All items' },
  { value: 2, label: '2+ sales' },
  { value: 5, label: '5+ sales' },
  { value: 7, label: '7+ sales (with trend)' }
]

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'sales', label: 'Sales', num: true },
  { key: 'lastUnitPrice', label: 'Last price', num: true },
  { key: 'recentMedian', label: 'Recent price', num: true },
  { key: 'high', label: 'Low – High', num: true },
  { key: 'trend', label: 'Trend' },
  { key: 'lastTs', label: 'Last sold', num: true }
]

export default function Prices({ version, characters }: { version: number; characters: CharacterInfo[] }) {
  const [range, setRange] = useState<RangeValue>(() => loadRange('prices'))
  const [character, setCharacter] = useState(loadCharacter)
  const [rows, setRows] = useState<PriceRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [minSales, setMinSales] = useState(1)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'sales', dir: 'desc' })
  const [selected, setSelected] = useState<string | null>(null) // item key whose history is open

  useEffect(() => {
    const { from, to } = rangeBounds(range)
    const ch = characters.some((c) => c.name === character) ? character : undefined
    api.priceList(from, to, ch).then(setRows)
  }, [range, character, characters, version])

  const shown = useMemo(() => (rows ? sortPriceRows(filterPriceRows(rows, search, minSales), sort.key, sort.dir) : []), [rows, search, minSales, sort])

  const clickHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))

  return (
    <>
      <h2>Prices</h2>
      <div className="filters">
        <DateRangeBar value={range} onChange={(v) => { setRange(v); saveRange('prices', v) }} />
        <CharacterSelect characters={characters} value={character} onChange={(c) => { setCharacter(c); saveCharacter(c) }} />
      </div>
      <div className="row">
        <input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <select value={minSales} onChange={(e) => setMinSales(Number(e.target.value))} aria-label="Minimum sales">
          {MIN_SALES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="muted">
          {rows ? `${shown.length} of ${rows.length} items` : 'Loading…'} · prices are per single item (crates are divided by crate size, resources are priced per unit)
        </span>
      </div>

      <div className="panel scroll">
        <table className="prices">
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
            {shown.map((r) => {
              const t = TREND_LABEL[r.trend]
              const note = crateNote(r.crateSizes, isResource(r.name))
              return (
                <tr
                  key={r.key}
                  className="clickable"
                  tabIndex={0}
                  aria-label={`Open price history for ${r.name}`}
                  onClick={() => setSelected(r.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.key) } }}
                >
                  <td>
                    {r.name}
                    {note && <div className="muted small">{note}</div>}
                  </td>
                  <td className="num">{r.sales.toLocaleString('en-US')}</td>
                  <td className="num">{formatPrice(r.lastUnitPrice)}</td>
                  <td className="num"><b>{formatPrice(r.recentMedian)}</b></td>
                  <td className="num">{r.low === r.high ? formatPrice(r.low) : `${formatPrice(r.low)} – ${formatPrice(r.high)}`}</td>
                  <td>
                    <span
                      className={`trend ${r.trend}`}
                      title={r.previousMedian === null ? 'Needs 7 or more sales in this range' : `Latest 5 sales: ${formatPrice(r.recentMedian)}, the 5 before: ${formatPrice(r.previousMedian)}`}
                    >
                      {t.arrow && <span aria-hidden="true">{t.arrow} </span>}{t.word}
                    </span>
                  </td>
                  <td className="num">{new Date(r.lastTs * 1000).toLocaleDateString()}</td>
                </tr>
              )
            })}
            {rows && !shown.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="muted">
                  {rows.length ? 'No items match your search or filter.' : 'No sales in this date range for this character.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <PriceDetail
          itemKey={selected}
          from={rangeBounds(range).from}
          to={rangeBounds(range).to}
          character={characters.some((c) => c.name === character) ? character : undefined}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
