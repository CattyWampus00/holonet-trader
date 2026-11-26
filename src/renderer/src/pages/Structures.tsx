import { useEffect, useState } from 'react'
import type { HarvesterResource, MachineType, MachineTypeInput, Structure, StructureInput, StructureMail, StructureReading } from '@shared/types'
import {
  attention, type Countdown, forecast, formatHours, KIND_LABEL, lotsAfter, lotsByCharacter, MAX_LOTS, parseOperateResource, STATE_LABEL,
  type StructureKind, type StructureState, upkeepPerDay
} from '@shared/structures'
import { api, credits } from '../api'

interface Props { version: number; characters: string[]; onChange: () => void }

const STATES: StructureState[] = ['running', 'idle', 'packed']
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

  useEffect(() => {
    api.machineTypes().then(setTypes)
    api.structures().then(setList)
    api.structureMails().then(setMails)
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
        <button className="btn ghost" onClick={() => setEditingType({ ...blankType })}>Add machine type</button>
        <span className="muted">Copy the numbers from the game's Structure Status window (and the Operate panel for harvesters). They already include your modifiers.</span>
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
          setEditing({
            ...newStructure(), character: m.character, name: m.name,
            ...(t ? { typeId: t.id, kind: t.kind, lots: t.lots, maintPerHour: t.maintPerHour, powerPerHour: t.powerPerHour, storage: t.storage, efficiency: t.efficiency } : {})
          })
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
                      {s.typeName ?? KIND_LABEL[s.kind]} · {s.lots} lot{s.lots === 1 ? '' : 's'}
                    </div>
                    {s.kind === 'harvester' && (
                      <div style={{ fontSize: 12, marginTop: 2 }}>
                        {s.resource
                          ? <>Extracting {s.resource.name} <span className="muted">({s.resource.type}{s.resource.concentration != null ? `, ${s.resource.concentration}%` : ''})</span></>
                          : <span className="muted">No resource set</span>}
                      </div>
                    )}
                  </td>
                  <td>{s.character}</td>
                  <td>{s.planet}</td>
                  <td>
                    <select value={s.state} onChange={(e) => changeState(s, e.target.value as StructureState)}>
                      {STATES.map((st) => <option key={st} value={st}>{STATE_LABEL[st]}</option>)}
                    </select>
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
                    <button className="btn ghost" onClick={() => setEditing({ ...s })}>Edit</button>
                  </td>
                </tr>
              )
            })}
            {!list.length && (
              <tr><td colSpan={6} className="muted">
                No structures yet. Save a machine type first (its fixed stats), then add each harvester or factory you have placed.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Machine types</h3>
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
            {!types.length && <tr><td colSpan={8} className="muted">No machine types yet.</td></tr>}
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
      {editing && (
        <StructureModal
          structure={editing}
          types={types}
          characters={charOptions}
          onClose={() => setEditing(null)}
          onSave={async (s) => {
            const state = s.id ? list.find((x) => x.id === s.id)!.state : (s.state ?? 'running')
            if (!lotsOk(list, { character: s.character.trim(), lots: s.lots, state }, s.id)) return
            await api.saveStructure(s); setEditing(null); onChange()
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
function MailPanel({ mails, list, used, onAdd }: { mails: StructureMail[]; list: Structure[]; used: Map<string, number>; onAdd: (m: StructureMail) => void }) {
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
    let t = `Construction of ${m.name} complete. The game says ${m.lotsLeft} lot${m.lotsLeft === 1 ? '' : 's'} left.`
    if (newestBuild.get(m.character) === m.id && m.lotsLeft != null) {
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
              <tr key={m.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{ago(m.ts)}</td>
                <td>{m.character}</td>
                <td style={m.kind === 'structure_maint' ? { color: 'var(--bad)' } : undefined}>{text(m)}</td>
                <td style={{ textAlign: 'right' }}>
                  {m.kind === 'construction' && <button className="btn ghost" onClick={() => onAdd(m)}>Add</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
      <option value="harvester">Harvester</option>
      <option value="factory">Factory</option>
    </select>
  )
}

function TypeModal({ type, onClose, onSave, onDelete }: { type: MachineTypeInput; onClose: () => void; onSave: (t: MachineTypeInput) => void; onDelete?: () => void }) {
  const [t, setT] = useState(type)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{type.id ? 'Edit machine type' : 'Add machine type'}</h2>
        <label>Name (your choice)</label>
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="My Elite Ore Harvester" autoFocus />
        <label>Kind</label>
        <KindSelect value={t.kind} onChange={(kind) => setT({ ...t, kind })} />
        <NumField label="Lots used" value={t.lots} step="1" onChange={(v) => setT({ ...t, lots: Math.floor(v ?? 0) })} />
        <NumField label="Maintenance rate per hour (Structure Status, first number)" value={t.maintPerHour} onChange={(v) => setT({ ...t, maintPerHour: v })} />
        <NumField label="Power consumption per hour (Structure Status)" value={t.powerPerHour} onChange={(v) => setT({ ...t, powerPerHour: v })} />
        {t.kind === 'harvester'
          ? <NumField label="Storage capacity (from the deed)" value={t.storage} step="1" onChange={(v) => setT({ ...t, storage: v })} />
          : <NumField label="Factory production efficiency" value={t.efficiency} onChange={(v) => setT({ ...t, efficiency: v })} />}
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span>{onDelete && <button className="btn danger" onClick={() => confirm('Delete this machine type?\n\nStructures made from it keep their own numbers.') && onDelete()}>Delete</button>}</span>
          <span><button className="btn ghost" onClick={onClose}>Cancel</button>{' '}<button className="btn" disabled={!t.name.trim()} onClick={() => onSave(t)}>Save</button></span>
        </div>
      </div>
    </div>
  )
}

function StructureModal({ structure, types, characters, onClose, onSave, onSaveType, onDelete }: {
  structure: StructureInput; types: MachineType[]; characters: string[]
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
        <label>Machine type</label>
        <select value={s.typeId ?? ''} onChange={(e) => pickType(e.target.value ? Number(e.target.value) : null)} style={{ width: '100%' }}>
          <option value="">None (enter the numbers below)</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Name (to tell yours apart)</label>
        <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Ore field, Talus" />
        <label>Character</label>
        <input list="structure-characters" value={s.character} onChange={(e) => setS({ ...s, character: e.target.value })} />
        <datalist id="structure-characters">{characters.map((c) => <option key={c} value={c} />)}</datalist>
        <label>Planet</label>
        <input value={s.planet} onChange={(e) => setS({ ...s, planet: e.target.value })} />
        {!structure.id && (
          <>
            <label>Starts as</label>
            <select value={s.state ?? 'running'} onChange={(e) => setS({ ...s, state: e.target.value as StructureState })} style={{ width: '100%' }}>
              {STATES.map((st) => <option key={st} value={st}>{STATE_LABEL[st]}</option>)}
            </select>
          </>
        )}
        <label>Kind</label>
        <KindSelect value={s.kind} onChange={(kind) => setS({ ...s, kind })} />
        <NumField label="Lots used" value={s.lots} step="1" onChange={(v) => setS({ ...s, lots: Math.floor(v ?? 0) })} />
        <NumField label="Maintenance rate per hour" value={s.maintPerHour} onChange={(v) => setS({ ...s, maintPerHour: v })} />
        <NumField label="Power consumption per hour" value={s.powerPerHour} onChange={(v) => setS({ ...s, powerPerHour: v })} />
        {s.kind === 'harvester'
          ? <NumField label="Storage capacity" value={s.storage} step="1" onChange={(v) => setS({ ...s, storage: v })} />
          : <NumField label="Factory production efficiency" value={s.efficiency} onChange={(v) => setS({ ...s, efficiency: v })} />}
        <label>Notes</label>
        <input value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} />
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <span>
            {onDelete && <button className="btn danger" onClick={() => confirm('Delete this structure and its history?\n\nIf you only picked it up, set it to Packed up instead.') && onDelete()}>Delete</button>}{' '}
            <button className="btn ghost" disabled={!s.name.trim() || savedType} onClick={() => {
              onSaveType({ name: s.name.trim(), kind: s.kind, lots: s.lots, maintPerHour: s.maintPerHour, powerPerHour: s.powerPerHour, storage: s.storage, efficiency: s.efficiency })
              setSavedType(true)
            }}>{savedType ? 'Saved as type' : 'Save as machine type'}</button>
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
  const [r, setR] = useState<Omit<StructureReading, 'ts'>>({ surplusMaint: null, surplusPower: null, extractionRate: null, hopperPct: null })
  const empty = [r.surplusMaint, r.surplusPower, r.extractionRate, r.hopperPct].every((v) => v == null)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reading: {structure.name}</h2>
        <p className="muted" style={{ margin: 0 }}>Fill in what you can see now. Leave a box empty if you didn't check it.</p>
        <NumField label="Maintenance Pool (Structure Status)" value={r.surplusMaint} onChange={(v) => setR({ ...r, surplusMaint: v })} />
        <NumField label="Power Reserves (Structure Status)" value={r.surplusPower} onChange={(v) => setR({ ...r, surplusPower: v })} />
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
