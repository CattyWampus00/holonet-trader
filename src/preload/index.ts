import { contextBridge, ipcRenderer } from 'electron'

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
  getSettings: () => call('settings:get'),
  setThreshold: (n: number) => call('settings:setThreshold', n),
  setTheme: (id: string) => call('settings:setTheme', id),
  setAutoUpdate: (on: boolean) => call('settings:setAutoUpdate', on),
  quitApp: () => call('app:quit'),
  toggleFullScreen: () => call('app:toggleFullScreen'),
  detectLocations: () => call('location:detect'),
  pickLocation: () => call('location:pick'),
  setLocation: (dir: string) => call('location:set', dir),
  scan: () => call('scan'),
  events: (f?: unknown) => call('events', f),
  summary: (from: number, to: number, character?: string) => call('summary', from, to, character),
  priceList: (from: number, to: number, character?: string) => call('prices:list', from, to, character),
  priceSeries: (key: string, from: number, to: number, character?: string) => call('prices:series', key, from, to, character),
  customerList: (from: number, to: number, character?: string) => call('customers:list', from, to, character),
  vendorAlerts: () => call('vendorAlerts'),
  listItems: () => call('inventory:list'),
  saveItem: (item: unknown) => call('inventory:save', item),
  deleteItem: (id: number) => call('inventory:delete', id),
  adjustStock: (id: number, delta: number, reason: string) => call('inventory:adjust', id, delta, reason),
  unmatched: () => call('unmatched:list'),
  linkAlias: (key: string, itemId: number) => call('unmatched:link', key, itemId),
  linkedNames: (itemId: number) => call('aliases:list', itemId),
  unlinkAlias: (key: string) => call('aliases:unlink', key),
  onDataChanged: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('data-changed', h)
    return () => ipcRenderer.removeListener('data-changed', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
