import { useCallback, useEffect, useMemo, useState } from "react";

import { useFetchCache } from "./useFetchCache";
import { useLoadGameMods } from "./useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { isModInCollection } from "../lib/modClassification";
import { createInstalledFileInfoFromMods } from "../lib/modUpdateState";
import {
  createGbInstallPayload,
  createOptimisticInstallRecord,
  runGbInstallJob,
} from "../lib/installFlow";

function sortCollectionMods(mods) {
  return [...mods].sort((a, b) => {
    if (a.isEnabled === b.isEnabled) {
      return a.name.localeCompare(b.name);
    }
    return a.isEnabled ? -1 : 1;
  });
}

export function useCharacterDetailController({
  character,
  hideHeader = false,
  searchQuery = "",
}) {
  const game = useAppStore((state) => state.activeGame);
  const addDownload = useAppStore((state) => state.addDownload);
  const completeDownload = useAppStore((state) => state.completeDownload);
  const [gbDataMap, setGbDataMap] = useState({});
  const [modToDelete, setModToDelete] = useState(null);
  const [disablingAll, setDisablingAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState("");

  const { fetchMod } = useFetchCache();
  const {
    mods: allMods,
    loadMods: reloadAllMods,
    setMods: setAllMods,
  } = useLoadGameMods(game.id, true);

  const mods = useMemo(() => {
    const collectionMods = allMods.filter((mod) =>
      isModInCollection(mod, character.name),
    );
    return sortCollectionMods(collectionMods);
  }, [allMods, character.name]);

  useEffect(() => {
    let cancelled = false;

    const loadGbData = async () => {
      const gbIds = [
        ...new Set(mods.filter((mod) => mod.gamebananaId).map((mod) => mod.gamebananaId)),
      ];

      if (gbIds.length === 0) {
        setGbDataMap({});
        return;
      }

      const results = await Promise.allSettled(gbIds.map((id) => fetchMod(id)));
      if (cancelled) return;

      const nextMap = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value.success) {
          const gbMod = result.value.data;
          const gbId = gbIds[index];
          nextMap[gbId] = {
            thumbnailUrl: gbMod.thumbnailUrl,
            fullData: gbMod,
          };
        }
      });
      setGbDataMap(nextMap);
    };

    loadGbData();
    return () => {
      cancelled = true;
    };
  }, [mods, fetchMod]);

  const installedModsInfo = useMemo(() => {
    const infoMap = {};
    const groupedModsByGbId = new Map();

    mods.forEach((mod) => {
      if (mod.gamebananaId == null) return;
      if (!groupedModsByGbId.has(mod.gamebananaId)) {
        groupedModsByGbId.set(mod.gamebananaId, []);
      }
      groupedModsByGbId.get(mod.gamebananaId).push(mod);
    });

    groupedModsByGbId.forEach((modsForGbId, gbId) => {
      infoMap[gbId] = createInstalledFileInfoFromMods(modsForGbId);
    });

    return infoMap;
  }, [mods]);

  const handleToggle = useCallback(
    async (mod, enable) => {
      if (!window.electronConfig || !window.electronMods) return;

      setAllMods((prevMods) =>
        prevMods.map((entry) =>
          entry.originalFolderName === mod.originalFolderName
            ? { ...entry, isEnabled: enable }
            : entry,
        ),
      );

      try {
        const config = await window.electronConfig.getConfig();
        const importerPath = config[game.id];

        const result = await window.electronMods.toggleMod({
          importerPath,
          originalFolderName: mod.originalFolderName,
          enable,
        });

        if (!result.success) {
          throw new Error(result.error || "Failed to toggle mod.");
        }

        setAllMods((prevMods) =>
          prevMods.map((entry) =>
            entry.originalFolderName === mod.originalFolderName
              ? {
                  ...entry,
                  isEnabled: enable,
                  originalFolderName: result.newFolderName || mod.originalFolderName,
                }
              : entry,
          ),
        );
        await reloadAllMods(true);
      } catch (error) {
        setAllMods((prevMods) =>
          prevMods.map((entry) =>
            entry.originalFolderName === mod.originalFolderName
              ? { ...entry, isEnabled: !enable }
              : entry,
          ),
        );
        alert(`Failed to toggle mod: ${error.message}`);
      }
    },
    [game.id, reloadAllMods, setAllMods],
  );

  const handleDisableAll = useCallback(async () => {
    const enabledMods = mods.filter((mod) => mod.isEnabled);
    if (enabledMods.length === 0) return;

    setDisablingAll(true);
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      const results = await Promise.all(
        enabledMods.map((mod) =>
          window.electronMods.toggleMod({
            importerPath,
            originalFolderName: mod.originalFolderName,
            enable: false,
          }),
        ),
      );

      const failures = results.filter((result) => !result.success);
      if (failures.length > 0) {
        alert(
          `Failed to disable ${failures.length} mod(s).\n\n` +
            `This usually happens if the game is currently open and locking the files. ` +
            `Please close the game and try again.`,
        );
      }

      await reloadAllMods(true);
    } finally {
      setDisablingAll(false);
    }
  }, [game.id, mods, reloadAllMods]);

  const handleOpenFolder = useCallback(async (mod) => {
    if (window.electronMods) {
      await window.electronMods.openFolder(mod.path);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!window.electronConfig || !window.electronMods) return;

    const config = await window.electronConfig.getConfig();
    const importerPath = config[game.id];

    const result = await window.electronMods.importMod({
      importerPath,
      characterName: character.name,
      gameId: game.id,
    });

    if (result?.success) {
      await reloadAllMods(true);
    } else if (result && !result.canceled) {
      alert(result.error || "Failed to import mod.");
    }
  }, [character.name, game.id, reloadAllMods]);

  const handleInstallUpdate = useCallback(
    async ({
      characterName,
      gbModId,
      fileUrl,
      fileName,
      gbFileId,
      fileAddedAt,
      modVersion,
      modName,
    }) => {
      if (!window.electronConfig || !window.electronMods) return;

      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (!importerPath) throw new Error("No importer path configured.");

      const selection = {
        characterName,
        gbModId,
        fileUrl,
        fileName,
        gbFileId,
        fileAddedAt,
        modVersion,
        modName,
      };

      runGbInstallJob({
        electronMods: window.electronMods,
        selection,
        payload: createGbInstallPayload({
          importerPath,
          gameId: game.id,
          selection,
        }),
        addDownload,
        completeDownload,
        onInstalled: async () => {
          const nextRecord = createOptimisticInstallRecord(selection);
          setAllMods((prevMods) =>
            prevMods.map((entry) => {
              if (Number(entry.gamebananaId) !== Number(gbModId)) {
                return entry;
              }

              const installedFiles = entry.installedFiles || [];
              const hasRecord = installedFiles.some(
                (file) =>
                  (nextRecord.gbFileId != null &&
                    file.gbFileId != null &&
                    Number(file.gbFileId) === Number(nextRecord.gbFileId)) ||
                  file.fileName === nextRecord.fileName,
              );

              if (hasRecord) return entry;

              return {
                ...entry,
                installedFiles: [...installedFiles, nextRecord],
              };
            }),
          );

          await reloadAllMods(true);
        },
      });
    },
    [addDownload, completeDownload, game.id, reloadAllMods, setAllMods],
  );

  const handleAssign = useCallback(
    async (mod, newCharacterName) => {
      if (!window.electronConfig || !window.electronMods) return;

      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];

      const result = await window.electronMods.assignMod({
        importerPath,
        originalFolderName: mod.originalFolderName,
        newCharacterName,
      });

      if (result.success) {
        await reloadAllMods(true);
      } else {
        alert(result.error || "Failed to assign mod.");
      }
    },
    [game.id, reloadAllMods],
  );

  const handleDelete = useCallback((mod) => {
    setModToDelete(mod);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!modToDelete || !window.electronConfig || !window.electronMods) return;

    setShowDeleteConfirm(false);
    const mod = modToDelete;
    setModToDelete(null);

    const config = await window.electronConfig.getConfig();
    const importerPath = config[game.id];
    const result = await window.electronMods.deleteMod({
      importerPath,
      originalFolderName: mod.originalFolderName,
    });

    if (result?.success) {
      await reloadAllMods(true);
    } else {
      alert(result?.error || "Failed to delete mod.");
    }
  }, [game.id, modToDelete, reloadAllMods]);

  const enabledCount = mods.filter((mod) => mod.isEnabled).length;
  const disabledCount = mods.length - enabledCount;
  const effectiveSearchQuery = hideHeader ? searchQuery : localSearchQuery;

  return {
    game,
    mods,
    gbDataMap,
    installedModsInfo,
    disablingAll,
    modToDelete,
    showDeleteConfirm,
    localSearchQuery,
    setLocalSearchQuery,
    enabledCount,
    disabledCount,
    effectiveSearchQuery,
    handleToggle,
    handleDisableAll,
    handleOpenFolder,
    handleImport,
    handleInstallUpdate,
    handleAssign,
    handleDelete,
    confirmDelete,
    closeDeleteConfirm: () => {
      setShowDeleteConfirm(false);
      setModToDelete(null);
    },
    reloadAllMods,
  };
}
