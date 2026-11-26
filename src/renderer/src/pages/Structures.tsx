import { useEffect, useState } from 'react'
import type { HarvesterResource, MachineType, MachineTypeInput, Structure, StructureInput, StructureMail, StructureReading } from '@shared/types'
import {
  attention, type Countdown, forecast, formatHours, KIND_LABEL, KINDS, lotsAfter, lotsByCharacter, lotsComparable, MAX_LOTS, nearlyFull, parseOperateResource,
  stateLabel, statesFor, type StructureKind, type StructureState, upkeepPerDay, usesPower
} from '@shared/structures'
import { api, credits } from '../api'

interface Props { version: number; characters: string[]; onChange: () => void }

const blankType: MachineTypeInput = { name: '', kind: 'harvester', lots: 3, maintPerHour: null, powerPerHour: null, storage: null, efficiency: null }

/** "3 h ago" style age of a unix time. */
function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** Confirm before a save that puts a character over the game's lot limit (the app's list may be out of date). */
function lotsOk(all: Structure[], next: { character: string; lots: number; state: StructureState }, id?: number): boolean {
  const total = lotsAfter(all, next, id)
  return total <= MAX_LOTS || confirm(`This puts ${next.character} at ${total} / ${MAX_LOTS} lots. The game allows ${MAX_LOTS}.\n\nSave anyway?`)
}

