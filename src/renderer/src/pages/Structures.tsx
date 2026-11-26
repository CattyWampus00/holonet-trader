import { useEffect, useState } from 'react'
import type { MachineType, MachineTypeInput, Structure, StructureInput, StructureReading } from '@shared/types'
import { KIND_LABEL, lotsAfter, lotsByCharacter, MAX_LOTS, STATE_LABEL, type StructureKind, type StructureState } from '@shared/structures'
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

  useEffect(() => {
    api.machineTypes().then(setTypes)
    api.structures().then(setList)
  }, [version])

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

      {people.length > 0 && (
        <div className="stats" style={{ marginBottom: 16 }}>
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
          <thead><tr><th>Structure</th><th>Character</th><th>Planet</th><th>State</th><th>Last reading</th><th /></tr></thead>
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
                    {r ? (
                      <>
                        {[
                          r.surplusMaint != null && `maint. ${credits(r.surplusMaint)}`,
                          r.surplusPower != null && `power ${credits(r.surplusPower)}`,
                          r.extractionRate != null && `${r.extractionRate} KG/H`,
                          r.hopperPct != null && `hopper ${r.hopperPct}%`
                        ].filter(Boolean).join(' · ')}
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{ago(r.ts)}</div>
                      </>
                    ) : <span className="muted">none yet</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
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
