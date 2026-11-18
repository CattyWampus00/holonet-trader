# HoloNet Trader: project status

Last updated: 2026-11-16 (end of session 1)

## Goal
A public Windows desktop app that tracks sales for SWG Legends players from the mails the game saves with `/mailsave` (`/mail`, `/mai`), plus a manually entered inventory with low-stock warnings. The game can't be connected to, so the app only reads files the player creates. Data stays on the player's PC. No accounts, no cloud.

## Why this exists
SWGAide's mail and trading side is broken for the owner's use, and its maintainer has not kept it working for traders. HoloNet Trader is a fresh tool built for traders, not a clone of SWGAide. Rule of thumb for features: does it help someone who sells and stocks goods? Resource, crafting and survey tooling is out of focus unless the owner asks.

## Decisions made with the owner
| Topic | Decision |
|---|---|
| Stack | Electron + TypeScript + React, Vite via electron-vite |
| Storage | Local SQLite through Node's built-in `node:sqlite` (no native compile step) |
| Audience | Public Windows app, local data only. Cross-platform and cloud sync are later ideas |
| v1 scope | Sales tracking, manual inventory, low-stock warnings, reports and charts |
| Name | "HoloNet Trader" (renamed from "SWG Trader" on 2026-11-16 to avoid SWG branding; still check community rules before a public release) |
| Item matching | Exact name match is automatic. Otherwise the player links a name once and it is remembered as an alias |
| Thresholds | Per-item warn level, with a global default (Settings) |
| Duplicates | The game doesn't write duplicate mails. We still dedupe by `(character, file name)` and `(character, mail id)` |
| Quantity | A trailing number in an item name is the crate size, and the price is for the whole crate. No number means 1 |

## What the game writes
Path pattern: `<launcher folder>\profiles\<account>\<server>\mail_<Character>\<mailId>_<unixTimestamp>.mail`
- Example: `D:\SWGLegendsLauncher\profiles\<account>\Omega\mail_<Character>\...`
- The launcher folder can be on any drive and have any name. The `profiles` folder is made by the game.
- One account, one server (Omega), up to 5 characters.
- File format (CRLF): mail id, sender, subject, `TIMESTAMP: <unix>`, then the body.
- Tracked subjects: `Vendor Sale Complete`, `Vendor Item Purchased`, `Vendor Sale Unsuccessful`, `Item Offered to Your Vendor`, `Your Offer to a Vendor`, `Auction Item Expired`, `An update about your vendor`, `Vendor maintenance pool empty!`. Player chat and order mails are ignored.
- **Number styles (found 2026-11-17):** Legends' October 2026 patch made comma-separated numbers the default, which is what broke SWGAide. Mails in the owner's data show credits three ways: plain (`1000000`, most), commas (`1,000,000`, 312 mails) and dots (`650.000`, 5 mails on 15 Aug 2026). The parser strips `,` and `.` as thousands separators in credits and trailing item amounts (`money`/`amount` in `mailParser.ts`). The 5 dot mails had been silently dropped, so `PARSER_VERSION` (in `db.ts`) was added: when it is bumped, the scanner re-reads every mail once (events are unique per character and mail id, so nothing is counted twice). Bump it whenever the parser learns a mail it used to skip. This also closes the "known trap" below.
- Item quirks: crates show as `"Name     25"` (several spaces), resources as `"Steel (Sages) 1000000"`, and some offer prices contain commas.

