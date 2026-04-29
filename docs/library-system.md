# Library System

Library is the app's local-management surface. Its main job is to turn scanned
mod folders into stable local collections the UI can manage.

## Source Of Truth

Library has three layers:

- Electron mod scan service:
  - reads folders and `aether.json`
  - returns local mod records
- Shared load hook:
  - caches scanned mods by game
  - builds `installedModsMap`
- Library collection helpers:
  - group mods into character / UI / misc collections
  - expose counts and filtered collections

Shared collection rules live in:

- `src/lib/libraryCollections.js`

Scan/caching lives in:

- `src/hooks/useLoadGameMods.js`
- `electron/services/mods.js`

## Collection Model

Library does not render raw folders directly. It groups scanned mods into:

- character collections
- one UI collection
- one misc collection

Grouping uses shared mod classification rules, then adds local state:

- total mods
- enabled mods
- grouped mod lists

## Update Dots

Library does not do file-level UI for every card at the top level. Instead it
computes section-level update indicators:

- tab-level update dots
- character-card update dots

Those indicators are derived from:

- installed metadata from scans
- shared update-state rules
- a short-lived cached batch fetch for latest GB metadata

## Shared Importer Warning

Library surfaces a warning when multiple games share one importer path.

That warning matters because legacy untagged mods may be hidden or scoped away
until they are associated with a specific game.

## Relationship To Character Detail

Character Detail is a focused sub-workspace of Library.

Library owns:

- collection grouping
- top-level counts
- top-level update indicators

Character Detail owns:

- one collection's mod list
- per-mod local actions
- richer local management for that collection

## Invariants

- Library grouping should go through shared collection helpers, not ad hoc
  `useMemo` logic per screen.
- Update dots should use shared update rules and cache policy.
- Library should not directly reinterpret filesystem structure outside the
  shared scan/load flow.
