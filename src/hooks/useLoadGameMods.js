import { useState, useEffect, useCallback, useRef } from "react";
import { getAllCharacterNames, GLOBAL_CATEGORIES } from "../lib/portraits";
import { useAppStore } from "../store/useAppStore";

export function useLoadGameMods(gameId, isActive = true) {
  const cachedMods = useAppStore(state => state.modsCache[gameId]);
  const cachedMeta = useAppStore(state => state.modsCacheMeta[gameId]);
  const setModsCache = useAppStore(state => state.setModsCache);
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

      if (
        !force &&
        cachedMods !== undefined &&
        cachedMeta?.importerPath === (importerPath || null)
      ) {
        return cachedMods;
      }

      if (!importerPath) {
        setModsCache(gameId, [], { importerPath: null });
        return [];
      }

      const knownCharacters = getAllCharacterNames(gameId);
      const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
      const loadedMods = await window.electronMods.getMods(
        importerPath,
        allParseableNames,
        gameId,
      );
      setModsCache(gameId, loadedMods, { importerPath });
      return loadedMods;
    } catch (err) {
      console.error("Failed to load mods:", err);
      setError(err.message || "Failed to load mods");
      setModsCache(gameId, [], {
        importerPath: cachedMeta?.importerPath ?? null,
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [gameId, cachedMeta, cachedMods, setModsCache]);

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
