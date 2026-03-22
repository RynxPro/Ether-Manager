import { useState, useEffect, useCallback } from "react";
import { getAllCharacterNames, GLOBAL_CATEGORIES } from "../lib/portraits";

export function useLoadGameMods(gameId, isActive = true) {
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMods = useCallback(async () => {
    if (!window.electronConfig || !window.electronMods) {
      setError("Electron APIs not available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[gameId];

      if (!importerPath) {
        setMods([]);
        return;
      }

      const knownCharacters = getAllCharacterNames(gameId);
      const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
      const loadedMods = await window.electronMods.getMods(
        importerPath,
        allParseableNames,
        gameId,
      );
      setMods(loadedMods);
    } catch (err) {
      console.error("Failed to load mods:", err);
      setError(err.message || "Failed to load mods");
      setMods([]);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (isActive) {
      loadMods();
    }
  }, [loadMods, isActive]);

  return {
    mods,
    loading,
    error,
    loadMods,
    setMods,
  };
}
