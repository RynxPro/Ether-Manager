# Preset System

This app treats presets as a **saved desired library state** for one game.

## Source Of Truth

There are two layers:

- Electron preset service:
  - persists preset JSON
  - validates imported/saved preset shape
  - applies enable/disable renames transactionally
- Renderer preset-domain helpers:
  - serialize library mods into preset entries
  - match preset entries back to library mods
  - build preview diffs for review/apply UI

Renderer rules live in:

- `src/lib/presetMatching.js`

Electron apply/storage rules live in:

- `electron/services/presets.js`

## Preset Entry Shape

Each preset mod stores:

- `modId`
- `originalFolderName`
- `character`
- `category`
- `name`
- `gamebananaId`
- `customThumbnail`

Preset entries are created from library mods with one shared serializer so
Create/Edit flows do not drift.

## Matching Rules

A preset mod matches a library mod by normalized identity:

- `modId`
- or `originalFolderName`

Both sides strip the `DISABLED_` prefix before matching.

That means presets are resilient to enabled/disabled folder renames while still
using the current library identity rules.

## Reconciliation

When a preset is opened, the renderer reconciles stored entries against the
current library:

- fills in missing `gamebananaId`
- refreshes `character`
- refreshes `category`
- refreshes `name`
- refreshes `originalFolderName`
- refreshes `customThumbnail`

This keeps old presets usable without spreading healing logic across multiple
components.

## Diff Rules

Preset apply preview computes three groups:

- `willEnable`
- `willDisable`
- `notFound`

Rules:

1. If a preset mod has no matching library mod, it is `notFound`.
2. If it matches a disabled library mod, it is `willEnable`.
3. If an enabled library mod is in an affected preset character scope but is
   not part of the preset, it is `willDisable`.

The preview diff is renderer-side only. Final apply still goes through the
Electron service.

## Apply Rules

The Electron apply path:

1. validates source/target folder names
2. preflights missing folders and collisions
3. stages all renames to temporary names
4. finalizes renames
5. rolls back if any step fails

So presets are previewed in the renderer, but applied transactionally in the
main process.
