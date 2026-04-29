import { useState, useEffect, useCallback, useRef } from "react";
import { getAllCharacterNames, GLOBAL_CATEGORIES } from "../lib/portraits";
import { useAppStore } from "../store/useAppStore";
import { VISIBLE_GAMES } from "../gameConfig";
import { createInstalledFileInfoFromMods } from "../lib/modUpdateState";

function normalizeImporterPath(pathValue) {
  return String(pathValue || "")
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

export function useLoadGameMods(gameId, isActive = true) {
  const cachedMods = useAppStore(state => state.modsCache[gameId]);
  const cachedMeta = useAppStore(state => state.modsCacheMeta[gameId]);
  const setModsCache = useAppStore(state => state.setModsCache);
  const setInstalledModsMap = useAppStore(state => state.setInstalledModsMap);
  const configVersion = useAppStore(state => state.configVersion);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastSeenConfigVersion = useRef(configVersion);

  const loadMods = useCallback(async (force = false) => {
    if (!window.electronConfig || !window.electronMods) {
      setError("Electron APIs not available");
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[gameId];
      const normalizedImporterPath = normalizeImporterPath(importerPath);
      const sharedImporterAcrossGames = Boolean(
        normalizedImporterPath &&
          VISIBLE_GAMES.some(
            (game) =>
              game.id !== gameId &&
              normalizeImporterPath(config[game.id]) === normalizedImporterPath,
          ),
      );

      if (
        !force &&
        cachedMods !== undefined &&
        cachedMeta?.importerPath === (importerPath || null) &&
        cachedMeta?.sharedImporterAcrossGames === sharedImporterAcrossGames
      ) {
        return cachedMods;
      }

      if (!importerPath) {
        setModsCache(gameId, [], {
          importerPath: null,
          sharedImporterAcrossGames: false,
        });
        return [];
      }

      const knownCharacters = getAllCharacterNames(gameId);
      const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
      const loadedMods = await window.electronMods.getMods(
        importerPath,
        allParseableNames,
        gameId,
        { sharedImporterAcrossGames },
      );
      setModsCache(gameId, loadedMods, {
        importerPath,
        sharedImporterAcrossGames,
      });

      // Derive and store the pre-computed installedModsMap.
      // This is the canonical installed-file map consumed by all update-aware
      // UI surfaces. Keeping it centralized prevents each screen from
      // rebuilding slightly different installed-file shapes.
      const infoMap = {};
      const groupedModsByGbId = new Map();
      loadedMods.forEach((m) => {
        const gbId = Number(m.gamebananaId);
        if (!gbId) return;
        if (!groupedModsByGbId.has(gbId)) groupedModsByGbId.set(gbId, []);
        groupedModsByGbId.get(gbId).push(m);
      });
      groupedModsByGbId.forEach((modsForGbId, gbId) => {
        infoMap[gbId] = createInstalledFileInfoFromMods(modsForGbId);
      });
      setInstalledModsMap(gameId, infoMap);

      return loadedMods;
    } catch (err) {
      console.error("Failed to load mods:", err);
      setError(err.message || "Failed to load mods");
      setModsCache(gameId, [], {
        importerPath: cachedMeta?.importerPath ?? null,
        sharedImporterAcrossGames:
          cachedMeta?.sharedImporterAcrossGames ?? false,
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [gameId, cachedMeta, cachedMods, setModsCache, setInstalledModsMap]);

  useEffect(() => {
    const configChanged = lastSeenConfigVersion.current !== configVersion;
    lastSeenConfigVersion.current = configVersion;

    if (isActive && (cachedMods === undefined || configChanged)) {
      loadMods();
    }
  }, [loadMods, isActive, cachedMods, configVersion]);

  // Support local optimistic updates that synchronize globally
  const setMods = useCallback((newMods) => {
    setModsCache(
      gameId,
      typeof newMods === 'function' ? newMods(cachedMods || []) : newMods,
      cachedMeta,
    );
  }, [gameId, setModsCache, cachedMods, cachedMeta]);

  return {
    mods: cachedMods || [],
    loading,
    error,
    loadMods,
    setMods,
  };
}
