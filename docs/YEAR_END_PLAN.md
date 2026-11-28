# Year-end sales archive: plan

Status: All 5 steps DONE (2026-11-27).

Goal: on Jan 1 the player starts a fresh sales year (the Dashboard, Sales Log and Customers start at 0), and the year that
ended is kept as an archive they can save and look back at.

## Owner's decisions (2026-11-27)

- **The year ends at local midnight** on the player's PC, not at server time.
- **Prices keep last year.** The Prices tab still shows earlier sales as a pricing reference.
- **Customers: archive and start fresh.** Last year's customer list goes into the archive. The Customers tab starts
  empty on Jan 1.

## Key design choice: hide the old year, never delete it

The first idea was to delete last year's sales on Jan 1. Three facts make that the wrong move:

1. **Old mail would come back.** Sales are read from `/mailsave` files, and those files stay in the game folder (the
   app never writes there). Duplicates are prevented by `INSERT OR IGNORE` on (character, mail id). Deleting the rows
   would delete that memory, and the next scan would import last year again.
2. **Prices need the old sales.** The Prices tab is built from sale rows. Deleting them would wipe the price history
   the owner wants to keep.
3. **Stock uses them.** Stock math uses each item's `tracking_since` and the sales after it. Deleting sales could change
   on-hand counts.

So **closing a year = save the archive files + set a "sales year starts" date.**
- The Dashboard, Sales Log and Customers never look before that date.
- Prices does look before it.
- Every row stays in the database, so duplicate protection, prices and stock are untouched.
- Closing can be undone ("Reopen 2026"), because nothing was removed.

Size: about 8,000 mail rows so far. Years of sales are still a small database, so no clean-up is needed. A "delete
sales older than N years" option can come later if it ever matters.

## What carries over on Jan 1

| Data | After closing the year |
|---|---|
| Dashboard, Sales Log | Start at 0 (only sales on or after the year start) |
| Customers | Fresh list. Last year's list is in the archive |
| Prices | Unchanged: keeps all years |
| Inventory items, on-hand counts, cost, warn levels | Carry over (stock is still on the vendors) |
| Links, ignored names, archived items | Carry over |
| Structures, readings, countdowns | Carry over |

Sales are dated by the game's own time stamp, not when the mail was read. A sale at 11:58 pm on Dec 31 belongs to the
old year even if `/mailsave` runs on Jan 2.

## Build steps

### Step 1: year start and "This year" (DONE 2026-11-27)
- New setting `sales_year_start` (unix seconds, local midnight Jan 1; unset = no year closed yet).
- Pure function in `src/renderer/src/dateRange.ts`: `clampToYear(bounds, yearStart)` raises `from` to the year start.
  Dashboard, Sales Log and Customers use it. Prices does not.
- New date preset **This year** (Jan 1 local to today). After a close, "All time" on the clamped tabs reads
  "All of 2027" so it isn't misleading.
- Tests: clamping, the Jan 1 local-midnight boundary, a time zone where UTC is on a different day.
- Built: setting `salesYearStart` (read in `settings:get`, set with `api.setSalesYearStart(ts | null)`, no button yet: that is Step 3). `clampToYear` and the `year` preset in `dateRange.ts`; `DateRangeBar` takes `yearStart` and labels "Since 1 Jan 2027". Dashboard, Sales Log and Customers clamp; Prices does not. Customers needs nothing more: `customerList` only reads sales inside the range, so the list starts fresh. Checked on a copy of real data: closing hid the old sales on the three tabs, Prices kept all 682 items, and reopening brought every number back.

### Step 2: archive files (DONE 2026-11-27)
- `Store.exportYear(year, folder)` writes:
  - `HoloNet-2026.db`: a full copy made with SQLite `VACUUM INTO` (built into node:sqlite, no native module).
  - `Sales-2026.csv`: every sale and purchase of the year (date, character, vendor, item, quantity, price, buyer).
    Opens in Excel.
  - `Customers-2026.csv`: the year's customer list (buyer, sales, credits, first and last purchase).
  - `Summary-2026.csv`: totals by character, by vendor and by item.
- CSV building is a pure function in `src/shared/` with tests (commas, quotes and color codes in item names).
- Files go to a folder the player picks (default Documents\HoloNet Trader Archives). Never the game folder.
- Built:
  - `src/shared/yearArchive.ts` (pure): `yearBounds`, `archiveFiles`, `toCsv` (adds a byte-order mark so Excel reads
    accents), `salesCsv` (the Sales Log export uses it too), `customersCsv` (the Customers columns: buyer, credits,
    purchases, items, last purchase), `summaryCsv`.
  - `Store.exportYear(year, folder)`: each file is written as `.tmp` and then renamed. The database copy is made with
    `VACUUM INTO`, then reopened to check its sale count. `Store.salesYears()` lists years that have sales.
  - IPC `archive:years`, `archive:exportYear` (folder picker; refuses a folder inside the launcher folder that holds
    `profiles`) and `archive:openFolder` (opens only the last archive folder).
  - Settings has a **Year archive** section: pick a year, Save, Open folder.
  - Tests in `tests/yearArchive.test.ts`.
  - Checked on a copy of real data: 7,801 sales and 42 purchases, 1,336 customers and the year's revenue all matched
    the app. It took 0.15 s, and nothing in the database changed.

