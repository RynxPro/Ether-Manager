/**
 * Update-state helpers.
 *
 * This module is the source of truth for "is this installed mod/file current?"
 * across Browse, Library, Creator, Character Detail, and Mod Detail.
 *
 * Update flow:
 * 1. Install writes file-level metadata into aether.json (`installedFile`,
 *    `gbFileId`, `fileAddedAt`, `modVersion`, `installedAt`).
 * 2. Disk scans rebuild an `installedModsMap` keyed by GB mod id.
 * 3. UI surfaces compare installed metadata against the latest GB payload here.
 *
 * The rule we intentionally use for card-level state is:
 * - If at least one installed file/variant is current, the mod card is current.
 * - A mod only shows `Update` when every known installed file looks outdated.
 */

function toUnixSeconds(value) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    return num;
  }

  if (typeof value === "string") {
    const parsed = new Date(value).getTime() / 1000;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}


function findMatchingRemoteFile(installedFile, mod) {
  const files = Array.isArray(mod?._aFiles) ? mod._aFiles : [];

  if (installedFile?.gbFileId != null) {
    const byId = files.find(
      (file) => Number(file?._idRow) === Number(installedFile.gbFileId),
    );
    if (byId) return byId;
  }

  if (installedFile?.fileName) {
    const byName = files.find((file) => file?._sFile === installedFile.fileName);
    if (byName) return byName;
  }

  return null;
}

/**
 * Normalize one local mod/install record into the shared installed-file shape.
 * Accepts either a local mod object from disk scans or an already-normalized file.
 */
export function createInstalledFileRecord(source) {
  if (!source) return null;

  return {
    fileName: source.fileName ?? source.installedFile ?? null,
    installedAt: source.installedAt ?? null,
    gbFileId: source.gbFileId ?? null,
    fileAddedAt: source.fileAddedAt ?? null,
    modVersion: source.modVersion ?? null,
  };
}

export function createInstalledFileInfo(source) {
  const record = createInstalledFileRecord(source);
  return record ? { installedFiles: [record] } : { installedFiles: [] };
}

/**
 * Build the shared installed-file-info shape from many local mods.
 * Dedupe by the strongest stable identifier we have: GB file id first, then file name.
 */
export function createInstalledFileInfoFromMods(mods = []) {
  const installedFiles = [];
  const seen = new Set();

  for (const mod of mods) {
    const record = createInstalledFileRecord(mod);
    if (!record?.fileName && record?.gbFileId == null) {
      continue;
    }

    const dedupeKey =
      record.gbFileId != null
        ? `id:${record.gbFileId}`
        : `name:${String(record.fileName).toLowerCase()}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    installedFiles.push(record);
  }

  return { installedFiles };
}

/**
 * A compact signature for "what is installed for update-check purposes?"
 * This lets Library reuse cached update results until the relevant install
 * metadata actually changes.
 */
export function getInstalledModsUpdateSignature(mods = []) {
  return mods
    .filter((mod) => mod?.gamebananaId)
    .map((mod) => ({
      gbId: Number(mod.gamebananaId) || 0,
      file: mod.installedFile ?? "",
      fileId: mod.gbFileId ?? "",
      fileAddedAt: mod.fileAddedAt ?? "",
      modVersion: mod.modVersion ?? "",
      enabled: Boolean(mod.isEnabled),
    }))
    .sort((a, b) => {
      if (a.gbId !== b.gbId) return a.gbId - b.gbId;
      return String(a.file).localeCompare(String(b.file));
    })
    .map(
      (entry) =>
        `${entry.gbId}:${entry.file}:${entry.fileId}:${entry.fileAddedAt}:${entry.modVersion}:${entry.enabled ? 1 : 0}`,
    )
    .join("|");
}

export function isInstalledFileUpToDate(installedFile, mod, remoteFile = null) {
  if (!installedFile || !mod) return false;

  // RULE A: The Version Bump
  // If the mod has a version string, and it doesn't match what we installed, it's an update.
  if (
    installedFile.modVersion &&
    mod._sVersion &&
    String(installedFile.modVersion) !== String(mod._sVersion)
  ) {
    return false; // Outdated
  }

  // If we don't have detailed file info from the API (e.g., Browse grid), we CANNOT
  // accurately detect file-level updates. To prevent false positives, we assume it's
  // up to date if the version string hasn't changed (or doesn't exist).
  const hasDetailedFiles = Array.isArray(mod._aFiles) && mod._aFiles.length > 0;
  if (!hasDetailedFiles) {
    return true; 
  }

  // Find the exact file the user installed in the remote list
  const matchedRemoteFile = remoteFile || findMatchingRemoteFile(installedFile, mod);

  if (matchedRemoteFile) {
    // RULE C: The File Update (Same ID, Newer Date)
    // The exact file is still there. Check if its specific _tsDateAdded has changed.
    // This happens if the author replaces the file on the backend without changing its ID.
    const installedFileAddedAt = toUnixSeconds(installedFile.fileAddedAt);
    const remoteFileAddedAt = toUnixSeconds(matchedRemoteFile._tsDateAdded);

    if (installedFileAddedAt && remoteFileAddedAt) {
      // 5-minute buffer for server time sync quirks
      return installedFileAddedAt + 300 >= remoteFileAddedAt;
    }

    // If dates are missing, but the IDs match exactly, assume it's current.
    if (
      installedFile.gbFileId != null &&
      Number(installedFile.gbFileId) === Number(matchedRemoteFile._idRow)
    ) {
      return true;
    }
  } else {
    // RULE B: The Silent Replacement
    // The exact file the user installed is NO LONGER in the remote list.
    // This usually means the author deleted V1 and uploaded V2 without changing the version string.
    // Check if ANY file in the mod is newer than our installation date.
    const installedAt = toUnixSeconds(installedFile.installedAt) || toUnixSeconds(installedFile.fileAddedAt);
    
    if (installedAt > 0) {
      // Find the newest file in the mod
      const newestRemoteFileDate = Math.max(
        ...mod._aFiles.map((f) => toUnixSeconds(f._tsDateAdded) || 0)
      );

      // If a file exists that is newer than our install (with a 1-hour buffer for upload delays)
      if (newestRemoteFileDate > installedAt + 3600) {
        return false; // There is a newer file, so it's outdated.
      }
    }
  }

  // If all else fails (e.g., no version string, file still exists but no dates, 
  // or file deleted but no newer file found), we assume it is up to date to 
  // avoid false-positive update spam.
  return true;
}

export function getInstalledModUpdateState(mod, installedFileInfo) {
  const installedFiles = installedFileInfo?.installedFiles;
  if (!mod || !Array.isArray(installedFiles) || installedFiles.length === 0) {
    return {
      isInstalled: false,
      hasUpdate: false,
      hasAnyCurrentInstall: false,
    };
  }

  const hasAnyCurrentInstall = installedFiles.some((installedFile) =>
    isInstalledFileUpToDate(installedFile, mod),
  );

  return {
    isInstalled: true,
    hasUpdate: !hasAnyCurrentInstall,
    hasAnyCurrentInstall,
  };
}

export function getInstalledFileUpdateState(mod, installedFile, remoteFile) {
  return {
    isInstalled: Boolean(installedFile),
    hasUpdate: installedFile
      ? !isInstalledFileUpToDate(installedFile, mod, remoteFile)
      : false,
  };
}
