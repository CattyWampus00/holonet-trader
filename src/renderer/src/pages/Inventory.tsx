import { useEffect, useState } from 'react'
import { cleanItemName, newItemName } from '@shared/mailParser'
import type { InventoryItem } from '@shared/types'
import { getStockStatus } from '@shared/stock'
import { api, credits, type ItemInput, type LinkedName, type Settings, type Unmatched } from '../api'

interface Props { version: number; items: InventoryItem[]; settings: Settings; onChange: () => void }
const blank: ItemInput = { name: '', onHand: 0, costEach: 0, lowThreshold: null, notes: '' }

export default function Inventory({ version, items, settings, onChange }: Props) {
  const [editing, setEditing] = useState<ItemInput | null>(null)
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null)
  const [unmatched, setUnmatched] = useState<Unmatched[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => { api.unmatched().then(setUnmatched) }, [version])

  const shown = items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <h2>Inventory</h2>
      <div className="row">
        <button className="btn" onClick={() => setEditing({ ...blank })}>Add item</button>
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">Stock counts are in single units. A sold crate of 25 removes 25.</span>
      </div>
      <div className="panel scroll">
        <table>
          <thead><tr><th>Item</th><th>Status</th><th className="num">On hand</th><th className="num">Warn at</th><th className="num">Cost each</th><th /></tr></thead>
          <tbody>
            {shown.map((i) => {
              const st = getStockStatus(i.onHand, i.lowThreshold, settings.lowThreshold)
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td><span className={`pill ${st}`}>{st === 'ok' ? 'OK' : st === 'low' ? 'Low' : 'Out'}</span></td>
                  <td className="num">{credits(i.onHand)}</td>
                  <td className="num">{i.lowThreshold ?? <span className="muted">{settings.lowThreshold}</span>}</td>
                  <td className="num">{i.costEach ? credits(i.costEach) : ''}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost" onClick={() => setAdjusting(i)}>Restock / adjust</button>{' '}
                    <button className="btn ghost" onClick={() => setEditing({ id: i.id, name: i.name, onHand: i.onHand, costEach: i.costEach, lowThreshold: i.lowThreshold, notes: i.notes })}>Edit</button>
                  </td>
                </tr>
              )
            })}
            {!shown.length && <tr><td colSpan={6} className="muted">No items yet. Add what you have in your vendors and bank.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Sales not matched to inventory</h3>
      <div className="panel scroll">
        <p className="muted" style={{ marginTop: 0 }}>
          Link a sale name to an item once and HoloNet Trader remembers it, so future sales reduce stock automatically.
          Names that match an item exactly are linked without asking.
        </p>
        <table>
          <thead><tr><th>Name in sale mails</th><th className="num">Sales</th><th className="num">Units</th><th>Link to</th></tr></thead>
          <tbody>
            {unmatched.slice(0, 50).map((u) => (
              <tr key={u.key}>
                <td>{cleanItemName(u.name)}</td><td className="num">{u.sales}</td><td className="num">{credits(u.units)}</td>
                <td>
                  <select value="" onChange={async (e) => {
                    if (e.target.value === 'new') setEditing({ ...blank, name: newItemName(u.name, u.key) })
                    else if (e.target.value) { await api.linkAlias(u.key, Number(e.target.value)); onChange() }
                  }}>
                    <option value="">Choose…</option>
                    <option value="new">+ New item with this name</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditModal item={editing} onClose={() => setEditing(null)} onSave={async (i) => { await api.saveItem(i); setEditing(null); onChange() }}
        onDelete={editing.id ? async () => { await api.deleteItem(editing.id!); setEditing(null); onChange() } : undefined} onChanged={onChange} />}
      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onSave={async (d, reason) => { await api.adjustStock(adjusting.id, d, reason); setAdjusting(null); onChange() }} />}
    </>
  )
}

/** Sale names that were linked to this item by hand, each with an Unlink button to undo a wrong link. */
function LinkedNames({ itemId, onUnlinked }: { itemId: number; onUnlinked: (givenBack: number) => void }) {
  const [links, setLinks] = useState<LinkedName[]>([])
  const load = () => api.linkedNames(itemId).then(setLinks)
  useEffect(() => { load() }, [itemId])
  if (!links.length) return null
  const unlink = async (l: LinkedName) => {
    const name = cleanItemName(l.name)
    if (!confirm(`Unlink "${name}" from this item?\n\nIts ${l.sales} sale(s) go back to "Sales not matched", and any stock they took off this item is given back.`)) return
    const givenBack = await api.unlinkAlias(l.key)
    await load()
    onUnlinked(givenBack)
  }
  return (
    <>
      <label>Sale names linked to this item</label>
      {links.map((l) => (
        <div key={l.key} className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}>
          <span>{cleanItemName(l.name)} <span className="muted">({l.sales} sale{l.sales === 1 ? '' : 's'})</span></span>
          <button className="btn ghost" onClick={() => unlink(l)}>Unlink</button>
        </div>
      ))}
    </>
  )
}

function EditModal({ item, onClose, onSave, onDelete, onChanged }: { item: ItemInput; onClose: () => void; onSave: (i: ItemInput) => void; onDelete?: () => void; onChanged: () => void }) {
  const [f, setF] = useState(item)
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{item.id ? 'Edit item' : 'Add item'}</h2>
        <label>Name (as it appears in sale mails)</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <label>On hand (units)</label>
        <input type="number" min={0} value={f.onHand} onChange={(e) => setF({ ...f, onHand: num(e.target.value) })} />
        <label>Cost each (credits, optional)</label>
        <input type="number" min={0} value={f.costEach} onChange={(e) => setF({ ...f, costEach: num(e.target.value) })} />
        <label>Warn when at or below (blank = default)</label>
        <input type="number" min={0} value={f.lowThreshold ?? ''} onChange={(e) => setF({ ...f, lowThreshold: e.target.value === '' ? null : num(e.target.value) })} />
        <label>Notes</label>
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        {item.id && <LinkedNames itemId={item.id} onUnlinked={(givenBack) => { setF((p) => ({ ...p, onHand: p.onHand + givenBack })); onChanged() }} />}
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span>{onDelete && <button className="btn danger" onClick={() => confirm('Delete this item?') && onDelete()}>Delete</button>}</span>
          <span><button className="btn ghost" onClick={onClose}>Cancel</button>{' '}<button className="btn" disabled={!f.name.trim()} onClick={() => onSave(f)}>Save</button></span>
        </div>
      </div>
    </div>
  )
}

function AdjustModal({ item, onClose, onSave }: { item: InventoryItem; onClose: () => void; onSave: (delta: number, reason: string) => void }) {
  const [amount, setAmount] = useState('0')
  const [reason, setReason] = useState('restock')
  const n = Math.floor(Number(amount) || 0)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{item.name}</h2>
        <p className="muted">On hand now: {credits(item.onHand)}. Use a negative number to remove stock (lost, gifted, used).</p>
        <label>Change by</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <label>Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }}>
          <option value="restock">Restock</option><option value="correction">Count correction</option><option value="loss">Lost / used / gifted</option>
        </select>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={n === 0} onClick={() => onSave(n, reason)}>Apply</button>
        </div>
      </div>
    </div>
  )
}