## What is built and verified
- Parser (`src/shared/mailParser.ts`), tested on hand-written fixtures and, optionally, on the real mail folder.
- Store (`src/main/db.ts`): events, items, aliases, stock moves, scanned files, settings. Tested.
- Auto-detect (`src/main/detect.ts`): looks for `profiles` up to 3 levels below every drive root. Verified on the owner's PC.
- Scanner and folder watcher (`src/main/scanner.ts`, `src/main/index.ts`): scan at startup, on `/mailsave` changes (2 s debounce), and on demand.
- UI: Dashboard, Sales Log (CSV export), Inventory (add, edit, restock, link unmatched), Settings. Dashboard stat strip: Revenue, Sales, Average sale, Spent, Net, and Profit (only shown once item costs exist). Dashboard and Sales Log share a date bar (Today, 7, 30, 90 days, All time, Custom with calendar pickers) that remembers its last choice (`dateRange.ts`, tested). Both also have a Character picker (all characters, or one; lists every character folder the game made, including ones with no mail yet).
- Checks: `npm test` (11 pass), `npm run typecheck` (clean), `npm run build`, app boots and creates its database.

## Known gaps and next steps (in rough order)
1. **Low-stock rule: DONE (2026-11-17).** `getStockStatus` in `src/shared/stock.ts` (tests in `tests/stock.test.ts`): 0 on hand is always "out"; "low" is at or below the warning level; an item with no level uses the app-wide default (5); a level of 0 means "only warn when gone". It was found because an item with 0 on hand and a warn level of 5 showed "OK".
1a. **Power-ups: DONE (2026-11-17).** For Weapon, Armor and Clothing Powerups the trailing number in the mail name is remaining **uses**, not a crate size. The parser (`splitQuantity`/`isPowerup`) now stores quantity 1 and puts the number in a new `events.uses` column. Old rows are migrated once on start-up (a `.before-uses-fix.bak` copy of the database is made first). The Sales Log shows "N uses". Note "Power Bit Pack" items are not power-ups.
1b. **Same-named items with different stats (known limit, not a bug).** In game, items with different stats can share one name (a Luck Armor Attachment with 3 stats vs one with 1 stat), so their prices differ widely (for example 250k vs 700k) under the same name. The mail only shows the name, so this cannot be separated by the app. Crafters can name items anything, and the alias/link system lets the player map the exact name that appears in the mail to an inventory item. The Prices screen should explain this where an item's price range is wide (idea). The earlier "per-vendor price split" idea was wrong and is dropped.
2. **Git: DONE (2026-11-16).** Private repo https://github.com/CattyWampus00/holonet-trader, branch `main`. Commit author is the GitHub noreply address (set per project). **History reset (2026-11-17):** the early commits contained the owner's game account and character names, so the repo was recreated with ONE clean commit (v0.1.0). The original history is kept in the private repo `holonet-trader-old` and in the local branch `old-main` (never push either to the public repo). The repo is still private; the owner decides when it goes public. A draft Release `v0.1.0` exists; the installer (`release/HoloNet Trader Setup 0.1.0.exe`) still has to be attached to it by hand before publishing.
3. **Walk through every screen** in the running app with real mail. Nobody has clicked through the UI yet.
4. **`npm run dist`: DONE (2026-11-17).** Version is now 0.1.1 (Customers tab, Profit box removed, number-format fixes; bump with `npm version <x.y.z> --no-git-tag-version`, then `npm run dist`). Builds `release/HoloNet Trader Setup 0.1.1.exe` (about 119 MB, NSIS, git-ignored) with no Developer Mode needed. The packaged app (`release/win-unpacked`) was run: the menu bar is gone (window chrome 65 px in dev, 39 px packaged), Ctrl+Q quits, tabs render. The installer itself was not installed or run through its wizard. App icon DONE (2026-11-17): `build/icon.svg` is the source (hexagon with a rising price line, no official branding), `build/icon.png` (512 px) is what the installer uses (`build.win.icon`); the icon was confirmed inside the built exe. To change it, edit the SVG and re-render the PNG. Known: unsigned (SmartScreen will warn), the packaged app keeps its own database separate from the dev one.
4b. **Auto-update: DONE (2026-11-17, version 0.1.2).** Uses `electron-updater` (pure JavaScript). The installed app checks GitHub Releases 10 seconds after start, downloads quietly, and installs when the app is closed; a Settings switch ("Check for updates automatically", on by default, setting key `autoUpdate`) turns it off. It never runs in development. It only works while the repo is public. **Release procedure for every new version:** `npm version x.y.z --no-git-tag-version`, `npm run dist`, then create a GitHub Release `vx.y.z` and upload THREE files from `release/`: `HoloNet-Trader-Setup-x.y.z.exe`, its `.blockmap`, and `latest.yml` (the updater reads `latest.yml`; the exe name has no spaces on purpose, because GitHub rewrites spaces in file names and the updater would not find the file). Installs of 0.1.1 or older have no updater, so they install 0.1.2 by hand once.
5. **Before shipping:** hide or replace the default Electron menu (File, Edit, View, Window). Kept on purpose during development for DevTools (Ctrl+Shift+I) and Reload (Ctrl+R). **Menu step DONE (2026-11-17):** the default menu is removed only in the installed app (`app.isPackaged`, so dev keeps DevTools and Reload). The app has its own exit and full-screen controls: F11 toggles full screen, Esc leaves it, Ctrl+Q quits, and Settings has "Toggle full screen" and "Exit HoloNet Trader" buttons (checked with real key presses in the running app; the hidden menu itself needs the installer test, step 4). Still to do: add an app icon, auto-update (GitHub releases), and consider code signing (unsigned installers show a SmartScreen warning).
6. Check community rules for third-party SWG Legends tools and keep official branding out of the app.
7. UI redesign: hand `docs/UI_BRIEF.md` to a design agent.
8. **Themes** (DONE and LOCKED, 2026-11-16: owner approved all 8; guarded by tests/themes.lock.test.ts): player-selectable color themes saved in Settings. Each theme has its own personality, not just colors: corner roundness (`--r`), heading font/case/spacing, and card/button effects (`--card-fx`, `--btn-fx`) — Imperial is square with a red top edge, Rebel has a bold edge bar and industrial headings, Jedi is very round with a glow and serif headings, Mos Eisley is light with soft shadows. Palettes are CSS variable blocks (`[data-theme="..."]` in `src/renderer/src/styles.css`); the list lives in `src/shared/themes.ts`. Eight themes: Holonet (default), Imperial, Rebel Alliance, Jedi, Sith, Hutt Cartel, Bounty Hunter, Mos Eisley (light). Still to consider: player-made theme files dropped into a folder. Rules: plain color palettes only (no logos, emblems or official fonts); keep text labels on status pills so color is never the only signal; check contrast of low/out colors in every theme. To add a theme: add one CSS block plus one entry in `themes.ts`.
9. Ideas for later: crafting and resource tracking, price history, per-vendor views, notification settings, other servers if they exist.

