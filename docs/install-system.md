# Install System

This app treats install as a two-layer flow:

- Renderer:
  - chooses the GB file and target character/category
  - queues the download job
  - applies small optimistic UI updates after success
- Electron:
  - validates arguments
  - downloads the archive
  - extracts into a sandbox
  - validates extracted contents
  - moves folders into `Mods`
  - writes `aether.json`

## Source Of Truth

Renderer install-domain helpers live in:

- `src/lib/installFlow.js`

Electron install execution lives in:

- `electron/services/mods.js`

## Renderer Contract

The renderer builds a shared install selection with:

- `characterName`
- `gbModId`
- `fileUrl`
- `fileName`
- `gbFileId`
- `fileAddedAt`
- `modVersion`
- `modName`
- `category`

That selection is then converted into the final Electron payload with the
current `importerPath` and `gameId`.

This matters because Browse, Character Detail, and Mod Detail should all launch
the same install request shape.

## Download Queue

Installs are background jobs from the renderer’s perspective:

1. add a download entry
2. call `installGbMod`
3. mark the queue entry `done` or `error`
4. refresh installed state after success

The queue logic is shared so screens do not each invent their own job lifecycle.

## Optimistic Installed State

After a successful install, the renderer may append an optimistic installed-file
record before the next full library reload completes.

That optimistic record only contains update-relevant metadata:

- `fileName`
- `installedAt`
- `gbFileId`
- `fileAddedAt`
- `modVersion`

The final durable truth still comes from the next disk scan.

## Electron Install Rules

The Electron installer:

1. validates install arguments
2. blocks unsafe download URLs
3. downloads with cancel support
4. extracts into a temporary sandbox
5. rejects path traversal, executables, and symlinks
6. resolves safe final folder names
7. prevents destructive collisions
8. writes `aether.json` with update metadata
9. rolls back partial installs on failure

## Invariants

- `aether.json` is the durable install metadata source.
- Renderer optimistic state is only a temporary convenience.
- Update detection depends on install metadata being written consistently.
- New install entry points should use `installFlow.js` instead of building
  their own request or queue logic inline.
