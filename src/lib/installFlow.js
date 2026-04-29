import { createInstalledFileRecord } from "./modUpdateState";

/**
 * Install-domain helpers.
 *
 * This module is the renderer-side source of truth for:
 * - how a selected GB mod/file becomes an install request
 * - how install jobs are queued in the downloads store
 * - how optimistic installed-file state is created after success
 *
 * The Electron service remains the source of truth for:
 * - download/extract/validate/write-to-disk
 * - archive safety checks
 * - final aether.json persistence
 */

export function createGbInstallSelection({
  characterName,
  mod,
  file,
  category,
}) {
  if (!mod?._idRow) {
    throw new Error("Missing GameBanana mod id.");
  }
  if (!file?._sDownloadUrl || !file?._sFile) {
    throw new Error("Please select a file to download.");
  }

  return {
    characterName,
    gbModId: mod._idRow,
    fileUrl: file._sDownloadUrl,
    fileName: file._sFile,
    gbFileId: file._idRow ?? null,
    fileAddedAt: file._tsDateAdded ?? null,
    modVersion: mod._sVersion ?? null,
    modName: mod._sName ?? file._sFile,
    category:
      category ??
      mod._aRootCategory?._sName ??
      mod._aCategory?._sName ??
      "Unknown",
  };
}

export function createGbInstallPayload({
  importerPath,
  gameId,
  selection,
}) {
  if (!importerPath) {
    throw new Error("No importer path configured.");
  }

  return {
    importerPath,
    characterName: selection.characterName,
    gbModId: selection.gbModId,
    fileUrl: selection.fileUrl,
    fileName: selection.fileName,
    gbFileId: selection.gbFileId ?? null,
    fileAddedAt: selection.fileAddedAt ?? null,
    modVersion: selection.modVersion ?? null,
    category: selection.category ?? null,
    gameId,
  };
}

export function createOptimisticInstallRecord(selection) {
  return createInstalledFileRecord({
    fileName: selection.fileName,
    installedAt: new Date().toISOString(),
    gbFileId: selection.gbFileId ?? null,
    fileAddedAt: selection.fileAddedAt ?? null,
    modVersion: selection.modVersion ?? null,
  });
}

export function runGbInstallJob({
  electronMods,
  selection,
  payload,
  addDownload,
  completeDownload,
  onInstalled,
}) {
  addDownload({
    id: selection.gbModId,
    title: selection.modName || selection.fileName || "Mod Install",
  });

  void (async () => {
    try {
      const result = await electronMods.installGbMod(payload);
      completeDownload(selection.gbModId, result.success, result.error);

      if (!result.success) {
        return;
      }

      await onInstalled?.(result);
    } catch (error) {
      completeDownload(
        selection.gbModId,
        false,
        error.message || "Installation failed",
      );
    }
  })();
}
