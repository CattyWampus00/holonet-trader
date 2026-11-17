# HoloNet Trader

A desktop app for **SWG Legends** traders. It reads the mail files the game saves when you run `/mailsave`, and turns your vendor sales into a sales log, price history, charts and low-stock warnings for an inventory you enter by hand.

It never connects to the game or to the internet. It only reads the mail files you save, and everything stays on your computer. It never writes into the game's folders.

## Install (players)

1. Download **HoloNet Trader Setup** (`.exe`) from the **Releases** page of this repository.
2. Run it. Windows may show a blue "Windows protected your PC" (SmartScreen) box because the app is not code-signed yet. Choose **More info**, then **Run anyway**.
3. Pick an install folder if you like. The installer puts a **HoloNet Trader** icon on your desktop and in the Start menu.
4. Start the app from that icon.

## First run

1. In the game, run `/mailsave` (also `/mail` or `/mai`) so the game writes your mail to disk.
2. Open **Settings** in HoloNet Trader and press **Auto-detect**. If it does not find your launcher folder, press **Browse...** and choose it (the folder that holds `profiles`).
3. The app scans your mail and watches the folder, so new sales appear after each `/mailsave`.

## What it shows

- **Dashboard:** revenue, sales, purchases, a revenue-per-day chart, top items and vendors.
- **Sales Log:** every sale with search, date range, character filter and CSV export.
- **Prices:** what each item really sells for per unit, a recent price, and an up/flat/down trend.
- **Inventory:** items you count by hand. Sales reduce stock, and you get a warning when an item runs low.
- **Settings:** mail folder, eight themes, low-stock level, exit and full screen (F11 toggles full screen, Esc leaves it, Ctrl+Q quits).

## Run from source (developers)

You need [Node.js](https://nodejs.org) (LTS). Then either double-click `Launch HoloNet Trader.bat`, or:

```bash
npm install
npm run dev      # run with hot reload
npm test         # tests
npm run dist     # build the Windows installer into release/
```

The `.bat` installs dependencies and builds on its first run. Players do not need it, they use the installer. See `docs/PROJECT_STATUS.md` for how the app is built and what is planned.

## Notes

- Unofficial fan tool. It has no connection to the game's makers.
- Windows only for now.
