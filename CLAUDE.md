# HoloNet Trader: notes for Claude

Desktop app (Electron + React + TypeScript) that tracks SWG Legends vendor sales from `/mailsave` files and a manually entered inventory. Read `docs/PROJECT_STATUS.md` first. It has the decisions, the mail format, and the next steps.

## Layout
- `src/shared/` pure code used by main and renderer: `mailParser.ts`, `stock.ts`, `types.ts`
- `src/main/` Electron main process: `db.ts` (node:sqlite), `detect.ts`, `scanner.ts`, `index.ts` (IPC, watcher, notifications)
- `src/preload/index.ts` the only bridge. The renderer uses `window.api` (typed in `src/renderer/src/api.ts`)
- `src/renderer/src/` React UI. The `@shared` alias points at `src/shared`
- `tests/` vitest. `corpus.test.ts` and `detect.test.ts` are opt-in via environment variables

## Rules for working here
- The game can't be connected to. Only read files the player creates. Never write into the game's folders.
- Keep the parser pure and covered by tests. Use fake names in fixtures, never real player names.
- Stock rule: a sale only reduces stock if it happened after the item's `tracking_since`. Quantities are single units, and a crate of 25 counts as 25.
- Don't add native modules (no Python or C++ toolchain on the dev machine, and players won't have one either).
- The owner is learning as we go. Explain design choices briefly, and let them write the small decision functions themselves.
- **The 8 themes are LOCKED** (owner approved their look on 2026-11-16). Don't edit a `[data-theme]` block in `styles.css` or the theme list unless the owner asks. `tests/themes.lock.test.ts` snapshots them. For an intended change, edit, run `npx vitest run -u`, and note it in `docs/PROJECT_STATUS.md`. A new theme also needs an entry in the approved-list assertion in that test. The theme tokens and the personality tokens (`--r`, `--font-head`, `--card-fx`, ...) can still be used by new UI, but new UI must use variables, never hard-coded colors.
- `getStockStatus` in `src/shared/stock.ts` is implemented (0 on hand = out; at or below warn level = low). There is no `TODO(human)` left.
- Power-up items (Weapon/Armor/Clothing Powerup): the trailing number is **uses**, not a crate size. Quantity stays 1 and the number goes in `events.uses`.
- Same-named items can have different stats and prices. The mail only has the name, so don't try to split them.
- Before shipping with the Electron menu hidden, add an in-app way to exit and leave full screen.
