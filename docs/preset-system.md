# Preset System

This app treats a preset as a saved desired mod state for one game.

There are two boundaries:

- Renderer preset domain:
  - builds preset entries from library mods
  - matches preset entries back to library mods
  - reconciles stale preset data with the live library
  - builds apply preview diffs for the UI
- Electron preset service:
  - validates preset JSON on save/import
  - persists presets in config storage
  - applies folder renames transactionally on disk

Renderer rules live in:

- `src/lib/presetMatching.js`

Electron storage/apply rules live in:

- `electron/services/presets.js`

## Preset Entry Shape

Each preset mod stores:

- `modId`
- `originalFolderName`
- `character`
- `category`
- `name`
- `gamebananaId`
- `gbFileId`
- `customThumbnail`

`modId` and `originalFolderName` are the identity anchors.
`gamebananaId` and `gbFileId` are metadata used for thumbnails and better
future matching/update behavior.

## Matching Rules

A preset entry matches a library mod by normalized folder identity:

- `modId`
- or `originalFolderName`

Both sides strip the `DISABLED_` prefix before comparison.

That means presets survive normal enable/disable folder renames.

## Create Flow

Preset creation is currently a two-step flow:

1. Enter name and optional description.
2. Review the library selection and save.

Important behavior:

- the current enabled library mods are auto-selected once when the page loads
- the user can explicitly refresh that snapshot before saving
- the selection can still be edited before save
- saving serializes selected library mods through one shared helper:
  - `createPresetModFromLibraryMod(...)`

This is effectively a "smart snapshot" flow, not a blank preset builder.

## Reconciliation

When a preset is opened, the renderer reconciles stored preset entries against
the current library.

It refreshes:

- `originalFolderName`
- `name`
- `category`
- `character`
- `gamebananaId`
- `gbFileId`
- `customThumbnail`

This keeps older presets usable and avoids scattering healing logic across
multiple components.

## Apply Preview Rules

The renderer builds the preview diff with:

- `willEnable`
- `willDisable`
- `notFound`

Current apply modes:

- `global`
  - disables every active library mod not in the preset
- `scoped`
  - disables only active mods whose `character` is within the preset's affected
    characters
- `layered`
  - enables preset mods but disables nothing

Preview rules:

1. If a preset mod has no matching library mod, it is `notFound`.
2. If it matches a disabled library mod, it is `willEnable`.
3. If an enabled library mod is outside the selected preset membership and the
   apply mode allows disabling, it is `willDisable`.

The renderer preview is advisory only. Final disk changes still happen in
Electron.

## Apply Execution Rules

The Electron preset service:

1. validates importer path and folder names
2. validates the diff lists
3. preflights missing folders and collisions
4. stages all renames to temporary names
5. finalizes renames
6. rolls back if any step fails

This keeps apply atomic even if one rename fails midway.

## Current UI Structure

- `PresetsView`
  - loads preset summaries for the active game
  - hydrates GameBanana thumbnail data for saved mods
  - routes create flow into a pushed page/detail surface
  - routes preset detail into a pushed page/detail surface
- `CreatePresetPage`
  - smart-snapshot creation flow
- `PresetDetailPage`
  - review, edit, add/remove mods, duplicate, export, delete
  - reconciles preset against the live library
- `ApplyPresetModal`
  - shows preview diff
  - supports `global`, `scoped`, and `layered` modes

There is now one live preset create/detail surface model:

- page stack create in `src/views/CreatePresetPage.jsx`
- page stack detail in `src/views/PresetDetailPage.jsx`

The older modal-based create/detail flows have been removed so preset navigation
and editing behave like one system.

## Known Weak Points

- preset identity is still folder-based first, so completely manual renames that
  change both `modId` and `originalFolderName` can still break matching
- the preset backend is validated, but some renderer tests and unrelated
  GameBanana tests may still drift if schema changes are not mirrored in tests
