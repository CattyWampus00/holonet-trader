import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cleanItemName } from '@shared/mailParser'
import type { CharacterInfo, InventoryItem } from '@shared/types'
import { getStockStatus } from '@shared/stock'
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

  useEffect(() => {
    const { from, to } = rangeBounds(range)
    api.summary(from, to, characters.some((c) => c.name === character) ? character : undefined).then(setS)
    api.vendorAlerts().then(setAlerts)
  }, [range, character, characters, version])

  const low = items.filter((i) => getStockStatus(i.onHand, i.lowThreshold, settings.lowThreshold) !== 'ok')
  const t = s?.totals
  const profit = t ? t.costedRevenue - t.cost : 0
  const hasCosts = !!t && t.cost > 0 // profit only means something once the player has entered item costs
  const net = t && s ? t.revenue - s.spent.spent : 0

  return (
    <>
      <h2>Dashboard</h2>
      {low.length > 0 && (
        <div className="banner bad">
          <b>Restock needed:</b> {low.map((i) => `${i.name} (${i.onHand})`).join(', ')}
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
            {hasCosts && <div className="card"><div className="label">Profit</div><div className={'value ' + (profit >= 0 ? 'pos' : 'neg')}>{credits(profit)}</div><div className="sub">on sales with a cost entered</div></div>}
          </div>
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
      <tbody>{rows.map((r) => <tr key={r.name}><td>{cleanItemName(r.name)}</td><td className="num">{r.sales}</td><td className="num">{credits(r.revenue)}</td></tr>)}</tbody>
    </table>
  )
}
