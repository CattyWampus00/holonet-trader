# UI design brief: HoloNet Trader

## What it is
HoloNet Trader is a Windows desktop app (Electron + React + TypeScript) for players of *Star Wars Galaxies: Legends*. It's a local-first sales and inventory tracker for player vendors. It works like the older SWGAide tool, but it is not an overlay and doesn't connect to the game.

## How data gets in (this shapes the UI)
- The game can't be connected to. Players run `/mailsave` (or `/mail`, `/mai`) in game, and the game writes `.mail` text files to disk.
- The app auto-detects that folder, watches it, and parses new mails into sales records. Players never type sales.
- Inventory is entered **manually** by the player. There's no other source for it. Sales then subtract from stock automatically.
- Everything is stored locally in SQLite. There are no accounts, servers, or cloud.

## Who uses it
- SWG players who run vendors and trade at volume. They are comfortable with spreadsheets and dense data.
- They have up to 5 characters on one account, one server (Omega), and thousands of sales mails.
- They often alt-tab from the game, so they want to read the app at a glance.
- Typical amounts are large, like 700,000 or 1,500,000 credits.

## Design goals
1. **Glanceable status first.** The most important question is "what do I need to restock?", then "how much did I make?"
2. **Dense but readable.** Table-heavy, keyboard-friendly, with fast filtering and search. No wasted whitespace.
3. **Dark theme only** (players use it next to a game). It should feel at home in the Star Wars universe without copying any official branding or assets.
4. **Low friction for manual entry.** Adding and restocking items must take as few clicks as possible, with sensible defaults.
5. **Trustworthy numbers.** Always show credits with thousands separators, and show dates and times in local time.

## Screens that already exist (restyle, don't reinvent)
| Screen | Purpose |
|---|---|
| **Dashboard** | Restock banner; date-range buttons (Today, 7, 30, 90 days, All); KPI cards (revenue, sales, units, profit, spent); revenue-per-day bar chart; top items, by vendor, by character rankings |
| **Sales Log** | Filterable and searchable table of all mail events (sold, bought, unsold, expired, offers) with CSV export |
| **Inventory** | Item table with Low / Out / OK status pills, on-hand count, warn-at level, cost each; Add, Edit and Restock/Adjust dialogs; an "unmatched sales" list where players link a sale name to an item once |
| **Settings** | Auto-detect the game folder, Browse fallback, scan-now button, default low-stock level |

## Concepts the UI must make clear
- A sold **crate of 25** removes **25 units** from stock.
- Stock only drops for sales made **after** an item was added, because the count is a manual snapshot.
- **Low stock** (at or below a warn level) and **out of stock** (zero) are different states and need distinct visual treatment. Each item can have its own level, with a global default.
- Names in sale mails are free text and sometimes don't match inventory names. The "link once, remembered forever" flow needs to feel quick.
- There's a first-run setup state: no folder found yet, then detecting, then choosing a folder, then the first scan. Make this friendly, because new players start here.

## Tech and constraints
- React 19 + TypeScript, Vite. Charts use Recharts. The current styling is plain CSS with variables in `src/renderer/src/styles.css`. Keep the dark palette in CSS variables.
- The renderer talks to the app only through `window.api` (`src/renderer/src/api.ts`). Don't change the data layer. Redesign only the components in `src/renderer/src/`.
- Fixed Content-Security-Policy: no remote fonts, scripts or images. Bundle all assets locally.
- Minimum window size is about 980x640. Design for 1280x820 and up, and make sure it still works at the minimum.
- Must be accessible: keyboard navigation, visible focus, and contrast that doesn't rely on color alone (for example, pills also carry text).
- No emoji as icons. Use a small bundled icon set.

## Out of scope for now (leave room for them in navigation)
Crafting and resource tracking, price history and market comparison, vendor-by-vendor views, and notification settings.

## Deliverable
A cohesive design system (colors, type scale, spacing, table, pill, card and dialog styles), then updated React components for the four screens above plus the first-run setup state. Keep component props and `window.api` calls unchanged.
