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

The app uses strict, deterministic rules to detect updates, dropping brittle timestamp guesswork:

1. **Rule A: The Version Bump**
   - If `installedFile.modVersion` and the remote `mod._sVersion` exist but do not match, the mod is unequivocally **outdated**.
2. **Partial Data Fast-Path**
   - In UI surfaces where the full file list is not available (e.g., Browse grid), we cannot reliably detect silent file replacements. To prevent false positives, we assume the file is **current** unless Rule A explicitly catches a version bump.
3. **Rule B: The Silent Replacement**
   - If the exact `gbFileId` the user installed is NO LONGER in the remote file list, we check if the author uploaded a newer file since the user's install date. If yes, the mod is **outdated**.
4. **Rule C: The File Update**
   - If the exact `gbFileId` is still present, we compare its `_tsDateAdded` to the user's `fileAddedAt` (with a 5-minute server sync buffer). If the remote file's date is newer, it's an **update**. Otherwise, it's **current**.

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
