import { PRESETS, rangeLabel, toInputDate, type Preset, type RangeValue } from '../dateRange'

/**
 * Preset buttons plus a Custom option that reveals From / To calendar pickers. Pass `yearStart` on the tabs that start
 * fresh after a year close (Dashboard, Sales Log, Customers), so the label shows the dates actually used.
 */
export default function DateRangeBar({ value, onChange, yearStart = null }: { value: RangeValue; onChange: (v: RangeValue) => void; yearStart?: number | null }) {
  const pick = (preset: Preset) => {
    // Opening Custom for the first time starts from the last 30 days so the pickers are never empty.
    if (preset === 'custom' && !value.from && !value.to) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 29)
      onChange({ preset, from: toInputDate(from), to: toInputDate(to) })
    } else onChange({ ...value, preset })
  }
  const today = toInputDate(new Date())

  return (
    <div className="daterange">
      <div className="seg" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.id} className={value.preset === p.id ? 'on' : ''} aria-pressed={value.preset === p.id} onClick={() => pick(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="custom">
          <label>From <input type="date" value={value.from} max={value.to || today} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label>
          <label>To <input type="date" value={value.to} min={value.from || undefined} max={today} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label>
        </div>
      )}
      <span className="muted range-label">{rangeLabel(value, new Date(), yearStart)}</span>
    </div>
  )
}
