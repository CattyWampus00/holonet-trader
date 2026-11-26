# Plan: retired resources, structures (harvesters and factories)

Status: **plan only, nothing built yet** (agreed with the owner 2026-11-26). Build in the order of the steps below; each step is its own release so it can be tried in game before the next one builds on it.

Ground rules that still apply: the app only reads files the player creates (never the game's folders), no native modules, the 8 themes stay locked (new UI uses theme variables only), fake names in tests.

---

## Step 1: Archive (retired items) and Ignore (unmatched names)

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
- **Restock un-archives automatically** (getting stock back means you sell it again). Owner to confirm; suggested yes.
- No automatic archiving: no mail says a resource despawned, so the player archives by hand.
- Data: new column `items.archived_at` (NULL = active), added with the existing migration pattern (`.bak` copy first).

### Ignore for unmatched names
- New choice in the "Link to" menu: **Ignore this name**. Hides it from "Sales not matched".
- Ignored names get a small section with **Un-ignore**, so nothing is lost.
- Data: table `ignored_names(item_key PRIMARY KEY, ts)`.

### Tests
Banner and badge skip archived items; archived items keep their sales matched; restock un-archives; ignored names leave `unmatched()` and come back on un-ignore.

---

## Step 2: machine types and structures

### Machine types (the player's saved fixed stats)
The app ships with **no machine values**: hopper sizes and rates differ between players. The player saves their own machine types once, under a name they choose (for example "My Elite Ore Harvester").

Fixed stats (saved once):
- name, kind (harvester or factory)
- lots used (for example elite harvester 3, factory 1; lower-tier harvesters differ, the player enters them)
- base maintenance rate per hour
- power use per hour
- base extraction rate (harvesters)
- storage capacity (harvesters)
- factory production efficiency (factories)

Any field may be left empty; a countdown that needs an empty field shows "not enough info" instead of a guess.

### Structures (one real placed machine)
- Belongs to one **character**, made from a machine type.
- **Copies** the type's fixed stats when created and can override any of them (two elite deeds showed storage 431,046 and 430,831). Editing a type later does not change structures already placed.
- Keeps its fixed stats through pick up and re-place, like the deed does in game.
- **Save as machine type** button turns a hand-entered structure into a template.

Changing values (updated by the player when they change): surplus maintenance, surplus power, hopper amount when emptied, resource being harvested, state.

### States
| State | Meaning | Maintenance drains | Power drains | Hopper fills |
|---|---|---|---|---|
| Running | placed and on | yes | yes | yes |
| Idle | placed, off (or factory with nothing to make) | yes (to verify) | no (to verify) | no |
| Packed up | picked up, back to a deed | no | no | no |

Every state change is stored with its time. Nothing stores a "current" amount; amounts are worked out from the history.

### Lots per character
- Each character has 10 lots. Used lots = sum of lots of that character's structures that are not Packed up.
- Shown as "7 / 10 lots"; warning when placing would go over 10.
- Never stored as a number, always added up.

### Data (sketch)
- `machine_types(id, name, kind, lots, maint_per_hour, power_per_hour, extraction_rate, storage, efficiency)` (all stats nullable)
- `structures(id, character, type_id, name, planet, notes, lots, maint_per_hour, power_per_hour, extraction_rate, storage, efficiency)` (copied stats)
- `structure_states(structure_id, state, ts)`
- `structure_snapshots(structure_id, ts, surplus_maint, surplus_power)` (each top up or reading)

---

## Step 3: harvester resources and emptying the hopper

- Each harvester has a **resource history**: periods of (resource, from, to). Switching resource closes the old period and opens a new one.
- **Empty hopper**: the player enters the amount collected. It is added as stock to the inventory item for that resource. If none exists, the item is created with the same `Type (Name)` form the mail parser gives resources, so future sales match without linking.
- Ties to Step 1: when switching away from a resource because it despawned, offer "Mark it despawned and archive the item?". If an archived resource gets stock again, it is restored.
- Data: `harvester_resources(structure_id, resource_name, from_ts, to_ts)`, `hopper_empties(structure_id, ts, resource_name, amount)` (the stock change also goes through `stock_moves` with reason `harvest`).

---

## Step 4: countdowns, Needs attention, upkeep

From the last snapshot and the state history (only hours in a draining state count):
- **Maintenance runs out in**: surplus maintenance ÷ maintenance per hour. Example from a deed: 63,367 ÷ 126 ≈ 503 h ≈ 21 days.
- **Power runs out in**: surplus power ÷ power per hour.
- **Hopper full in**: storage ÷ (extraction rate × concentration %). Shown as "about" until checked against real collections (see questions).
- **Upkeep**: maintenance per hour × 24 per structure, totalled per day and per month (126/h ≈ 3,024 credits a day).

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

1. Does a turned-off harvester still use power? (guess: no)
2. Does a turned-off structure still use maintenance? (guess: yes)
3. When picked up, does the deed keep its leftover surplus maintenance and power? (deed screenshots suggest yes)
4. How much power does a harvester use per hour, and where is it shown?
5. Real extraction per hour: note the hopper amount, check again a few hours later, compare with base extraction rate × concentration %. Do expertise or modifiers change it?
6. Does a factory use power only while it is making items?
7. Lots used by each lower-tier harvester type.

Whatever the answers, these rules live in data or settings with defaults, so a correction does not need a new version.
