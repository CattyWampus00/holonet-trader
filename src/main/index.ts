import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LOW_THRESHOLD, getStockStatus, needsRestock } from '../shared/stock'
import { DEFAULT_THEME, isThemeId, type ThemeId } from '../shared/themes'
import type { DetectedLocation } from '../shared/types'
import { Store } from './db'
import { detectLocations, readServerDir, resolveFromPick } from './detect'
import { scan } from './scanner'

let win: BrowserWindow | null = null
let store: Store
let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

const globalThreshold = () => Number(store.getSetting('lowThreshold') ?? DEFAULT_LOW_THRESHOLD)
const savedTheme = (): ThemeId => {
  const t = store.getSetting('theme')
  return isThemeId(t) ? t : DEFAULT_THEME
}

/** On unless the player switched it off in Settings. */
const autoUpdateOn = () => store.getSetting('autoUpdate') !== '0'

/**
 * Asks GitHub Releases whether a newer version exists (installed app only, never in development) and downloads it
 * quietly. It installs when the player next closes the app. This is the only time the app talks to the internet.
 */
function checkForUpdates() {
  if (!app.isPackaged || !autoUpdateOn()) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    if (Notification.isSupported()) new Notification({ title: 'HoloNet Trader update ready', body: `Version ${info.version} installs when you close the app.` }).show()
  })
  autoUpdater.on('error', () => { /* offline, or no newer release yet: nothing to tell the player */ })
  autoUpdater.checkForUpdates().catch(() => {})
}

function currentLocation(): DetectedLocation | null {
  const dir = store.getSetting('serverDir')
  return dir ? readServerDir(dir) : null
}

function runScan() {
  const loc = currentLocation()
  if (!loc) return null
  const r = scan(store, loc)
  for (const id of r.lowItemIds) {
    const item = store.getItem(id)
    if (!item || !needsRestock(item, globalThreshold())) continue
    const status = getStockStatus(item.onHand, item.lowThreshold, globalThreshold())
    if (Notification.isSupported()) {
      new Notification({
        title: status === 'out' ? 'Out of stock' : 'Low stock',
        body: `${item.name}: ${item.onHand} left`
      }).show()
    }
  }
  if (r.added > 0) win?.webContents.send('data-changed')
  return r
}

function startWatching() {
  watcher?.close()
  watcher = null
  const dir = store.getSetting('serverDir')
  if (!dir) return
  try {
    // The game writes a new file whenever the player runs /mailsave, so a recursive watch is enough.
    watcher = watch(dir, { recursive: true }, () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(runScan, 2000)
    })
  } catch {
    /* folder vanished (drive unplugged); the manual Scan button still works */
  }
}

