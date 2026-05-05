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
- Library / Character hooks:
  - derive filtered collections for the Library page
  - derive one focused collection controller for Character Detail

Shared collection rules live in:

- `src/lib/libraryCollections.js`

Scan/caching lives in:

- `src/hooks/useLoadGameMods.js`
- `src/hooks/useLibraryCollections.js`
- `src/hooks/useLibraryUpdateSummary.js`
- `src/hooks/useCharacterDetailController.js`
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

This is a stable-roster model, not an installed-only roster:

- known game characters are created up front
- local mods are then routed into those collections
- `Unassigned` only appears when it actually has mods

That keeps the Library screen stable as a catalog, even when some collections
are currently empty.

## Library Hook

`useLibraryCollections` is the page-level controller for Library.

It owns:

- loading/caching local mods through `useLoadGameMods`
- building character / UI / misc collections
- filtering the current tab by search
- detecting shared importer-path warnings

`LibraryView` should consume this hook instead of rebuilding collection state
inline.

## Library Update Summary Hook

`useLibraryUpdateSummary` is the remote-update companion for Library.

It owns:

- short-lived cached batch checks for installed GB mods
- section-level update-dot derivation
- tab-level update-dot derivation
- rate-limit warning copy for the Library overview

`LibraryView` should consume this hook instead of owning GameBanana update
batching inline.

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
- collection search/filter at the overview level

Character Detail owns:

- one collection's mod list
- per-mod local actions
- richer local management for that collection
- local search within the collection
- collection-scoped GB hydration for card detail/update state

## Character Detail Controller

`useCharacterDetailController` is the behavioral layer behind Character Detail.

It owns:

- deriving one collection from the shared scanned mod cache
- sorting active mods before disabled mods
- hydrating GameBanana metadata for mods in that collection
- building the installed-file update map for that collection
- collection actions:
  - toggle
  - disable all
  - import
  - assign
  - delete
  - install/update

This matters because Character Detail should not maintain its own separate copy
of Library state. It should operate on the same mod cache and same collection
rules, just with a narrower scope.

## Invariants

- Library grouping should go through shared collection helpers, not ad hoc
  `useMemo` logic per screen.
- Library page state should go through `useLibraryCollections`, not custom
  collection wiring inside `LibraryView`.
- Update dots should use shared update rules and cache policy.
- Library should not directly reinterpret filesystem structure outside the
  shared scan/load flow.
- Character Detail should not maintain a second local collection model separate
  from the scanned mod cache.
