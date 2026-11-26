import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cleanItemName } from '@shared/mailParser'
import type { CharacterInfo, InventoryItem, Structure, StructureMail } from '@shared/types'
import { needsRestock } from '@shared/stock'
import { formatHours, needsAttention, POOL_LABEL, upkeepPerDay } from '@shared/structures'
import { useNow } from './Structures'
import { api, credits, type Settings, type Summary, type VendorAlert } from '../api'
import CharacterSelect from '../components/CharacterSelect'
import DateRangeBar from '../components/DateRangeBar'
import { rangeBounds, type RangeValue } from '../dateRange'
import { loadCharacter, loadRange, saveCharacter, saveRange } from '../rangeStore'

export default function Dashboard({ version, items, settings, characters }: { version: number; items: InventoryItem[]; settings: Settings; characters: CharacterInfo[] }) {
  const [range, setRange] = useState<RangeValue>(() => loadRange('dashboard'))
  const [character, setCharacter] = useState(loadCharacter)
  const [s, setS] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<VendorAlert[]>([])
  const [structures, setStructures] = useState<Structure[]>([])

  useEffect(() => {
    const { from, to } = rangeBounds(range)
    api.summary(from, to, characters.some((c) => c.name === character) ? character : undefined).then(setS)
    api.vendorAlerts().then(setAlerts)
  }, [range, character, characters, version])
  useEffect(() => {
    api.structures().then(setStructures)
    api.structureMails().then(setMails)
  }, [version])
  const [mails, setMails] = useState<StructureMail[]>([])
  // Empty-pool mails from the last 7 days, unless a newer reading shows the pool was topped up since.
  const bankPaying = mails.filter((m) => {
    if (m.kind !== 'structure_maint' || Date.now() / 1000 - m.ts > 7 * 86400) return false
    const s = structures.find((x) => x.id === m.structureId)
    return !s?.latest.maint || s.latest.maint.ts <= m.ts || s.latest.maint.value === 0
  })

  const low = items.filter((i) => needsRestock(i, settings.lowThreshold))
  const t = s?.totals
  const net = t && s ? t.revenue - s.spent.spent : 0
  // Plain total: units on hand times the cost each that was entered. No cost entered adds 0; archived items are left out.
  const inventoryValue = items.reduce((sum, i) => (i.archived ? sum : sum + i.onHand * i.costEach), 0)
  const now = useNow()
  const due = needsAttention(structures, now)
  const upkeep = upkeepPerDay(structures)

  return (
    <>
      <h2>Dashboard</h2>
      {low.length > 0 && (
        <div className="banner bad">
          <b>Restock needed:</b> {low.map((i) => `${i.name} (${i.onHand})`).join(', ')}
        </div>
      )}
      {bankPaying.length > 0 && (
        <div className="banner bad">
          <b>Maintenance pool empty:</b> {[...new Set(bankPaying.map((m) => `${m.name} (${m.character})`))].join(', ')}. The game is taking upkeep from your bank.
        </div>
      )}
      {alerts.length > 0 && Date.now() / 1000 - alerts[0]!.ts < 7 * 86400 && (
        <div className="banner">
          Vendor notice: {alerts[0]!.kind === 'vendor_maint' ? 'a vendor has an empty maintenance pool' : `${alerts[0]!.vendor} is empty`} ({alerts[0]!.character}).
        </div>
      )}
      <div className="filters">
        <DateRangeBar value={range} onChange={(v) => { setRange(v); saveRange('dashboard', v) }} />
        <CharacterSelect characters={characters} value={character} onChange={(c) => { setCharacter(c); saveCharacter(c) }} />
      </div>
      {s && t && (
        <>
          <div className="stats">
            <div className="card"><div className="label">Revenue</div><div className="value">{credits(t.revenue)}</div><div className="sub">credits from sales</div></div>
            <div className="card"><div className="label">Sales</div><div className="value">{credits(t.sales)}</div><div className="sub">{credits(t.units)} units sold</div></div>
            <div className="card"><div className="label">Average sale</div><div className="value">{t.sales ? credits(t.revenue / t.sales) : '—'}</div><div className="sub">credits per sale</div></div>
            <div className="card"><div className="label">Spent on purchases</div><div className="value">{credits(s.spent.spent)}</div><div className="sub">bought from other vendors</div></div>
            <div className="card"><div className="label">Net after purchases</div><div className={'value ' + (net >= 0 ? 'pos' : 'neg')}>{(net >= 0 ? '+' : '−') + credits(Math.abs(net))}</div><div className="sub">revenue minus purchases</div></div>
            <div className="card"><div className="label">Inventory value</div><div className="value">{credits(inventoryValue)}</div><div className="sub">on hand × cost each, now</div></div>
            {structures.length > 0 && (
              <div className="card"><div className="label">Structure upkeep</div><div className="value">{credits(upkeep)}</div><div className="sub">credits a day, about {credits(upkeep * 30)} a month</div></div>
            )}
          </div>
          {due.length > 0 && (
            <>
              <h3>Needs attention</h3>
              <div className="panel">
                <table>
                  <thead><tr><th>Structure</th><th>Character</th><th>What</th><th className="num">Time left</th></tr></thead>
                  <tbody>
                    {due.map((d) => (
                      <tr key={`${d.id}-${d.what}`}>
                        <td>{d.name}</td>
                        <td>{d.character}</td>
                        <td>{POOL_LABEL[d.what]}</td>
                        <td className="num" style={d.level === 'urgent' ? { color: 'var(--bad)', fontWeight: 600 } : { color: 'var(--warn)' }}>{formatHours(d.hoursLeft)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <h3>Revenue per day</h3>
          <div className="panel" style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={s.byDay}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }} formatter={(v) => credits(Number(v))} />
                <Bar dataKey="revenue" fill="var(--chart-bar)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid2">
            <div>
              <h3>Top items</h3>
              <div className="panel scroll"><Rank rows={s.topItems} /></div>
            </div>
            <div>
              <h3>By vendor</h3>
              <div className="panel scroll"><Rank rows={s.byVendor} /></div>
              <h3>By character</h3>
              <div className="panel"><Rank rows={s.byCharacter} /></div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function Rank({ rows }: { rows: { name: string; sales: number; revenue: number }[] }) {
  if (!rows.length) return <div className="muted">No sales in this period.</div>
  return (
    <table>
      <thead><tr><th>Name</th><th className="num">Sales</th><th className="num">Credits</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.name}><td>{cleanItemName(r.name)}</td><td className="num">{credits(r.sales)}</td><td className="num">{credits(r.revenue)}</td></tr>)}</tbody>
    </table>
  )
}