### Step 3: close the year (DONE 2026-11-27)
- Built:
  - **A list of closed years replaced the single start date from Step 1.** Settings `closedYears` (JSON) feeds
    `yearStartFrom`: Jan 1 after the newest closed year. `closeSnoozed` stores "Not now". `archiveFolders` remembers
    where each year was saved, for Step 4.
  - Pure rules in `yearArchive.ts`:
    - `canCloseYear`: a year can close once it has ended, or from Dec 26 of that year. Never twice, never older than a
      closed year.
    - `closeReminder`: about the ending year from Dec 26, about last year from Jan 1. It is "due" until Jan 7, then
      "late" (the quiet banner style).
  - IPC:
    - `archive:closeYear`: folder picker, archive, check, and only then adds the year to the list. A cancel or an error
      leaves the year open.
    - `archive:reopenYear`: the newest closed year only.
    - `archive:snooze`.
  - UI:
    - `components/CloseYear.tsx`: the three-item checklist must be ticked before "Choose folder and close" works.
    - The Dashboard reminder has Close and Not now buttons.
    - Settings, **Financial year** section: shows what is current, Close (only for years that can close) and Reopen
      (asks to confirm).
  - Checked on a scratch copy of real data with a fake 2025 sale:
    - The late reminder showed. Not now hid it.
    - The checklist blocked the button until all three boxes were ticked.
    - With 2025 marked closed, the Dashboard read "Since Jan 1, 2026", and Reopen restored everything.
    - Not checked on screen: the close through the Windows folder picker, which the test tool cannot click. The
      archive export behind it was checked in Step 2.
- A banner from **Dec 26 to Jan 7** (local): "2026 is ending. Close the year once your last December mail is saved."
  If not closed by Jan 8 it stays, more quietly, with a "Not now" option, until the player closes the year.
- **Close 2026** opens a short checklist (see "Your part" below), then a folder picker, then:
  1. Write the archive files.
  2. Check they exist and the sales count in the CSV matches the database.
  3. Only then set `sales_year_start` to Jan 1, 2027 00:00 local.
  If step 1 or 2 fails, nothing changes and the error is shown.
- The app never closes the year by itself at midnight: late-December mail may not be saved yet.
- Settings gets **Reopen 2026** (clears `sales_year_start`), with a note that the archive files stay where they are.

### Step 4: late mail (DONE 2026-11-27)
- Sales dated before the year start that arrive after the close still import normally (no duplicates) and show on
  Prices. The Dashboard then shows: "3 sales from 2026 arrived after you closed the year. Update the 2026 archive?"
  That rewrites the files in the same folder.
- Built:
  - Every archive save remembers how many sales and purchases it held (setting `archivedCounts`). `Store.yearCounts()`
    counts them per local year in the database now. Late mail = a closed year whose count grew. Re-reading the same
    mail doesn't count, because duplicates are never inserted.
  - Pure `lateMail(closed, archived, current, dismissed)` and `lateMailText` ("1 sale and 2 purchases") in
    `yearArchive.ts`.
  - IPC `archive:late`, `archive:updateYear` (rewrites into the saved folder; only if that folder is gone does it ask
    for one, still refusing the game folder) and `archive:dismissLate` ("Not now" remembers the database total, so the
    notice returns if more mail for that year arrives).
  - Dashboard banner with **Update 2026 archive** and **Not now**, then a result line with Open folder.
  - Found on the way: `events` has a `y` column (vendor spot), so `GROUP BY y` grouped by it instead of the year
    alias. The year alias is now `yr` in `yearCounts` and `salesYears`.
  - Checked on a scratch copy of real data with fake late 2025 mail: the notice showed, Update rewrote all four files
    with no folder picker, Not now hid it, and one more late mail brought it back.

### Step 5: look back (DONE 2026-11-27)
- Customers and Sales Log get a **Year** choice (2027 / 2026 / ...) built from the years present in the data, so the
  old year can be browsed without opening the archive file. The current year is always the default.
- Built:
  - Pure `pastYears(salesYears, yearStart)` and `viewBounds(range, yearStart, year)` in `dateRange.ts`, with tests.
  - `components/YearSelect.tsx`: the **Year** control ("Current (2027)", "2026 (closed)", ...) and `usePastYears`. It is
    hidden until a year is closed. The choice is not remembered, so both tabs always open on the current year.
  - Picking a closed year shows all of it and sets the date bar aside. The Character filter, Sales Log type and search
    still work. The Sales Log still stops at 2,000 rows; the note points to the archive's Sales CSV for the full year.
  - Checked on a scratch copy of real data with 2025 closed and fake 2025 mail: the Year control listed Current (2026)
    and 2025 (closed), 2025 showed exactly the fake mail on both tabs, and Current brought the date bar back.

## Your part as the player

**In the last days of December (Dec 29 to 31):**
1. Log in each character and run `/mailsave`. The app only knows about mail you have saved.
2. Open the app and let it scan. On the Inventory tab, link or ignore anything in "Sales not matched", so the year's
   totals are complete.
3. Do a stock count: check your vendors and fix on-hand numbers with Restock / adjust. These are your starting stock
   for the new year.

**On Jan 1 (or the first day you play):**
4. Run `/mailsave` once more on each character, to catch the last hours of Dec 31.
5. Press **Close 2026** on the banner and choose where to keep the archive. Back that folder up like any important
   document.
6. Done. The Dashboard, Sales Log and Customers start at 0. Stock, structures and prices carry on.

**Optional in game:** delete old mail on your characters to keep `/mailsave` quick. The app does not need it.

**If you close too early:** use Settings, Reopen 2026, then close again. Late sales also offer an archive update.
