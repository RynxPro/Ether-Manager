import { useState, useEffect, useCallback } from "react";
import { getAllCharacterNames, GLOBAL_CATEGORIES } from "../lib/portraits";
import { useAppStore } from "../store/useAppStore";

export function useLoadGameMods(gameId, isActive = true) {
  const cachedMods = useAppStore(state => state.modsCache[gameId]);
  const setModsCache = useAppStore(state => state.setModsCache);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMods = useCallback(async (force = false) => {
    // Return early if cached and not forced
    if (!force && cachedMods !== undefined) {
      return cachedMods;
    }

    if (!window.electronConfig || !window.electronMods) {
      setError("Electron APIs not available");
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[gameId];

      if (!importerPath) {
        setModsCache(gameId, []);
        return [];
      }

      const knownCharacters = getAllCharacterNames(gameId);
      const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
      const loadedMods = await window.electronMods.getMods(
        importerPath,
        allParseableNames,
        gameId,
      );
      setModsCache(gameId, loadedMods);
      return loadedMods;
    } catch (err) {
      console.error("Failed to load mods:", err);
      setError(err.message || "Failed to load mods");
      setModsCache(gameId, []);
      return [];
    } finally {
      setLoading(false);
    }
  }, [gameId, cachedMods, setModsCache]);

  useEffect(() => {
    // Only auto-fetch if active AND not yet cached
    if (isActive && cachedMods === undefined) {
      loadMods();
    }
  }, [loadMods, isActive, cachedMods]);

  // Support local optimistic updates that synchronize globally
  const setMods = useCallback((newMods) => {
    setModsCache(gameId, typeof newMods === 'function' ? newMods(cachedMods || []) : newMods);
  }, [gameId, setModsCache, cachedMods]);

  return {
    mods: cachedMods || [],
    loading,
    error,
    loadMods,
    setMods,
  };
}
