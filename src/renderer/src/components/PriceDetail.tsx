import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { PricePointRow, PriceSeries } from '@shared/types'
import { api, dateTime } from '../api'
import { isResource } from '@shared/mailParser'
import { crateNote, formatPrice, TREND_LABEL } from '../format'
import { chartPoints, hasCrates, recentSales, valueOf, type Basis } from '../priceDetail'

const SHOWN = 50

interface Props {
  itemKey: string
  from: number
  to: number
  character?: string
  onClose: () => void
}

const shortDate = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const abbreviate = (v: number) => (v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(v))

/** Side panel with one item's price history: stat cards, a price-over-time chart and its sales. */
export default function PriceDetail({ itemKey, from, to, character, onClose }: Props) {
  const [data, setData] = useState<PriceSeries | null>(null)
  const [basis, setBasis] = useState<Basis>('unit')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setData(null)
    setShowAll(false)
    api.priceSeries(itemKey, from, to, character).then(setData)
  }, [itemKey, from, to, character])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const row = data?.row ?? null
  const crates = row ? hasCrates(row.crateSizes) : false
  const res = row ? isResource(row.name) : false // resources sell by amount (units), not crates
  const itemWord = res ? 'unit' : 'item'
  const lotWord = res ? 'sale' : 'crate'
  const effectiveBasis: Basis = crates ? basis : 'unit'
  const points = useMemo(() => chartPoints(data?.points ?? [], effectiveBasis), [data, effectiveBasis])
  const sales = useMemo(() => recentSales(data?.points ?? [], SHOWN, showAll), [data, showAll])
  const trend = row ? TREND_LABEL[row.trend] : null
  // When every sale has the same price the axis would collapse into repeated labels, so give it room.
  const ys = points.map((c) => c.y)
  const flatPrice = ys.length > 0 && Math.min(...ys) === Math.max(...ys)
  const yDomain: [number | 'auto', number | 'auto'] = flatPrice ? [Math.floor(ys[0]! * 0.8), Math.ceil(ys[0]! * 1.2)] : ['auto', 'auto']

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={row ? `Price history for ${row.name}` : 'Price history'} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2 style={{ margin: 0 }}>{row?.name ?? 'Loading…'}</h2>
            {row && <div className="muted small">{row.sales.toLocaleString('en-US')} sales · {row.units.toLocaleString('en-US')} units{crateNote(row.crateSizes, res) ? ` · ${crateNote(row.crateSizes, res)}` : ''}</div>}
          </div>
          <button className="btn ghost" onClick={onClose} autoFocus aria-label="Close price history">Close</button>
        </div>

        {data && !row && <p className="muted">No sales of this item in the selected date range{character ? ` for ${character}` : ''}.</p>}

        {row && (
          <>
            <div className="stats">
              <div className="card"><div className="label">Last sold</div><div className="value">{formatPrice(row.lastUnitPrice)}</div><div className="sub">{new Date(row.lastTs * 1000).toLocaleDateString()}</div></div>
              <div className="card">
                <div className="label">Recent price</div><div className="value">{formatPrice(row.recentMedian)}</div>
                <div className="sub"><span className={`trend ${row.trend}`}>{trend?.arrow && <span aria-hidden="true">{trend.arrow} </span>}{trend?.word}</span></div>
              </div>
              <div className="card"><div className="label">Average</div><div className="value">{formatPrice(row.average)}</div></div>
              <div className="card"><div className="label">Lowest</div><div className="value">{formatPrice(row.low)}</div></div>
              <div className="card"><div className="label">Highest</div><div className="value">{formatPrice(row.high)}</div></div>
            </div>
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              Recent price is the middle of the last 5 sales{row.previousMedian !== null ? `; the 5 before were ${formatPrice(row.previousMedian)}` : ' (a trend needs 7 or more sales)'}. Cards are always per single {itemWord}.
            </p>

            <div className="row" style={{ marginTop: 18 }}>
              <h3 style={{ margin: 0 }}>Price over time</h3>
              {crates && (
                <div className="seg" role="group" aria-label="Price basis">
                  <button className={basis === 'unit' ? 'on' : ''} aria-pressed={basis === 'unit'} onClick={() => setBasis('unit')}>Per {itemWord}</button>
                  <button className={basis === 'crate' ? 'on' : ''} aria-pressed={basis === 'crate'} onClick={() => setBasis('crate')}>Per {lotWord}</button>
                </div>
              )}
            </div>
            <div className="panel" style={{ height: 270 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--line)" />
                  <XAxis type="number" dataKey="x" domain={['dataMin', 'dataMax']} tickFormatter={shortDate} stroke="var(--muted)" fontSize={11} name="Date" scale="time" />
                  <YAxis type="number" dataKey="y" domain={yDomain} tickFormatter={abbreviate} stroke="var(--muted)" fontSize={11} width={56} name="Price" />
                  {effectiveBasis === 'unit' && <ReferenceLine y={row.recentMedian} stroke="var(--muted)" strokeDasharray="4 4" />}
                  <Tooltip cursor={{ stroke: 'var(--muted)' }} content={<PointTip basis={effectiveBasis} resource={res} />} />
                  {/* Dots only: joining them in time order makes bouncing prices look like noise. Slight transparency shows where sales cluster. */}
                  <Scatter data={points} fill="var(--chart-bar)" fillOpacity={0.7} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="muted small">{effectiveBasis === 'unit' ? `Each dot is one sale, priced per single ${itemWord}. The dashed line is the recent price.` : `Each dot is one sale at the full ${lotWord} price as sold.`}</div>

            <h3>{showAll ? 'All sales' : `Latest ${Math.min(SHOWN, data!.points.length)} sales`}</h3>
            <div className="panel scroll">
              <table>
                <thead>
                  <tr><th>Date</th><th className="num">{effectiveBasis === 'unit' ? `Per ${itemWord}` : res ? 'Sale price' : 'Crate price'}</th><th className="num">{res ? 'Units' : 'Qty'}</th><th>Vendor</th><th>Buyer</th><th>Character</th></tr>
                </thead>
                <tbody>
                  {sales.map((p: PricePointRow, i) => (
                    <tr key={`${p.ts}-${i}`}>
                      <td>{dateTime(p.ts)}</td><td className="num">{formatPrice(valueOf(p, effectiveBasis))}</td><td className="num">{p.quantity.toLocaleString('en-US')}</td>
                      <td>{p.vendor}</td><td>{p.buyer}</td><td>{p.character}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data!.points.length > SHOWN && (
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? `Show only the latest ${SHOWN}` : `Show all ${data!.points.length}`}
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  )
}

/** Hover card for a chart dot: date, price, crate size, vendor and buyer. */
function PointTip({ active, payload, basis, resource }: { active?: boolean; payload?: { payload?: { x: number; y: number; p: PricePointRow } }[]; basis: Basis; resource: boolean }) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  const q = d.p.quantity
  return (
    <div className="chart-tip">
      <div><b>{formatPrice(d.y)}</b> {basis === 'unit' ? (resource ? 'per unit' : 'per item') : (resource ? 'per sale' : 'per crate')}</div>
      <div>{dateTime(d.p.ts)}</div>
      <div>{resource ? `${q.toLocaleString('en-US')} units for ${formatPrice(d.p.price)}` : q > 1 ? `crate of ${q.toLocaleString('en-US')} for ${formatPrice(d.p.price)}` : 'single item'}</div>
      <div className="muted">{[d.p.vendor, d.p.buyer].filter(Boolean).join(' → ')}</div>
    </div>
  )
}
