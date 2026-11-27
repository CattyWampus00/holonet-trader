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
  // Empty-pool mails from the last 7 days that were not dismissed (by hand, or by a later maintenance reading above 0).
  const emptyPool = mails.filter((m) => {
    if ((m.kind !== 'structure_maint' && m.kind !== 'vendor_maint') || m.dismissed || Date.now() / 1000 - m.ts > 7 * 86400) return false
    const s = structures.find((x) => x.id === m.structureId)
    return !s?.latest.maint || s.latest.maint.ts <= m.ts || s.latest.maint.value === 0
  })
  const bankPaying = emptyPool.filter((m) => m.kind === 'structure_maint')
  // A vendor with an empty pool is switched off and can be destroyed with its items, so it gets its own, stronger banner.
  const vendorsOff = emptyPool.filter((m) => m.kind === 'vendor_maint')
  const nameOf = (m: StructureMail) => structures.find((x) => x.id === m.structureId)?.name ?? m.name
  const dismiss = async (list: StructureMail[]) => { for (const m of list) await api.dismissMail(m.id); setMails(await api.structureMails()) }

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
        <div className="banner bad row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
          <span>
            <b>Maintenance pool empty:</b> {[...new Set(bankPaying.map((m) => `${nameOf(m)} (${m.character})`))].join(', ')}. The game is taking upkeep from your bank.
            {bankPaying.some((m) => m.structureId == null) && ' Not matched to a structure in the app: add it or use Link to… on the Structures tab.'}
            {' '}Entering a maintenance reading clears this.
          </span>
          <button className="btn ghost" title="Hide this notice" onClick={() => dismiss(bankPaying)}>Dismiss</button>
        </div>
      )}
      {vendorsOff.length > 0 && (
        <div className="banner bad row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
          <span>
            <b>Vendor switched off:</b>{' '}
            {[...new Set(vendorsOff.map((m) => `${m.structureId != null ? nameOf(m) : `a vendor${m.planet ? ` on ${m.planet}` : ''}`} (${m.character})`))].join(', ')}.
            {' '}Its maintenance pool is empty, so it can't list or take items, and it and its items can be destroyed. Add maintenance now.
            {vendorsOff.some((m) => m.structureId == null) && ' The mail gives only its spot: use Link to… on the Structures tab to say which vendor it is.'}
          </span>
          <button className="btn ghost" title="Hide this notice" onClick={() => dismiss(vendorsOff)}>Dismiss</button>
        </div>
      )}
      {(() => {
        // "Vendor is empty" stays here; empty maintenance pools are shown above. Dismissed notices are left out by the query.
        const empty = alerts.filter((a) => a.kind === 'vendor_empty' && Date.now() / 1000 - a.ts < 7 * 86400)
        return empty.length > 0 && (
          <div className="banner row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
            <span>Vendor empty: {[...new Set(empty.map((a) => `${a.vendor ?? 'a vendor'} (${a.character})`))].join(', ')}.</span>
            <button className="btn ghost" title="Hide this notice" onClick={async () => { for (const a of empty) await api.dismissMail(a.id); setAlerts(await api.vendorAlerts()) }}>Dismiss</button>
          </div>
        )
      })()}
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
