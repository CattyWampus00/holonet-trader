import { useCallback, useEffect, useState } from 'react'
import type { InventoryItem } from '@shared/types'
import { getStockStatus } from '@shared/stock'
import { api, type Settings } from './api'
import { applyTheme } from './theme'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import SettingsPage from './pages/SettingsPage'
import Prices from './pages/Prices'
import Sales from './pages/Sales'

type Tab = 'dashboard' | 'sales' | 'prices' | 'inventory' | 'settings'
const TABS: [Tab, string][] = [['dashboard', 'Dashboard'], ['sales', 'Sales Log'], ['prices', 'Prices'], ['inventory', 'Inventory'], ['settings', 'Settings']]

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [version, setVersion] = useState(0) // bump to make pages reload their data

  const reload = useCallback(async () => {
    setSettings(await api.getSettings())
    setItems(await api.listItems())
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings])

  useEffect(() => {
    reload()
    return api.onDataChanged(reload)
  }, [reload])

  if (!settings) return null
  const needsSetup = !settings.location
  const lowCount = items.filter((i) => getStockStatus(i.onHand, i.lowThreshold, settings.lowThreshold) !== 'ok').length

  return (
    <div className="app">
      <nav>
        <h1>HOLONET TRADER</h1>
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {id === 'inventory' && lowCount > 0 && <span className="badge">{lowCount}</span>}
          </button>
        ))}
        <div className="spacer" />
        <div className="muted" style={{ fontSize: 12, padding: '0 8px' }}>
          {settings.location ? `${settings.location.characters.length} characters watched` : 'Not connected'}
        </div>
      </nav>
      <main>
        {needsSetup && tab !== 'settings' && (
          <div className="banner">
            HoloNet Trader has not found your mail folder yet.{' '}
            <button className="btn" onClick={() => setTab('settings')}>Set up now</button>
          </div>
        )}
        {tab === 'dashboard' && <Dashboard version={version} items={items} settings={settings} characters={settings.location?.characters ?? []} />}
        {tab === 'sales' && <Sales version={version} characters={settings.location?.characters ?? []} />}
        {tab === 'prices' && <Prices version={version} characters={settings.location?.characters ?? []} />}
        {tab === 'inventory' && <Inventory version={version} items={items} settings={settings} onChange={reload} />}
        {tab === 'settings' && <SettingsPage settings={settings} onChange={reload} />}
      </main>
    </div>
  )
}