export default function Structures({ version, characters, onChange }: Props) {
  const [types, setTypes] = useState<MachineType[]>([])
  const [list, setList] = useState<Structure[]>([])
  const [editingType, setEditingType] = useState<MachineTypeInput | null>(null)
  const [editing, setEditing] = useState<StructureInput | null>(null)
  const [reading, setReading] = useState<Structure | null>(null)
  const [choosing, setChoosing] = useState<Structure | null>(null)
  const [emptying, setEmptying] = useState<Structure | null>(null)
  const [notice, setNotice] = useState('')
  const [transferring, setTransferring] = useState<Structure | null>(null)
  /** Shown in the structure form when it was opened from a Construction Complete mail. */
  const [editingHint, setEditingHint] = useState('')
  const [vendorNames, setVendorNames] = useState<string[]>([])

  const transfer = async (s: Structure, to: string) => {
    if (!lotsOk(list, { character: to.trim(), lots: s.lots, state: s.state })) return false
    await api.transferStructure(s.id, to)
    setNotice(`${s.name} now belongs to ${to.trim()}. Its ${s.lots} lot${s.lots === 1 ? '' : 's'} moved with it.`)
    onChange()
    return true
  }

  useEffect(() => {
    api.machineTypes().then(setTypes)
    api.structures().then(setList)
    api.structureMails().then(setMails)
    api.vendorNames().then(setVendorNames)
  }, [version])
  const now = useNow()
  const [mails, setMails] = useState<StructureMail[]>([])

  const used = lotsByCharacter(list)
  const people = [...new Set([...list.map((s) => s.character)])].sort((a, b) => a.localeCompare(b))
  const charOptions = [...new Set([...characters, ...people])].sort((a, b) => a.localeCompare(b))

  const changeState = async (s: Structure, state: StructureState) => {
    if (!lotsOk(list, { character: s.character, lots: s.lots, state }, s.id)) return
    await api.setStructureState(s.id, state)
    onChange()
  }
  const newStructure = (): StructureInput => ({
    character: charOptions[0] ?? '', typeId: null, name: '', kind: 'harvester', planet: '', notes: '',
    lots: 3, maintPerHour: null, powerPerHour: null, storage: null, efficiency: null, state: 'running'
  })

  return (
    <>
      <h2>Structures</h2>
      <div className="row">
        <button className="btn" onClick={() => setEditing(newStructure())}>Add structure</button>
        <button className="btn ghost" onClick={() => setEditing({ ...newStructure(), kind: 'vendor', lots: 0 })}>Add vendor</button>
        <button className="btn ghost" onClick={() => setEditingType({ ...blankType })}>Add saved type</button>
        <span className="muted">Copy the numbers from the game's Structure Status or Vendor Status window (and the Operate panel for harvesters). They already include your modifiers.</span>
      </div>

      {notice && (
        <div className="banner row" style={{ justifyContent: 'space-between' }}>
          <span>{notice}</span>
          <button className="btn ghost" onClick={() => setNotice('')}>OK</button>
        </div>
      )}

      <MailPanel
        mails={mails}
        list={list}
        used={used}
        onAdd={(m) => {
          // Pre-fill from the mail; a machine type with the same name fills in its stats too.
          const t = types.find((x) => x.name.toLowerCase() === m.name.toLowerCase())
          setEditingHint(`Dropped by ${m.character}. If you handed it over with /transferStructure, put the new owner in Owner.`)
          setEditing({
            ...newStructure(), character: m.character, name: m.name,
            ...(t ? { typeId: t.id, kind: t.kind, lots: t.lots, maintPerHour: t.maintPerHour, powerPerHour: t.powerPerHour, storage: t.storage, efficiency: t.efficiency } : {})
          })
        }}
        onDismiss={async (m) => { await api.dismissMail(m.id); onChange() }}
        onTransfer={(s, to) => { void transfer(s, to) }}
        onLink={async (m, id) => {
          const s = list.find((x) => x.id === id)!
          await api.linkMail(m.id, id)
          setNotice(`Linked to ${s.name}. Later mails named "${m.name}" will match it too.`)
          onChange()
        }}
      />

      {people.length > 0 && (
        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="label">Upkeep</div>
            <div className="value">{credits(upkeepPerDay(list))}</div>
            <div className="sub">credits a day, about {credits(upkeepPerDay(list) * 30)} a month</div>
          </div>
          {people.map((c) => {
            const n = used.get(c) ?? 0
            return (
              <div className="card" key={c}>
                <div className="label">{c}</div>
                <div className={'value' + (n > MAX_LOTS ? ' neg' : '')}>{n} / {MAX_LOTS}</div>
                <div className="sub">lots used, {Math.max(0, MAX_LOTS - n)} free</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="panel scroll">
        <table>
          <thead><tr><th>Structure</th><th>Character</th><th>Planet</th><th>State</th><th>Countdowns</th><th /></tr></thead>
          <tbody>
            {list.map((s) => {
              const r = s.lastReading
              return (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {s.typeName ?? KIND_LABEL[s.kind]}{s.kind !== 'vendor' && ` · ${s.lots} lot${s.lots === 1 ? '' : 's'}`}
                    </div>
                    {s.otherNames.map((n) => (
                      <div key={n} className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        also matches mail "{n}"{' '}
                        <button className="btn ghost" style={{ padding: '0 6px', fontSize: 11 }} title="Stop matching this name"
                          onClick={async () => { if (confirm(`Stop matching mails named "${n}" to ${s.name}?`)) { await api.removeStructureName(s.id, n); onChange() } }}>✕</button>
                      </div>
                    ))}
                    {s.kind === 'harvester' && (
                      <div style={{ fontSize: 12, marginTop: 2 }}>
                        {s.resource
                          ? <>Extracting {s.resource.name} <span className="muted">({s.resource.type}{s.resource.concentration != null ? `, ${s.resource.concentration}%` : ''})</span></>
                          : <span className="muted">No resource set</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    {s.character}
                    {s.transfers.length > 0 && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>from {s.transfers[s.transfers.length - 1]!.from}, {ago(s.transfers[s.transfers.length - 1]!.ts)}</div>
                    )}
                  </td>
                  <td>{s.planet}</td>
                  <td>
                    {statesFor(s.kind).length > 1
                      ? (
                        <select value={s.state} onChange={(e) => changeState(s, e.target.value as StructureState)}>
                          {statesFor(s.kind).map((st) => <option key={st} value={st}>{stateLabel(s.kind, st)}</option>)}
                        </select>
                      )
                      : stateLabel(s.kind, s.state)}
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>since {ago(s.stateSince)}</div>
                  </td>
                  <td>
                    <Countdowns s={s} now={now} />
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{r ? `last reading ${ago(r.ts)}` : 'no reading yet'}</div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.kind === 'harvester' && <>
                      <button className="btn ghost" onClick={() => setChoosing(s)}>Resource</button>{' '}
                      <button className="btn ghost" disabled={!s.resource} title={s.resource ? '' : 'Set the resource first'} onClick={() => setEmptying(s)}>Empty hopper</button>{' '}
                    </>}
                    <button className="btn ghost" onClick={() => setReading(s)}>Reading</button>{' '}
                    <button className="btn ghost" title="Record a /transferStructure to another character" onClick={() => setTransferring(s)}>Transfer</button>{' '}
                    <button className="btn ghost" onClick={() => setEditing({ ...s })}>Edit</button>
                  </td>
                </tr>
              )
            })}
            {!list.length && (
              <tr><td colSpan={6} className="muted">
                No structures yet. Save a type first (its fixed stats), then add each harvester, factory, house or vendor you have.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Saved types</h3>
      <div className="panel scroll">
        <p className="muted" style={{ marginTop: 0 }}>
          Your saved fixed stats. Pick one when adding a structure and its numbers fill in. Editing a type does not change structures already added.
        </p>
        <table>
          <thead><tr><th>Name</th><th>Kind</th><th className="num">Lots</th><th className="num">Maint. / h</th><th className="num">Power / h</th><th className="num">Storage</th><th className="num">Efficiency</th><th /></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{KIND_LABEL[t.kind]}</td>
                <td className="num">{t.lots}</td>
                <td className="num">{t.maintPerHour ?? ''}</td>
                <td className="num">{t.powerPerHour ?? ''}</td>
                <td className="num">{t.storage != null ? credits(t.storage) : ''}</td>
                <td className="num">{t.efficiency ?? ''}</td>
                <td style={{ textAlign: 'right' }}><button className="btn ghost" onClick={() => setEditingType({ ...t })}>Edit</button></td>
              </tr>
            ))}
            {!types.length && <tr><td colSpan={8} className="muted">No saved types yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editingType && (
        <TypeModal
          type={editingType}
          onClose={() => setEditingType(null)}
          onSave={async (t) => { await api.saveMachineType(t); setEditingType(null); onChange() }}
          onDelete={editingType.id ? async () => { await api.deleteMachineType(editingType.id!); setEditingType(null); onChange() } : undefined}
        />
      )}
      {transferring && (
        <TransferModal
          structure={transferring}
          characters={charOptions}
          onClose={() => setTransferring(null)}
          onSave={async (to) => { if (await transfer(transferring, to)) setTransferring(null) }}
        />
      )}
      {editing && (
        <StructureModal
          structure={editing}
          types={types}
          characters={charOptions}
          vendorNames={vendorNames.filter((n) => !list.some((x) => x.kind === 'vendor' && x.name.toLowerCase() === n.toLowerCase()))}
          takenNames={new Set(list.filter((x) => x.id !== editing.id).map((x) => x.name.replace(/\s+/g, ' ').trim().toLowerCase()))}
          hint={editingHint}
          onClose={() => { setEditing(null); setEditingHint('') }}
          onSave={async (s) => {
            const state = s.id ? list.find((x) => x.id === s.id)!.state : (s.state ?? 'running')
            if (!lotsOk(list, { character: s.character.trim(), lots: s.lots, state }, s.id)) return
            await api.saveStructure(s); setEditing(null); setEditingHint(''); onChange()
          }}
          onSaveType={async (t) => { await api.saveMachineType(t); onChange() }}
          onDelete={editing.id ? async () => { await api.deleteStructure(editing.id!); setEditing(null); onChange() } : undefined}
        />
      )}
      {choosing && (
        <ResourceModal
          structure={choosing}
          onClose={() => setChoosing(null)}
          onSave={async (res, archiveItemId) => {
            await api.setHarvesterResource(choosing.id, res)
            if (archiveItemId != null) await api.setArchived(archiveItemId, true)
            setChoosing(null)
            onChange()
          }}
        />
      )}
      {emptying && emptying.resource && (
        <EmptyModal
          structure={emptying}
          onClose={() => setEmptying(null)}
          onSave={async (amount) => {
            const r = await api.emptyHopper(emptying.id, amount)
            setEmptying(null)
            setNotice(`Added ${credits(amount)} units to ${r.itemName}${r.created ? ' (new inventory item)' : ''}.`)
            onChange()
          }}
        />
      )}
      {reading && (
        <ReadingModal
          structure={reading}
          onClose={() => setReading(null)}
          onSave={async (r) => { await api.addReading(reading.id, r); setReading(null); onChange() }}
        />
      )}
    </>
  )
}

/**
 * Structure mails from the last 14 days. Matched mails say what they changed; unmatched ones say so, so the
 * player can rename the structure in the app to the name the game uses. Construction mails offer "Add" and
 * compare the game's lots left with the app's count (only the newest one per character, since older ones are stale).
 */
function MailPanel({ mails, list, used, onAdd, onDismiss, onLink, onTransfer }: {
  mails: StructureMail[]; list: Structure[]; used: Map<string, number>
  onAdd: (m: StructureMail) => void; onDismiss: (m: StructureMail) => void; onLink: (m: StructureMail, structureId: number) => void
  onTransfer: (s: Structure, to: string) => void
}) {
  // A matched mail that went to someone other than the app's owner: the owner gets the mail, so it was probably
  // transferred in game without being recorded here.
  const movedTo = (m: StructureMail) => {
    const s = list.find((x) => x.id === m.structureId)
    return s && m.kind !== 'construction' && s.character.toLowerCase() !== m.character.toLowerCase() ? s : null
  }
  if (!mails.length) return null
  const newestBuild = new Map<string, number>()
  for (const m of mails) if (m.kind === 'construction' && !newestBuild.has(m.character)) newestBuild.set(m.character, m.id)
  const nameOf = (m: StructureMail) => list.find((s) => s.id === m.structureId)?.name ?? m.name
  const text = (m: StructureMail) => {
    if (m.kind === 'factory_done') {
      return m.structureId != null ? `${nameOf(m)} stopped making items. Set to Idle.` : `A factory named "${m.name}" stopped making items. No structure in the app has that name.`
    }
    if (m.kind === 'structure_maint') {
      return m.structureId != null
        ? `${nameOf(m)} has an empty maintenance pool. The game is taking upkeep from your bank.`
        : `"${m.name}"${m.planet ? ` on ${m.planet}` : ''} has an empty maintenance pool (bank is paying). No structure in the app matched it.`
    }
    if (m.kind === 'vendor_maint') {
      return m.structureId != null
        ? `Vendor ${nameOf(m)} has an empty maintenance pool. It is deactivated, and it and its items can be destroyed: add maintenance now.`
        : `A vendor${m.planet ? ` on ${m.planet}` : ''} has an empty maintenance pool and is deactivated; it and its items can be destroyed. No vendor in the app matched it (the mail gives only its spot).`
    }
    let t = `Construction of ${m.name} complete. The game says ${m.lotsLeft} lot${m.lotsLeft === 1 ? '' : 's'} left.`
    if (newestBuild.get(m.character) === m.id && m.lotsLeft != null && lotsComparable(m.character, m.ts, list)) {
      const appLeft = MAX_LOTS - (used.get(m.character) ?? 0)
      if (appLeft !== m.lotsLeft) t += ` The app counts ${appLeft} left, so a structure may be missing or not packed up here.`
    }
    return t
  }
  return (
    <>
      <h3>From your mail</h3>
      <div className="panel scroll" style={{ marginBottom: 16, maxHeight: 220 }}>
        <table>
          <tbody>
            {mails.map((m) => (
              <tr key={m.id} style={m.dismissed ? { opacity: 0.55 } : undefined}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{ago(m.ts)}</td>
                <td>{m.character}</td>
                <td style={(m.kind === 'structure_maint' || m.kind === 'vendor_maint') && !m.dismissed ? { color: 'var(--bad)' } : undefined}>
                  {text(m)}{m.dismissed && <span className="muted"> (dismissed)</span>}
                  {movedTo(m) && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Owned by {movedTo(m)!.character} in the app, but the mail went to {m.character}.
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {movedTo(m) && <button className="btn ghost" onClick={() => onTransfer(movedTo(m)!, m.character)}>Record transfer</button>}{' '}
                  {m.kind !== 'construction' && m.structureId == null && list.length > 0 && (
                    <select value="" title="Which structure is this mail about? Its name is saved so later mails match." onChange={(e) => e.target.value && onLink(m, Number(e.target.value))}>
                      <option value="">Link to…</option>
                      {list.filter((s) => (m.kind !== 'factory_done' || s.kind === 'factory') && (m.kind === 'vendor_maint') === (s.kind === 'vendor')).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.character})</option>
                      ))}
                    </select>
                  )}{' '}
                  {m.kind === 'construction' && <button className="btn ghost" onClick={() => onAdd(m)}>Add</button>}{' '}
                  {!m.dismissed && <button className="btn ghost" onClick={() => onDismiss(m)}>Dismiss</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Record a /transferStructure: the structure and its lots go to another character (no mail shows this in game). */
function TransferModal({ structure, characters, onClose, onSave }: {
  structure: Structure; characters: string[]; onClose: () => void; onSave: (to: string) => void
}) {
  const [to, setTo] = useState('')
  const same = to.trim().toLowerCase() === structure.character.toLowerCase()
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Transfer {structure.name}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          After <code>/transferStructure</code> in game, the new owner holds its {structure.lots} lot{structure.lots === 1 ? '' : 's'} and gets its mail.
          Its stats and bonuses stay the same.
        </p>
        <label>Now owned by {structure.character}. New owner</label>
        <input list="transfer-characters" value={to} autoFocus onChange={(e) => setTo(e.target.value)} />
        <datalist id="transfer-characters">{characters.filter((c) => c !== structure.character).map((c) => <option key={c} value={c} />)}</datalist>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!to.trim() || same} onClick={() => onSave(to)}>Transfer</button>
        </div>
      </div>
    </div>
  )
}

/** Current unix time, updated every minute so countdowns tick while the tab is open. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Color for a countdown: red under 2 days, amber under 7, muted when paused. */
const urgencyStyle = (hoursLeft: number | null, paused: boolean) => {
  if (paused) return { color: 'var(--muted)' }
  const a = attention(hoursLeft)
  return a === 'urgent' ? { color: 'var(--bad)', fontWeight: 600 } : a === 'soon' ? { color: 'var(--warn)' } : {}
}

/** Maintenance, power and (for harvesters) hopper countdowns for one structure. */
function Countdowns({ s, now }: { s: Structure; now: number }) {
  const f = forecast(s, now)
  const line = (label: string, c: Countdown | null) => {
    if (!c || (c.paused && c.hoursLeft == null)) return null // a stopped clock with no number has nothing to say
    return (
      <div style={{ fontSize: 13, ...urgencyStyle(c.hoursLeft, c.paused) }}>
        {label}: {c.hoursLeft == null ? <span className="muted">needs a reading</span> : formatHours(c.hoursLeft)}
        {c.paused && c.hoursLeft != null ? ' (paused)' : ''}
      </div>
    )
  }
  return (
    <>
      {line('Maint.', f.maintenance)}
      {line('Power', f.power)}
      {line('Hopper full', f.hopper)}
      {s.kind === 'house' && s.latest.items && (
        <div style={{ fontSize: 13, ...(nearlyFull(s.latest.items.value, s.storage) ? { color: 'var(--warn)' } : {}) }}>
          Items: {credits(s.latest.items.value)}{s.storage ? ` / ${credits(s.storage)}` : ''}{nearlyFull(s.latest.items.value, s.storage) ? ' (nearly full)' : ''}
        </div>
      )}
      {s.kind === 'vendor' && s.latest.items && <div style={{ fontSize: 13 }}>Items for sale: {credits(s.latest.items.value)}</div>}
    </>
  )
}

/** Number box where empty means "not entered" (null), not 0. */
function NumField({ label, value, onChange, step }: { label: string; value: number | null; onChange: (v: number | null) => void; step?: string }) {
  return (
    <>
      <label>{label}</label>
      <input type="number" min={0} step={step ?? 'any'} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
    </>
  )
}

function KindSelect({ value, onChange }: { value: StructureKind; onChange: (k: StructureKind) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as StructureKind)} style={{ width: '100%' }}>
      {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
    </select>
  )
}

/**
 * The fixed stats that apply to a kind: power only for harvesters and factories, storage for harvesters (hopper
 * units) and houses (items), efficiency for factories. Lots are hidden for vendors (they use none).
 */
function StatFields<T extends { kind: StructureKind; lots: number; maintPerHour: number | null; powerPerHour: number | null; storage: number | null; efficiency: number | null }>(
  { v, set, fromDeed }: { v: T; set: (next: T) => void; fromDeed?: boolean }
) {
  return (
    <>
      {v.kind !== 'vendor' && <NumField label={v.kind === 'house' ? 'Lots used (1 to 5)' : 'Lots used'} value={v.lots} step="1" onChange={(n) => set({ ...v, lots: Math.floor(n ?? 0) })} />}
      <NumField label={`Maintenance rate per hour (${v.kind === 'vendor' ? 'Vendor Status' : 'Structure Status, first number'})`} value={v.maintPerHour} onChange={(n) => set({ ...v, maintPerHour: n })} />
      {usesPower(v.kind) && <NumField label="Power consumption per hour (Structure Status)" value={v.powerPerHour} onChange={(n) => set({ ...v, powerPerHour: n })} />}
      {v.kind === 'harvester' && <NumField label={fromDeed ? 'Storage capacity (from the deed)' : 'Storage capacity'} value={v.storage} step="1" onChange={(n) => set({ ...v, storage: n })} />}
      {v.kind === 'house' && <NumField label="Maximum Storage Capacity (items, Structure Status)" value={v.storage} step="1" onChange={(n) => set({ ...v, storage: n })} />}
      {v.kind === 'factory' && <NumField label="Factory production efficiency" value={v.efficiency} onChange={(n) => set({ ...v, efficiency: n })} />}
    </>
  )
}

/** Switching kind: vendors use no lots, and stats that don't apply to the new kind are cleared. */
function withKind<T extends { kind: StructureKind; lots: number; powerPerHour: number | null; storage: number | null; efficiency: number | null }>(v: T, kind: StructureKind): T {
  return {
    ...v, kind,
    lots: kind === 'vendor' ? 0 : v.kind === 'vendor' ? 1 : v.lots,
    powerPerHour: usesPower(kind) ? v.powerPerHour : null,
    storage: kind === 'harvester' || kind === 'house' ? (kind === v.kind ? v.storage : null) : null,
    efficiency: kind === 'factory' ? v.efficiency : null
  }
}

function TypeModal({ type, onClose, onSave, onDelete }: { type: MachineTypeInput; onClose: () => void; onSave: (t: MachineTypeInput) => void; onDelete?: () => void }) {
  const [t, setT] = useState(type)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{type.id ? 'Edit saved type' : 'Add saved type'}</h2>
        <label>Name (your choice)</label>
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="My Elite Ore Harvester" autoFocus />
        <label>Kind</label>
        <KindSelect value={t.kind} onChange={(kind) => setT(withKind(t, kind))} />
        <StatFields v={t} set={setT} fromDeed />
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span>{onDelete && <button className="btn danger" onClick={() => confirm('Delete this saved type?\n\nStructures made from it keep their own numbers.') && onDelete()}>Delete</button>}</span>
          <span><button className="btn ghost" onClick={onClose}>Cancel</button>{' '}<button className="btn" disabled={!t.name.trim()} onClick={() => onSave(t)}>Save</button></span>
        </div>
      </div>
    </div>
  )
}

function StructureModal({ structure, types, characters, takenNames, hint, vendorNames, onClose, onSave, onSaveType, onDelete }: {
  structure: StructureInput; types: MachineType[]; characters: string[]
  /** Vendor names from sale mails, offered when adding a vendor. */
  vendorNames: string[]
  /** Lower-case names of the other structures (a duplicate name can't be matched from mail). */
  takenNames: Set<string>
  hint?: string
  onClose: () => void; onSave: (s: StructureInput) => void; onSaveType: (t: MachineTypeInput) => void; onDelete?: () => void
}) {
  const [s, setS] = useState(structure)
  const [savedType, setSavedType] = useState(false)
  // Picking a type copies its fixed stats into this structure; they can still be changed here afterwards.
  const pickType = (id: number | null) => {
    const t = types.find((x) => x.id === id)
    if (!t) return setS({ ...s, typeId: null })
    setS({ ...s, typeId: t.id, kind: t.kind, lots: t.lots, maintPerHour: t.maintPerHour, powerPerHour: t.powerPerHour, storage: t.storage, efficiency: t.efficiency, name: s.name || t.name })
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{structure.id ? 'Edit structure' : 'Add structure'}</h2>
        <label>Kind</label>
        <KindSelect value={s.kind} onChange={(kind) => setS({ ...withKind(s, kind), typeId: null, state: statesFor(kind).includes(s.state ?? 'running') ? s.state : 'running' })} />
        <label>Saved type</label>
        <select value={s.typeId ?? ''} onChange={(e) => pickType(e.target.value ? Number(e.target.value) : null)} style={{ width: '100%' }}>
          <option value="">None (enter the numbers below)</option>
          {types.filter((t) => t.kind === s.kind).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Name (the same name you give it in game)</label>
        <input value={s.name} list={s.kind === 'vendor' ? 'vendor-names' : undefined} onChange={(e) => setS({ ...s, name: e.target.value })}
          placeholder={s.kind === 'vendor' ? 'Pick a vendor from your sales, or type' : s.kind === 'house' ? 'Research & Development' : 'Ore Elite 1'} />
        {s.kind === 'vendor' && <datalist id="vendor-names">{vendorNames.map((n) => <option key={n} value={n} />)}</datalist>}
        {takenNames.has(s.name.replace(/\s+/g, ' ').trim().toLowerCase()) && (
          <div className="muted" style={{ fontSize: 12, color: 'var(--warn)' }}>Another structure has this name, so mail can't tell them apart. A unique name (in game too) fixes that.</div>
        )}
        <label>Owner (the character holding its lots)</label>
        <input list="structure-characters" value={s.character} onChange={(e) => setS({ ...s, character: e.target.value })} />
        {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
        {s.id && <div className="muted" style={{ fontSize: 12 }}>To record a /transferStructure, use Transfer on its row instead (keeps the history).</div>}
        <datalist id="structure-characters">{characters.map((c) => <option key={c} value={c} />)}</datalist>
        <label>Planet</label>
        <input value={s.planet} onChange={(e) => setS({ ...s, planet: e.target.value })} />
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <span style={{ flex: 1 }}><NumField label="Spot x (optional)" value={s.x ?? null} onChange={(v) => setS({ ...s, x: v })} /></span>
          <span style={{ flex: 1 }}><NumField label="Spot y (optional)" value={s.y ?? null} onChange={(v) => setS({ ...s, y: v })} /></span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {s.kind === 'vendor'
            ? 'The vendor maintenance mail has no vendor name, only its spot. Fill these in (or use Link to… on a mail) when you have more than one vendor on a planet.'
            : 'Structure Status shows "PLANET x z y": enter the first and last numbers. Helps match maintenance mails.'}
        </div>
        {!structure.id && statesFor(s.kind).length > 1 && (
          <>
            <label>Starts as</label>
            <select value={s.state ?? 'running'} onChange={(e) => setS({ ...s, state: e.target.value as StructureState })} style={{ width: '100%' }}>
              {statesFor(s.kind).map((st) => <option key={st} value={st}>{stateLabel(s.kind, st)}</option>)}
            </select>
          </>
        )}
        <StatFields v={s} set={setS} />
        <label>Notes</label>
        <input value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} />
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span>
            {onDelete && <button className="btn danger" onClick={() => confirm('Delete this structure and its history?\n\nIf you only picked it up, set it to Packed up instead.') && onDelete()}>Delete</button>}{' '}
            <button className="btn ghost" disabled={!s.name.trim() || savedType} onClick={() => {
              onSaveType({ name: s.name.trim(), kind: s.kind, lots: s.lots, maintPerHour: s.maintPerHour, powerPerHour: s.powerPerHour, storage: s.storage, efficiency: s.efficiency })
              setSavedType(true)
            }}>{savedType ? 'Saved as type' : 'Save as type'}</button>
          </span>
          <span><button className="btn ghost" onClick={onClose}>Cancel</button>{' '}<button className="btn" disabled={!s.name.trim() || !s.character.trim()} onClick={() => onSave(s)}>Save</button></span>
        </div>
      </div>
    </div>
  )
}

/** Short date for history lists. */
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString()

/** Set or switch the resource a harvester extracts. Switching can archive the old resource's item (it despawned). */
function ResourceModal({ structure, onClose, onSave }: {
  structure: Structure; onClose: () => void
  onSave: (res: { name: string; type: string; concentration: number | null }, archiveItemId: number | null) => void
}) {
  const cur = structure.resource
  const [name, setName] = useState(cur?.name ?? '')
  const [type, setType] = useState(cur?.type ?? '')
  const [conc, setConc] = useState<number | null>(cur?.concentration ?? null)
  const [target, setTarget] = useState<{ itemId: number | null; itemName: string } | null>(null)
  const [oldItem, setOldItem] = useState<{ itemId: number | null; itemName: string } | null>(null)
  const [archiveOld, setArchiveOld] = useState(false)
  const [history, setHistory] = useState<HarvesterResource[]>([])
  const switching = !!cur && name.trim() !== '' && name.trim().toLowerCase() !== cur.name.toLowerCase()

  useEffect(() => { api.resourceHistory(structure.id).then(setHistory) }, [structure.id])
  useEffect(() => { if (cur) api.resourceTarget(cur).then(setOldItem) }, [cur])
  useEffect(() => {
    if (!name.trim() || !type.trim()) return setTarget(null)
    api.resourceTarget({ name, type }).then(setTarget)
  }, [name, type])

  // The old resource's concentration does not carry over to a different resource.
  const changeName = (next: string) => {
    setName(next)
    if (cur && next.trim().toLowerCase() !== cur.name.toLowerCase() && conc === cur.concentration) setConc(null)
  }
  // Pasting the Operate panel's line ("Name, a type of Type") fills both boxes.
  const paste = (line: string) => {
    const p = parseOperateResource(line)
    if (p) { changeName(p.name); setType(p.type) }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>Resource: {structure.name}</h2>
        <label>Paste the Operate panel line (optional)</label>
        <input placeholder="Name, a type of Type" onChange={(e) => paste(e.target.value)} />
        <label>Resource name</label>
        <input value={name} onChange={(e) => changeName(e.target.value)} autoFocus />
        <label>Resource type</label>
        <input value={type} onChange={(e) => setType(e.target.value)} />
        <NumField label="Concentration % (Operate panel bar)" value={conc} onChange={(v) => setConc(v == null ? null : Math.min(100, v))} />
        {target && (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Hopper empties go to <b>{target.itemName}</b>{target.itemId == null ? ' (a new inventory item)' : ' (already in inventory)'}.
          </p>
        )}
        {switching && oldItem?.itemId != null && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={archiveOld} onChange={(e) => setArchiveOld(e.target.checked)} />
            {cur!.name} despawned: archive "{oldItem.itemName}"
          </label>
        )}
        {history.length > 0 && (
          <>
            <label>History</label>
            {history.slice(0, 8).map((h) => (
              <div key={h.id} className="muted" style={{ fontSize: 12 }}>
                {h.name} ({h.type}) · {day(h.fromTs)} to {h.toTs ? day(h.toTs) : 'now'}
              </div>
            ))}
          </>
        )}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!name.trim() || !type.trim()}
            onClick={() => onSave({ name: name.trim(), type: type.trim(), concentration: conc }, switching && archiveOld ? oldItem?.itemId ?? null : null)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/** Put what was collected from the hopper into inventory. */
function EmptyModal({ structure, onClose, onSave }: { structure: Structure; onClose: () => void; onSave: (amount: number) => void }) {
  const res = structure.resource!
  const [amount, setAmount] = useState<number | null>(null)
  const [target, setTarget] = useState<{ itemId: number | null; itemName: string } | null>(null)
  const [log, setLog] = useState<{ ts: number; resource: string; amount: number }[]>([])
  useEffect(() => { api.resourceTarget(res).then(setTarget) }, [res])
  useEffect(() => { api.hopperLog(structure.id).then(setLog) }, [structure.id])
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Empty hopper: {structure.name}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {res.name} ({res.type}) goes into <b>{target?.itemName ?? '…'}</b>{target && target.itemId == null ? ', a new inventory item' : ''}.
        </p>
        <NumField label="Units collected" value={amount} step="1" onChange={(v) => setAmount(v == null ? null : Math.floor(v))} />
        {log.length > 0 && (
          <>
            <label>Recent empties</label>
            {log.slice(0, 5).map((h, i) => (
              <div key={i} className="muted" style={{ fontSize: 12 }}>{day(h.ts)} · {credits(h.amount)} {h.resource}</div>
            ))}
          </>
        )}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!amount || amount <= 0} onClick={() => onSave(amount!)}>Add to inventory</button>
        </div>
      </div>
    </div>
  )
}

function ReadingModal({ structure, onClose, onSave }: { structure: Structure; onClose: () => void; onSave: (r: Omit<StructureReading, 'ts'>) => void }) {
  const [r, setR] = useState<Omit<StructureReading, 'ts'>>({ surplusMaint: null, surplusPower: null, extractionRate: null, hopperPct: null, items: null })
  const empty = [r.surplusMaint, r.surplusPower, r.extractionRate, r.hopperPct, r.items].every((v) => v == null)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reading: {structure.name}</h2>
        <p className="muted" style={{ margin: 0 }}>Fill in what you can see now. Leave a box empty if you didn't check it.</p>
        <NumField label={`Maintenance Pool (${structure.kind === 'vendor' ? 'Vendor' : 'Structure'} Status)`} value={r.surplusMaint} onChange={(v) => setR({ ...r, surplusMaint: v })} />
        {usesPower(structure.kind) && <NumField label="Power Reserves (Structure Status)" value={r.surplusPower} onChange={(v) => setR({ ...r, surplusPower: v })} />}
        {structure.kind === 'house' && <NumField label="Number of Items in Building (Structure Status)" value={r.items} step="1" onChange={(v) => setR({ ...r, items: v == null ? null : Math.floor(v) })} />}
        {structure.kind === 'vendor' && <NumField label="Number of Items For Sale (Vendor Status)" value={r.items} step="1" onChange={(v) => setR({ ...r, items: v == null ? null : Math.floor(v) })} />}
        {structure.kind === 'harvester' && (
          <>
            <NumField label="Actual Rate, KG/H (Operate panel, while running)" value={r.extractionRate} onChange={(v) => setR({ ...r, extractionRate: v })} />
            <NumField label="Hopper Capacity % (Operate panel)" value={r.hopperPct} onChange={(v) => setR({ ...r, hopperPct: v == null ? null : Math.min(100, v) })} />
          </>
        )}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={empty} onClick={() => onSave(r)}>Save reading</button>
        </div>
      </div>
    </div>
  )
}
