import { useEffect, useState } from 'react'
import { api } from '../api'
import { pastYears } from '../dateRange'

/** The years before the current financial year that have sales (reloaded when data or the year start changes). */
export function usePastYears(version: number, yearStart: number | null): number[] {
  const [years, setYears] = useState<number[]>([])
  useEffect(() => { api.salesYears().then((y) => setYears(pastYears(y, yearStart))) }, [version, yearStart])
  return years
}

/**
 * Year control for the Sales Log and Customers (docs/YEAR_END_PLAN.md, Step 5). "Current year" is the default and is
 * never remembered, so the tabs always open on the current year. Hidden until a year has been closed.
 */
export default function YearSelect({ years, value, yearStart, onChange }: { years: number[]; value: number | null; yearStart: number | null; onChange: (y: number | null) => void }) {
  if (!years.length || yearStart == null) return null
  return (
    <label className="charselect">
      <span className="muted">Year</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Current ({new Date(yearStart * 1000).getFullYear()})</option>
        {years.map((y) => <option key={y} value={y}>{y} (closed)</option>)}
      </select>
    </label>
  )
}