function registerIpc() {
  ipcMain.handle('settings:get', () => ({
    serverDir: store.getSetting('serverDir'),
    lowThreshold: globalThreshold(),
    location: currentLocation(),
    theme: savedTheme(),
    autoUpdate: autoUpdateOn(),
    version: app.getVersion() // from package.json, so the installed app shows the version it was built as
  }))
  ipcMain.handle('settings:setAutoUpdate', (_e, on: unknown) => store.setSetting('autoUpdate', on === false ? '0' : '1'))
  ipcMain.handle('settings:setTheme', (_e, id: unknown) => {
    if (isThemeId(id)) store.setSetting('theme', id)
  })
  ipcMain.handle('settings:setThreshold', (_e, n: number) => store.setSetting('lowThreshold', String(Math.max(0, Math.floor(n)))))
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:toggleFullScreen', () => { win?.setFullScreen(!win.isFullScreen()) })
  ipcMain.handle('location:detect', () => detectLocations())
  ipcMain.handle('location:pick', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Select your SWG Legends launcher folder' })
    return r.canceled || !r.filePaths[0] ? [] : resolveFromPick(r.filePaths[0])
  })
  ipcMain.handle('location:set', (_e, dir: string) => {
    store.setSetting('serverDir', dir)
    startWatching()
    return runScan()
  })
  ipcMain.handle('scan', () => runScan())
  ipcMain.handle('events', (_e, f) => store.listEvents(f ?? {}))
  ipcMain.handle('summary', (_e, from: number, to: number, character?: string) => store.summary(from, to, character || undefined))
  ipcMain.handle('prices:list', (_e, from: number, to: number, character?: string) => store.priceList(from, to, character || undefined))
  ipcMain.handle('prices:series', (_e, key: string, from: number, to: number, character?: string) =>
    typeof key === 'string' && key ? store.priceSeries(key, from, to, character || undefined) : { row: null, points: [] }
  )
  ipcMain.handle('customers:list', (_e, from: number, to: number, character?: string) => store.customerList(from, to, character || undefined))
  ipcMain.handle('vendorAlerts', () => store.vendorAlerts())
  ipcMain.handle('inventory:list', () => store.listItems())
  ipcMain.handle('inventory:save', (_e, item) => store.saveItem(item))
  ipcMain.handle('inventory:delete', (_e, id: number) => store.deleteItem(id))
  ipcMain.handle('inventory:adjust', (_e, id: number, delta: number, reason: string) => store.adjustStock(id, delta, reason))
  ipcMain.handle('inventory:archive', (_e, id: number, archived: boolean) => store.setArchived(id, archived === true))
  ipcMain.handle('unmatched:list', () => store.unmatched())
  ipcMain.handle('unmatched:ignore', (_e, key: string) => store.ignoreName(key))
  ipcMain.handle('unmatched:unignore', (_e, key: string) => store.unignoreName(key))
  ipcMain.handle('unmatched:ignored', () => store.ignoredNames())
  ipcMain.handle('machineTypes:list', () => store.listMachineTypes())
  ipcMain.handle('machineTypes:save', (_e, t) => store.saveMachineType(t))
  ipcMain.handle('machineTypes:delete', (_e, id: number) => store.deleteMachineType(id))
  ipcMain.handle('structures:list', () => store.listStructures())
  ipcMain.handle('structures:save', (_e, s) => store.saveStructure(s))
  ipcMain.handle('structures:delete', (_e, id: number) => store.deleteStructure(id))
  ipcMain.handle('structures:setState', (_e, id: number, state: unknown) => {
    if (state === 'running' || state === 'idle' || state === 'packed') store.setStructureState(id, state)
  })
  ipcMain.handle('structures:reading', (_e, id: number, r) => store.addReading(id, r))
  ipcMain.handle('unmatched:link', (_e, key: string, itemId: number) => store.linkAlias(key, itemId))
  ipcMain.handle('aliases:list', (_e, itemId?: number) => store.linkedNames(itemId))
  ipcMain.handle('aliases:unlink', (_e, key: string) => store.unlinkAlias(key))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640, backgroundColor: '#0f1115', title: 'HoloNet Trader',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  // Without the default menu there is no File > Exit, so the app provides its own shortcuts.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !win) return
    const key = input.key.toLowerCase()
    if (key === 'f11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault() }
    else if (key === 'escape' && win.isFullScreen()) { win.setFullScreen(false); event.preventDefault() }
    else if (key === 'q' && input.control) { app.quit(); event.preventDefault() }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // The default Electron menu (File, Edit, View...) stays during development for DevTools and Reload,
  // and is removed in the installed app.
  if (app.isPackaged) Menu.setApplicationMenu(null)
  store = new Store(join(app.getPath('userData'), 'holonettrader.db'))
  registerIpc()
  createWindow()
  startWatching()
  win?.webContents.once('did-finish-load', () => setTimeout(runScan, 500))
  setTimeout(checkForUpdates, 10_000) // after the window is up, so start-up is never slowed
})

app.on('window-all-closed', () => { watcher?.close(); app.quit() })
