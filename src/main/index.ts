import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { DEFAULT_LOW_THRESHOLD, getStockStatus, needsRestock } from '../shared/stock'
import { DEFAULT_THEME, isThemeId, type ThemeId } from '../shared/themes'
import type { DetectedLocation } from '../shared/types'
import { Store } from './db'
import { detectLocations, readServerDir, resolveFromPick } from './detect'
import { scan } from './scanner'
import { canCloseYear, lateMail, yearStartFrom, type YearCount } from '../shared/yearArchive'

let win: BrowserWindow | null = null
let store: Store
let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

const globalThreshold = () => Number(store.getSetting('lowThreshold') ?? DEFAULT_LOW_THRESHOLD)
const savedTheme = (): ThemeId => {
  const t = store.getSetting('theme')
  return isThemeId(t) ? t : DEFAULT_THEME
}

/** A JSON setting, or `fallback` when missing or unreadable. */
function jsonSetting<T>(key: string, fallback: T): T {
  try { const v = store.getSetting(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
/** Closed financial years (docs/YEAR_END_PLAN.md). The current year starts on Jan 1 after the newest. Nothing is deleted. */
const closedYears = (): number[] => jsonSetting<number[]>('closedYears', []).filter((y) => Number.isInteger(y))
/** Where each year's archive was last saved, so a late-mail update (Step 4) can rewrite it in the same place. */
const archiveFolders = (): Record<string, string> => jsonSetting<Record<string, string>>('archiveFolders', {})
/** How many sales and purchases each year's archive held when last saved. More in the database now = late mail. */
const archivedCounts = (): Record<string, YearCount> => jsonSetting<Record<string, YearCount>>('archivedCounts', {})

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

/** The last folder a year archive was saved to; "Open folder" only ever opens this one. */
let lastArchiveFolder: string | null = null

/**
 * True when `folder` is in the game's folders: the launcher folder that holds `profiles\<account>\<server>` (or the
 * server folder itself if the path looks different). The app only reads there, so archives must go elsewhere.
 */
function insideGameFolder(folder: string): boolean {
  const dir = store.getSetting('serverDir')
  if (!dir) return false
  const i = dir.toLowerCase().lastIndexOf(`${sep}profiles${sep}`)
  const root = i > 0 ? dir.slice(0, i) : dir
  const rel = relative(root.toLowerCase(), folder.toLowerCase())
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
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
    salesYearStart: yearStartFrom(closedYears()),
    closedYears: closedYears(),
    closeSnoozed: Number(store.getSetting('closeSnoozed')) || null,
    version: app.getVersion() // from package.json, so the installed app shows the version it was built as
  }))
  ipcMain.handle('settings:setAutoUpdate', (_e, on: unknown) => store.setSetting('autoUpdate', on === false ? '0' : '1'))

  // Year archive and year-end close (docs/YEAR_END_PLAN.md). Archives only read the database. Closing adds the year to
  // the closed list after its archive is saved and checked; reopening takes it off. No sales are ever deleted.
  ipcMain.handle('archive:years', () => store.salesYears())
  /** Saves the archive into `folder` and remembers where, and how many sales it held (for late mail). */
  const writeArchive = (year: number, folder: string) => {
    if (insideGameFolder(folder)) return { error: "That folder is inside the game's folders, and the app never writes there. Pick another one, such as Documents." }
    try {
      const out = store.exportYear(year, folder)
      lastArchiveFolder = folder
      store.setSetting('archiveFolders', JSON.stringify({ ...archiveFolders(), [year]: folder }))
      store.setSetting('archivedCounts', JSON.stringify({ ...archivedCounts(), [year]: { sales: out.sales, purchases: out.purchases } }))
      return out
    } catch (e) {
      return { error: `The archive could not be saved, so nothing was changed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  /** Folder picker, then the archive. null = cancelled. */
  const saveArchive = async (year: number, title: string) => {
    const suggested = archiveFolders()[year] ?? join(app.getPath('documents'), 'HoloNet Trader Archives')
    const r = await dialog.showOpenDialog(win!, { title, defaultPath: suggested, properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return writeArchive(year, r.filePaths[0])
  }
  // Late mail (Step 4): closed years whose archive is behind the database.
  ipcMain.handle('archive:late', () => lateMail(closedYears(), archivedCounts(), store.yearCounts(), jsonSetting<Record<string, number>>('lateDismissed', {})))
  /** Rewrites a closed year's archive in the folder it was saved to; asks for a folder only if that one is gone. */
  ipcMain.handle('archive:updateYear', async (_e, year: unknown) => {
    if (typeof year !== 'number' || !closedYears().includes(year)) return { error: `${String(year)} is not a closed year.` }
    const folder = archiveFolders()[year]
    if (folder && existsSync(folder)) return writeArchive(year, folder)
    return saveArchive(year, `The ${year} archive folder was not found. Choose where to save it`)
  })
  /** "Not now": hide the notice until more mail for that year arrives. */
  ipcMain.handle('archive:dismissLate', (_e, year: unknown) => {
    if (typeof year !== 'number') return
    const c = store.yearCounts()[year]
    if (c) store.setSetting('lateDismissed', JSON.stringify({ ...jsonSetting<Record<string, number>>('lateDismissed', {}), [year]: c.sales + c.purchases }))
  })
  ipcMain.handle('archive:exportYear', async (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year)) return { error: 'No year chosen.' }
    return saveArchive(year, `Choose a folder for the ${year} archive`)
  })
  ipcMain.handle('archive:closeYear', async (_e, year: unknown) => {
    if (typeof year !== 'number' || !canCloseYear(year, new Date(), closedYears())) return { error: `${String(year)} can't be closed now.` }
    const out = await saveArchive(year, `Choose a folder for the ${year} archive, then the year closes`)
    if (!out || 'error' in out) return out // cancelled or failed: the year stays open
    store.setSetting('closedYears', JSON.stringify([...closedYears(), year].sort((a, b) => a - b)))
    return out
  })
  ipcMain.handle('archive:reopenYear', (_e, year: unknown) => {
    const closed = closedYears()
    if (typeof year !== 'number' || year !== Math.max(...closed)) return // only the newest closed year reopens
    store.setSetting('closedYears', JSON.stringify(closed.filter((y) => y !== year)))
  })
  ipcMain.handle('archive:snooze', (_e, year: unknown) => { if (typeof year === 'number') store.setSetting('closeSnoozed', String(year)) })
  ipcMain.handle('archive:openFolder', () => { if (lastArchiveFolder) void shell.openPath(lastArchiveFolder) })
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
  ipcMain.handle('structureMails', () => store.structureMails())
  ipcMain.handle('vendorNames', () => store.vendorNames())
  ipcMain.handle('dismissMail', (_e, id: number) => store.dismissMail(id))
  ipcMain.handle('linkMail', (_e, eventId: number, structureId: number) => store.linkMail(eventId, structureId))
  ipcMain.handle('removeStructureName', (_e, id: number, name: string) => store.removeStructureName(id, name))
  ipcMain.handle('transferStructure', (_e, id: number, to: string) => store.transferStructure(id, to))
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
  ipcMain.handle('harvester:setResource', (_e, id: number, res) => store.setHarvesterResource(id, res))
  ipcMain.handle('harvester:history', (_e, id: number) => store.resourceHistory(id))
  ipcMain.handle('harvester:target', (_e, res) => store.resourceTarget(res))
  ipcMain.handle('harvester:empty', (_e, id: number, amount: number) => store.emptyHopper(id, amount))
  ipcMain.handle('harvester:log', (_e, id: number) => store.hopperLog(id))
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
