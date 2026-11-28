import { useEffect, useState } from 'react'
import { cleanItemName, newItemName } from '@shared/mailParser'
import type { InventoryItem } from '@shared/types'
import { costText, getStockStatus, parseCost } from '@shared/stock'
import { api, credits, type IgnoredName, type ItemInput, type LinkedName, type Settings, type Unmatched } from '../api'

interface Props { version: number; items: InventoryItem[]; settings: Settings; onChange: () => void }
const blank: ItemInput = { name: '', onHand: 0, costEach: 0, lowThreshold: null, notes: '' }

export default function Inventory({ version, items, settings, onChange }: Props) {
  const [editing, setEditing] = useState<ItemInput | null>(null)
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null)
  const [unmatched, setUnmatched] = useState<Unmatched[]>([])
  const [links, setLinks] = useState<LinkedName[]>([])
  const [ignored, setIgnored] = useState<IgnoredName[]>([])
  const [filter, setFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  // The name just ignored, for a one-click Undo next to the list (misclicks in the Link to menu are easy).
  const [lastIgnored, setLastIgnored] = useState<{ key: string; name: string } | null>(null)

  useEffect(() => {
    api.unmatched().then(setUnmatched)
    api.linkedNames().then(setLinks)
    api.ignoredNames().then(setIgnored)
  }, [version])

  const [unlinkingFor, setUnlinkingFor] = useState<InventoryItem | null>(null)

  const matching = items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()))
  const shown = matching.filter((i) => !i.archived)
  const archived = matching.filter((i) => i.archived)
  const archive = async (i: { id: number; name: string }) => {
    if (!confirm(`Archive "${i.name}"?\n\nUse this for things you won't stock again, like a resource that despawned. It leaves "Restock needed" and the inventory value, and its sales stay matched. Restocking it later brings it back.`)) return false
    await api.setArchived(i.id, true)
    onChange()
    return true
  }
  const linksOf = (itemId: number) => links.filter((l) => l.itemId === itemId)
  // One link: confirm and undo it straight away. Several: open a list so the player picks which one.
  const unlinkFrom = async (i: InventoryItem) => {
    const mine = linksOf(i.id)
    if (mine.length > 1) return setUnlinkingFor(i)
    if (mine[0] && (await askAndUnlink(mine[0])) !== null) onChange()
  }

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
              const mine = linksOf(i.id)
              return (
                <tr key={i.id}>
                  <td>
                    {i.name}
                    {mine.length > 0 && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        Also counts: {mine.map((l) => cleanItemName(l.name)).join(', ')}
                      </div>
                    )}
                  </td>
                  <td><span className={`pill ${st}`}>{st === 'ok' ? 'OK' : st === 'low' ? 'Low' : 'Out'}</span></td>
                  <td className="num">{credits(i.onHand)}</td>
                  <td className="num">{i.lowThreshold ?? <span className="muted">{settings.lowThreshold}</span>}</td>
                  <td className="num">{i.costEach ? costText(i.costEach) : ''}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {st === 'out' && <><button className="btn ghost" onClick={() => archive(i)}>Archive</button>{' '}</>}
                    {mine.length > 0 && <><button className="btn ghost" onClick={() => unlinkFrom(i)}>Unlink{mine.length > 1 ? ` (${mine.length})` : ''}</button>{' '}</>}
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

      {archived.length > 0 && <>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Archived ({archived.length})</h3>
          <button className="btn ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide' : 'Show'}</button>
        </div>
        {showArchived && (
          <div className="panel scroll">
            <p className="muted" style={{ marginTop: 0 }}>
              Items you no longer stock. Their sales stay matched and are still in your history. Restore one, or restock it, to make it active again.
            </p>
            <table>
              <thead><tr><th>Item</th><th className="num">On hand</th><th /></tr></thead>
              <tbody>
                {archived.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td className="num">{credits(i.onHand)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn ghost" onClick={async () => { await api.setArchived(i.id, false); onChange() }}>Restore</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      <h3>Sales not matched to inventory</h3>
      <div className="panel scroll">
        <p className="muted" style={{ marginTop: 0 }}>
          Link a sale name to an item once and HoloNet Trader remembers it, so future sales reduce stock automatically.
          Names that match an item exactly are linked without asking.
          {ignored.length > 0 && <> Ignored a name by mistake? <a href="#ignored-names" onClick={() => setShowIgnored(true)}>See ignored names ({ignored.length})</a>.</>}
        </p>
        {lastIgnored && (
          <div className="banner row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }}>
            <span>Ignored “{cleanItemName(lastIgnored.name)}”. Its sales no longer show here.</span>
            <button className="btn ghost" onClick={async () => { await api.unignoreName(lastIgnored.key); setLastIgnored(null); onChange() }}>Undo</button>
          </div>
        )}
        <table>
          <thead><tr><th>Name in sale mails</th><th className="num">Sales</th><th className="num">Units</th><th>Link to</th></tr></thead>
          <tbody>
            {unmatched.slice(0, 50).map((u) => (
              <tr key={u.key}>
                <td>{cleanItemName(u.name)}</td><td className="num">{u.sales}</td><td className="num">{credits(u.units)}</td>
                <td>
                  <select value="" onChange={async (e) => {
                    if (e.target.value === 'new') setEditing({ ...blank, name: newItemName(u.name, u.key) })
                    else if (e.target.value === 'ignore') { await api.ignoreName(u.key); setLastIgnored({ key: u.key, name: u.name }); onChange() }
                    else if (e.target.value) { await api.linkAlias(u.key, Number(e.target.value)); onChange() }
                  }}>
                    <option value="">Choose…</option>
                    <option value="new">+ New item with this name</option>
                    <option value="ignore">Ignore this name (never stocked)</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.archived ? ' (archived)' : ''}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ignored.length > 0 && <>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 id="ignored-names">Ignored sale names ({ignored.length})</h3>
          <button className="btn ghost" onClick={() => setShowIgnored(!showIgnored)}>{showIgnored ? 'Hide' : 'Show'}</button>
        </div>
        {showIgnored && (
          <div className="panel scroll">
            <table>
              <thead><tr><th>Name in sale mails</th><th className="num">Sales</th><th /></tr></thead>
              <tbody>
                {ignored.map((g) => (
                  <tr key={g.key}>
                    <td>{cleanItemName(g.name)}</td>
                    <td className="num">{g.sales}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn ghost" onClick={async () => { await api.unignoreName(g.key); onChange() }}>Un-ignore</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {links.length > 0 && <>
        <h3>Linked sale names</h3>
        <div className="panel scroll">
          <p className="muted" style={{ marginTop: 0 }}>
            Every sale name you linked by hand, and the item it counts against. If one looks wrong, Unlink it: its stock is given back
            and the name returns to the list above.
          </p>
          <table>
            <thead><tr><th>Name in sale mails</th><th>Counts against item</th><th className="num">Sales</th><th /></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.key}>
                  <td>{cleanItemName(l.name)}</td>
                  <td>{l.itemName}</td>
                  <td className="num">{l.sales}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost" onClick={async () => { if ((await askAndUnlink(l)) !== null) onChange() }}>Unlink</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {editing && <EditModal item={editing} onClose={() => setEditing(null)} onSave={async (i) => { await api.saveItem(i); setEditing(null); onChange() }}
        onDelete={editing.id ? async () => { await api.deleteItem(editing.id!); setEditing(null); onChange() } : undefined}
        onArchive={editing.id ? async () => { if (await archive({ id: editing.id!, name: editing.name })) setEditing(null) } : undefined}
        onChanged={onChange} />}
      {unlinkingFor && (
        <div className="modal-back" onClick={() => setUnlinkingFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Unlink from {unlinkingFor.name}</h2>
            <LinkedNames itemId={unlinkingFor.id} onUnlinked={() => onChange()} />
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setUnlinkingFor(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onSave={async (d, reason) => { await api.adjustStock(adjusting.id, d, reason); setAdjusting(null); onChange() }} />}
    </>
  )
}

/** Confirms, then undoes one link. Resolves to the units given back, or null if the player said no. */
async function askAndUnlink(l: LinkedName): Promise<number | null> {
  if (!confirm(`Unlink "${cleanItemName(l.name)}" from "${l.itemName}"?\n\nIts ${l.sales} sale(s) go back to "Sales not matched", and any stock they took off "${l.itemName}" is given back.`)) return null
  return api.unlinkAlias(l.key)
}

/** Sale names that were linked to this item by hand, each with an Unlink button to undo a wrong link. */
function LinkedNames({ itemId, onUnlinked }: { itemId: number; onUnlinked: (givenBack: number) => void }) {
  const [links, setLinks] = useState<LinkedName[]>([])
  const load = () => api.linkedNames(itemId).then(setLinks)
  useEffect(() => { load() }, [itemId])
  if (!links.length) return null
  const unlink = async (l: LinkedName) => {
    const givenBack = await askAndUnlink(l)
    if (givenBack === null) return
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

function EditModal({ item, onClose, onSave, onDelete, onArchive, onChanged }: { item: ItemInput; onClose: () => void; onSave: (i: ItemInput) => void; onDelete?: () => void; onArchive?: () => void; onChanged: () => void }) {
  const [f, setF] = useState(item)
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  // Cost is kept as typed text until Save: parsing each keystroke turned "0." into 0, so 0.5 could never be entered.
  const [cost, setCost] = useState(item.costEach ? String(item.costEach) : '')
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{item.id ? 'Edit item' : 'Add item'}</h2>
        <label>Name (as it appears in sale mails)</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <label>On hand (units)</label>
        <input type="number" min={0} value={f.onHand} onChange={(e) => setF({ ...f, onHand: num(e.target.value) })} />
        <label>Cost each (credits, optional)</label>
        <input inputMode="decimal" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        <div className="muted" style={{ fontSize: '0.85em', marginTop: 4 }}>Fractions are fine, such as 0.5. Stock value rounds up to whole credits.</div>
        <label>Warn when at or below (blank = default)</label>
        <input type="number" min={0} value={f.lowThreshold ?? ''} onChange={(e) => setF({ ...f, lowThreshold: e.target.value === '' ? null : num(e.target.value) })} />
        <label>Notes</label>
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        {item.id && <LinkedNames itemId={item.id} onUnlinked={(givenBack) => { setF((p) => ({ ...p, onHand: p.onHand + givenBack })); onChanged() }} />}
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span>
            {onDelete && <button className="btn danger" onClick={() => confirm('Delete this item?\n\nIts sales go back to "Sales not matched". To retire an item you won\'t stock again (like a despawned resource), use Archive instead.') && onDelete()}>Delete</button>}
            {onArchive && <>{' '}<button className="btn ghost" onClick={onArchive}>Archive</button></>}
          </span>
          <span><button className="btn ghost" onClick={onClose}>Cancel</button>{' '}<button className="btn" disabled={!f.name.trim()} onClick={() => onSave({ ...f, costEach: parseCost(cost) })}>Save</button></span>
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
