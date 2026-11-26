# Plan: retired resources, structures (harvesters and factories)

Status: **Steps 1 and 2 BUILT (2026-11-26); steps 3 to 5 are plan only** (agreed with the owner 2026-11-26). Build in the order of the steps below; each step is its own release so it can be tried in game before the next one builds on it.

Ground rules that still apply: the app only reads files the player creates (never the game's folders), no native modules, the 8 themes stay locked (new UI uses theme variables only), fake names in tests.

---

## Step 1: Archive (retired items) and Ignore (unmatched names) (DONE 2026-11-26)

### Problem
Resources in SWG despawn and never come back. When a resource sells out, its item shows "Out" and sits in the Dashboard's "Restock needed" banner forever. Deleting the item is no fix: its sales lose their item and the name drops back into "Sales not matched to inventory".

### Design: a third item state, Archived
| | Active item | Archived item |
|---|---|---|
| Main inventory list | shown | collapsed **Archived** section at the bottom |
| Restock needed banner, Inventory badge | counted | never |
| Its sales | matched | **stay matched** (no fall back to unmatched) |
| Sales Log, Prices, Customers, revenue | included | included (history kept) |
| Inventory value box | counted | not counted |

- **Archive** button in the item's Edit window, and on rows whose status is Out.
- **Restore** button in the Archived section.
- **Restock un-archives automatically** (getting stock back means you sell it again): a positive Restock / adjust, or an Edit that raises On hand.
- No automatic archiving: no mail says a resource despawned, so the player archives by hand.
- Data: new column `items.archived_at` (NULL = active). Adding an empty column changes no existing row, so no `.bak` copy is made.

### Ignore for unmatched names
- New choice in the "Link to" menu: **Ignore this name**. Hides it from "Sales not matched".
- Ignored names get a small section with **Un-ignore**, so nothing is lost.
- Data: table `ignored_names(item_key PRIMARY KEY, ts)`.

### Tests
Banner and badge skip archived items; archived items keep their sales matched; restock un-archives; ignored names leave `unmatched()` and come back on un-ignore.

---

## Step 2: machine types and structures (DONE 2026-11-26)

Built as the **Structures** tab: lots per character (cards), structures table (state picker with "since", last reading, Reading and Edit), machine types table, and modals for type, structure (picking a type copies its stats; "Save as machine type"; over-10-lots confirm) and reading (Maintenance Pool, Power Reserves, and for harvesters Actual Rate and Hopper Capacity %). Rules in `src/shared/structures.ts` (`drains`, `lotsByCharacter`, `lotsAfter`), tests in `tests/structures.test.ts` and `tests/store.test.ts`. Readings are stored but not turned into countdowns yet (Step 4).

### Rule: enter what the game shows, never model modifiers
Maintenance, power and extraction all have modifiers (merchant, player expertise, city, buffs, weekend double extraction). The app does **not** try to calculate them: the game's own windows already show the actual values after every modifier, so the player copies those. When a modifier changes (new expertise, moving into a city, a buff ending, the weekend rate ending), the player updates the number from the same window.

What the game shows (owner's screenshots, 2026-11-26, Elite Mineral Mining Installation, 3 lots):

| Window | Field | Example | Use |
|---|---|---|---|
| Structure Status | Maintenance Rate | `84 cr/hr (126)` | **84** is the actual rate (126 is the deed's base). Enter 84 |
| Structure Status | Power Consumption | `165 units/hr` | actual power use (already includes the -20% energy modifier) |
| Structure Status | Maintenance Pool | `63367 (31 days, 10 h...)` | the surplus maintenance reading, plus the game's own countdown |
| Structure Status | Power Reserves | `110847 (27 days, 23 ho...)` | the surplus power reading, plus the game's own countdown |
| Operate panel | resource line | `Carbigyfed, a type of Crism Siliclastic Ore` | resource being harvested (name + type) |
| Operate panel | percent bar | `44%` | concentration of that resource at this spot |
| Operate panel | Spec Rate | `57 KG/H` | the harvester's rate with modifiers (deed base was 44; weekend double rate was on) |
| Operate panel | Actual Rate | `0.00 KG/H` while off | **the real extraction rate while running.** Enter this one |
| Operate panel | Capacity | `0%` | how full the hopper is |

Factory (Wearables Factory, Structure Status, same layout): Maintenance Rate `20 cr/hr (26)`, Power Consumption `50 units/hr`, Maintenance Pool `10979 (22 days, 20 h...)`, Power Reserves `19866 (16 days, 13 hou...)`, Factory Production Efficiency `35`. Checks: 10,979 / 20 = 549 h = 22 days 21 h, and 19,866 / 50 = 397 h = 16 days 13 h, matching the game. Factories have no Operate panel numbers to track.

**Scope for the first build: elite harvesters and factories only.** Lower-tier harvesters are added another day (their lots and rates are still unknown); the machine type catalog lets them be added later without code changes.

Checks that the countdown method is right: 63,367 / 84 = 754 h = 31 days 10 h, and 110,847 / 165 = 672 h = 27 days 23 h, both exactly what the game shows. The two maintenance modifiers multiply (126 x 0.80 x 0.84 = 84.7, shown as 84), more proof the app should not try to combine modifiers itself.

Because the game shows its own countdowns, the app can show "the game said 31 d 10 h at your last reading" next to its own estimate; a difference means a typo.

### Machine types (the player's saved fixed stats)
The app ships with **no machine values**: hopper sizes and rates differ between players. The player saves their own machine types once, under a name they choose (for example "My Elite Ore Harvester").

Fixed stats (saved once):
- name, kind (harvester or factory)
- lots used (for example elite harvester 3, factory 1; lower-tier harvesters differ, the player enters them)
- actual maintenance rate per hour (Structure Status, the first number)
- actual power use per hour (Structure Status, Power Consumption)
- storage capacity (harvesters, from the deed)
- factory production efficiency (factories)

Extraction rate is **not** a fixed stat: it depends on the resource's concentration and on modifiers that come and go (weekend double rate). It is a changing value, read from the Operate panel's Actual Rate while running.

Any field may be left empty; a countdown that needs an empty field shows "not enough info" instead of a guess.

### Structures (one real placed machine)
- Belongs to one **character**, made from a machine type.
- **Copies** the type's fixed stats when created and can override any of them (two elite deeds showed storage 431,046 and 430,831). Editing a type later does not change structures already placed.
- Keeps its fixed stats through pick up and re-place, like the deed does in game.
- **Save as machine type** button turns a hand-entered structure into a template.

Changing values (updated by the player when they change): surplus maintenance, surplus power, actual extraction rate, hopper capacity %, hopper amount when emptied, resource being harvested, state. One "reading" form takes them all at once, straight from the two windows, so a check-in costs a few numbers.

### States
Confirmed in game by the owner (2026-11-26):

| State | Meaning | Maintenance drains | Power drains | Hopper fills |
|---|---|---|---|---|
| Running | placed and on (harvester extracting, factory making items) | yes | yes | yes (harvester) |
| Idle harvester | placed, turned off | yes | **no** | no |
| Idle factory | placed, not making items (for example after "Manufacturing station finished") | yes | **yes** (a factory uses power whenever it is placed) | n/a |
| Packed up | picked up, back to a deed | no | no | no |

When picked up, the deed keeps its leftover surplus maintenance and power, so re-placing continues from those amounts.

Every state change is stored with its time. Nothing stores a "current" amount; amounts are worked out from the history.

### Lots per character
- Each character has 10 lots. Used lots = sum of lots of that character's structures that are not Packed up.
- Shown as "7 / 10 lots"; warning when placing would go over 10.
- Never stored as a number, always added up.

### Data (sketch)
- `machine_types(id, name, kind, lots, maint_per_hour, power_per_hour, storage, efficiency)` (all stats nullable)
- `structures(id, character, type_id, name, planet, notes, lots, maint_per_hour, power_per_hour, storage, efficiency)` (copied stats)
- `structure_states(structure_id, state, ts)`
- `structure_readings(structure_id, ts, surplus_maint, surplus_power, extraction_rate, hopper_pct)` (each check-in; any field may be empty)

---

## Step 3: harvester resources and emptying the hopper

- Each harvester has a **resource history**: periods of (resource, from, to). Switching resource closes the old period and opens a new one.
- **Resource name**: the Operate panel writes it as `<Name>, a type of <Type>` (for example `Carbigyfed, a type of Crism Siliclastic Ore`). The app asks for name and type (or accepts that line pasted in) and stores it in the `Type (Name)` form the mail parser uses, here `Crism Siliclastic Ore (Carbigyfed)`. Converting between the two forms is a small pure function with tests. The concentration % is stored with the resource period.
- **Empty hopper**: the player enters the amount collected. It is added as stock to the inventory item for that resource. If none exists, the item is created with the same `Type (Name)` form the mail parser gives resources, so future sales match without linking.
- Ties to Step 1: when switching away from a resource because it despawned, offer "Mark it despawned and archive the item?". If an archived resource gets stock again, it is restored.
- Data: `harvester_resources(structure_id, resource_name, from_ts, to_ts)`, `hopper_empties(structure_id, ts, resource_name, amount)` (the stock change also goes through `stock_moves` with reason `harvest`).

---

## Step 4: countdowns, Needs attention, upkeep

From the last snapshot and the state history (only hours in a draining state count):
- **Maintenance runs out in**: surplus maintenance ÷ actual maintenance per hour. Example: 63,367 ÷ 84 = 754 h = 31 days 10 h (matches the game).
- **Power runs out in**: surplus power ÷ actual power per hour. Example: 110,847 ÷ 165 = 672 h = 27 days 23 h (matches the game).
- **Hopper full in**: storage × (100 − capacity %) ÷ 100 ÷ actual extraction rate. Shown as "about", because the rate can change (weekend double rate ends, buffs); a new reading corrects it.
- **Upkeep**: actual maintenance per hour × 24 per structure, totalled per day and per month (84/h = 2,016 credits a day).

UI: a **Structures** tab (types, structures, lots per character, hopper log) and a **Needs attention** list on the Dashboard, soonest first.

---

## Step 5: mail hooks

Installation mail found in the owner's saved mail (subject counts, 2026-11-26): no harvester mail at all, and no mail with output amounts.

| Mail subject | Body (shape) | Use |
|---|---|---|
| Manufacturing station finished | "Your manufacturing station, <name>, has stopped making items." | set that factory to Idle |
| Structure maintenance pool empty! | "Your <name> (<x>, <y>  <planet>) has an empty maintenance pool. It will start deducting from your bank account automatically." | set its maintenance to 0, flag bank drain |
| Construction Complete | "Construction of your <machine> is now complete. You have <n> lots remaining." | offer to add the structure; compare the game's lots left with the app's count and note a mismatch |

Parser work follows the existing rule: pure parser functions with tests on hand-written fixtures (fake names).

---

## Questions for the owner to check in game (before Step 4)

1. **ANSWERED 2026-11-26:** a turned-off harvester does not use power.
2. **ANSWERED 2026-11-26:** a turned-off structure still uses maintenance.
3. **ANSWERED 2026-11-26:** when picked up, the deed keeps its leftover surplus maintenance and power.
4. **ANSWERED 2026-11-26:** power use per hour is shown in Structure Status as Power Consumption (165 units/hr on the owner's elite mineral harvester), already after modifiers.
5. **MOSTLY ANSWERED 2026-11-26:** modifiers do change extraction (deed base 44, Spec Rate 57 with the weekend double rate on), and the Operate panel shows Actual Rate while running, so the app uses that instead of a formula. Still to see: Actual Rate on a running harvester, to confirm it is roughly Spec Rate × concentration %.
6. **ANSWERED 2026-11-26:** no, a factory uses power whenever it is placed, making items or not.
7. Lots used by each lower-tier harvester type. **Deferred:** elites first (elite mineral harvester: 3 lots, factory: 1 lot); lower tiers another day.
8. **ANSWERED 2026-11-26:** factories show actual maintenance and power in Structure Status too (same layout, plus Factory Production Efficiency).

Only question 5's last part is open (Actual Rate on a running harvester), and it does not block Steps 2 or 3.

Whatever the answers, these rules live in data or settings with defaults, so a correction does not need a new version.