## Feature ideas that fit a trader (from comparing with SWGAide, 2026-11-16)
SWGAide is mostly about resources, crafting and surveying. Its sales tracking is thin, so HoloNet Trader's niche is trading. The owner doesn't use survey/ISD data much, so resource features are low priority and can stay with SWGAide. These ideas all use mail data we already read:
1. **Price history per item (DONE, 2026-11-16: Prices tab with an item detail drawer and chart).** Rules, kept in sync with the tests: prices are per single unit (price / quantity, so crates and resource amounts compare fairly); "recent price" is the median of the last 5 sales in the selected range and character filter; the trend compares it with the median of the 5 sales before (needs 7+ sales in total, a move within 5% is flat); items are grouped by `item_key`; sales only (no purchases or offers). Code: `src/shared/priceStats.ts`, `priceList`/`priceSeries` in `src/main/db.ts`, `pages/Prices.tsx`, `components/PriceDetail.tsx`. Ideas left: suggested listing price, price alerts, grouping alias names, a note on wide price ranges (same-name items), "you paid" line from purchases.
2. **Days of stock left:** sales rate + inventory count gives "runs out in about N days", feeding the low-stock warnings.
3. **Vendor health screen:** per vendor sales, empty-vendor and empty-maintenance alerts, vendor location (the maintenance mail has coordinates).
4. **Relist list:** items from "unsold" and "expired" mails that need listing again.
5. **Flip profit:** match purchases to later sales of the same item name, so profit needs no manual cost entry.
6. **Offers inbox:** buy offers made to your vendors, with a dismiss button.
7. **Customers:** top and repeat buyers; **busiest times:** sales by hour and weekday.
7b. **Customers tab (DONE, 2026-11-17, owner's idea):** one row per buyer with credits spent (default sort), purchases, items and last bought; sortable, searchable, same date and character filters. Items rule: a crate counts all its contents, a resource sale counts as 1 (`itemsInSale` in `src/shared/customers.ts`, tested). Code: `customerList` in `db.ts`, `pages/Customers.tsx`.
8. **Unrecognized-mails counter** (finds new mail types like the survey one), backup/export of the database.

## Mail types discovered but NOT parsed yet
### Interplanetary survey droid (found 2026-11-16)
- Sender `SWG.Omega.interplanetary survey droid`, subject `Interplanetary Survey: <Planet> - <Resource class>` (e.g. `Mustafar - Mineral`). A real sample is saved at `tests/fixtures/survey-mustafar-mineral.mail` (it contains no player data).
- Body: `Planet:` and `Resource Class:` lines (wrapped in `\#pcontrast` color codes), then an indented tree: category > sub-category > resource type > one or more resource names. A resource name is the last, color-coded line and ends with `\#.`.
- It lists **which resource names are currently spawned**, per resource type. It does NOT contain concentration percentages. The third-party description we were given suggested it might, but this sample shows names only.
- The owner's data: 12 of these on one character, none on the others. Planet and class pairs seen: Yavin4 Chemical, Tatooine Geothermal Energy, Talus Wind Energy and Flora, Naboo / Mustafar / Lok / Kashyyyk Mineral, Endor Chemical, Dathomir Water, Dantooine Solar Energy, Corellia Gas.
- Possible feature: a Resources screen (current spawns per planet and class, newest survey wins, history of when a name was last seen). Needs design with the owner first.
- **Known trap (FIXED 2026-11-17):** the scanner marks every file it reads as scanned, including mails the parser skipped. Fixed with `PARSER_VERSION` in `db.ts`: bump it and every mail is re-read once.
- **Dashboard Profit box REMOVED (owner's call, 2026-11-17):** it showed -163M while the owner has made 3+ billion since April, because it only counted sales of items with a cost entered. Revenue, purchases and "Net after purchases" are what the owner trusts. The Inventory "Cost each" field still exists but nothing uses it now.

## Handy commands
```bash
npm run dev        # run with hot reload
npm start          # run the built app (needs npm run build first)
npm run build      # build main, preload and renderer into out/
npm test           # unit tests
npm run typecheck  # TypeScript check
npm run dist       # Windows installer into release/ (builds fine; see step 4 above)
```
Optional live checks:
```bash
SWG_MAIL_DIR="D:\SWGLegendsLauncher\profiles\<account>\Omega\mail_<Character>" npx vitest run tests/corpus.test.ts
SWG_DETECT=1 npx vitest run tests/detect.test.ts
HT_DB="C:\Users\<you>\AppData\Roaming\holonet-trader\holonettrader.db" npx vitest run tests/prices.live.test.ts --disableConsoleIntercept
```
Double-click `Launch HoloNet Trader.bat` to start the app from source. On a fresh copy (for example a GitHub zip, which has no `node_modules`) it installs the dependencies and builds first; it needs Node.js installed. Newer npm blocks dependency install scripts, which skipped Electron's own binary download, so `package.json` has a `postinstall` that runs it (found and fixed 2026-11-17 by testing a clean copy). Players should use the installer, not the `.bat`.
