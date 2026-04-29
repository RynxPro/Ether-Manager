# Update System

This app tracks mod updates at the **installed file** level, then rolls that up into **mod-level UI state**.

## Source Of Truth

- Install metadata is written into `aether.json` by the Electron install flow.
- Disk scans rebuild the renderer-facing installed map.
- UI surfaces compare that installed metadata against the latest GameBanana payload.

The shared comparison logic lives in:

- `src/lib/modUpdateState.js`

## Install Metadata

When a GameBanana file is installed, the app stores:

- `installedFile`
- `installedAt`
- `gbFileId`
- `fileAddedAt`
- `modVersion`

These fields are persisted by:

- `electron/services/mods.js`

They matter because `installedAt` alone is too weak. It can only answer "was something installed recently?" and breaks when:

- a mod has multiple downloadable files
- a file is reinstalled
- a mod version stays the same while the file changes

## Scan Phase

Every disk scan builds `installedModsMap` in the global store.

Shape:

```js
{
  [gameId]: {
    [gbModId]: {
      installedFiles: [
        {
          fileName,
          installedAt,
          gbFileId,
          fileAddedAt,
          modVersion,
        },
      ],
    },
  },
}
```

This happens in:

- `src/hooks/useLoadGameMods.js`

Character Detail may also build a local view of the same shape for optimistic UI after install.

## Comparison Rules

The comparison order in `modUpdateState.js` is intentional:

1. If installed `modVersion` differs from current GB mod version, the install is outdated.
2. If a matching remote file exists:
   - compare `fileAddedAt` when possible
   - otherwise accept exact `gbFileId` match as current
3. If no exact remote file match exists:
   - compare the mod's latest activity timestamp against installed `fileAddedAt`
4. Final fallback:
   - compare latest mod activity against `installedAt` with a small buffer

## Card-Level Rule

Mod cards do **not** show `Update` just because one old variant exists.

The app treats a mod as current when:

- **at least one installed file is current**

The app treats a mod as outdated when:

- **every known installed file looks outdated**

This avoids false update badges right after installing a fresh file while an older variant still exists on disk.

## UI Surfaces

The same shared helper should be used anywhere update state is shown:

- Browse cards
- Creator profile cards
- Library character cards / group indicators
- Character Detail cards
- Mod Detail file rows

If a future change needs update-state logic, it should start from `modUpdateState.js` instead of adding new timestamp checks inline.

## Library Update Checks

Library does a lightweight batch fetch for installed GB IDs, then derives section-level update dots.

To avoid rechecking on every mount:

- it stores `signature + checkedAt + updatesMap` in `useAppStore`
- it reuses cached results while the installed signature is unchanged and the cache is still fresh

This cache is intentionally short-lived. It reduces duplicate traffic without pretending update state is permanent.
