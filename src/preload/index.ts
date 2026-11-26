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
  structureMails: () => call('structureMails'),
  dismissMail: (id: number) => call('dismissMail', id),
  linkMail: (eventId: number, structureId: number) => call('linkMail', eventId, structureId),
  removeStructureName: (id: number, name: string) => call('removeStructureName', id, name),
  transferStructure: (id: number, to: string) => call('transferStructure', id, to),
  listItems: () => call('inventory:list'),
  saveItem: (item: unknown) => call('inventory:save', item),
  deleteItem: (id: number) => call('inventory:delete', id),
  adjustStock: (id: number, delta: number, reason: string) => call('inventory:adjust', id, delta, reason),
  setArchived: (id: number, archived: boolean) => call('inventory:archive', id, archived),
  unmatched: () => call('unmatched:list'),
  ignoreName: (key: string) => call('unmatched:ignore', key),
  unignoreName: (key: string) => call('unmatched:unignore', key),
  ignoredNames: () => call('unmatched:ignored'),
  machineTypes: () => call('machineTypes:list'),
  saveMachineType: (t: unknown) => call('machineTypes:save', t),
  deleteMachineType: (id: number) => call('machineTypes:delete', id),
  structures: () => call('structures:list'),
  saveStructure: (s: unknown) => call('structures:save', s),
  deleteStructure: (id: number) => call('structures:delete', id),
  setStructureState: (id: number, state: string) => call('structures:setState', id, state),
  addReading: (id: number, r: unknown) => call('structures:reading', id, r),
  setHarvesterResource: (id: number, res: unknown) => call('harvester:setResource', id, res),
  resourceHistory: (id: number) => call('harvester:history', id),
  resourceTarget: (res: unknown) => call('harvester:target', res),
  emptyHopper: (id: number, amount: number) => call('harvester:empty', id, amount),
  hopperLog: (id: number) => call('harvester:log', id),
  linkAlias: (key: string, itemId: number) => call('unmatched:link', key, itemId),
  linkedNames: (itemId?: number) => call('aliases:list', itemId),
  unlinkAlias: (key: string) => call('aliases:unlink', key),
  onDataChanged: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('data-changed', h)
    return () => ipcRenderer.removeListener('data-changed', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
