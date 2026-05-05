import { useMemo, useState, useEffect, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLoadGameMods } from "./useLoadGameMods";
import {
  buildPresetDiff,
  createPresetSnapshotFromLibrary,
  matchesPresetMod,
} from "../lib/presetMatching";
import { getModDisplayCharacter } from "../lib/modClassification";

/**
 * Phase 3: Active Loadout Hook
 *
 * Tracks whether the user's current library state matches their active preset.
 * Returns `status`: "synced" | "modified" | "none"
 * Also exposes actions: revertToPreset, updatePreset, clearActivePreset
 */
export function useActiveLoadout() {
  const activePresetId = useAppStore((state) => state.activePresetId);
  const activePresetGameId = useAppStore((state) => state.activePresetGameId);
  const activePresetName = useAppStore((state) => state.activePresetName);
  const setActivePreset = useAppStore((state) => state.setActivePreset);
  const clearActivePreset = useAppStore((state) => state.clearActivePreset);
  const activeGame = useAppStore((state) => state.activeGame);

  const { mods: libraryMods, loadMods } = useLoadGameMods(activeGame.id);

  const [activePreset, setActivePresetData] = useState(null);
  const [loadingPreset, setLoadingPreset] = useState(false);

  const loadActivePreset = useCallback(async (presetId, presetGameId) => {
    setLoadingPreset(true);
    try {
      const presets = await window.electronMods.getPresets(presetGameId);
      const found = (presets || []).find((p) => p.id === presetId);
      if (found) {
        setActivePresetData(found);
      } else {
        clearActivePreset();
        setActivePresetData(null);
      }
    } catch {
      setActivePresetData(null);
    } finally {
      setLoadingPreset(false);
    }
  }, [clearActivePreset]);

  // Load the full preset object from disk when activePresetId changes
  useEffect(() => {
    if (!activePresetId || !activePresetGameId) {
      return;
    }
    let cancelled = false;
    void loadActivePreset(activePresetId, activePresetGameId).catch(() => {
      if (!cancelled) {
        setLoadingPreset(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activePresetId, activePresetGameId, loadActivePreset]);

  /**
   * Deviation detection.
   * Returns "none" | "synced" | "modified"
   */
  const status = useMemo(() => {
    if (!activePresetId || !activePresetGameId || !activePreset) return "none";
    if (!libraryMods || libraryMods.length === 0) return "none";

    const presetMods = activePreset.mods || [];

    for (const presetMod of presetMods) {
      const libMod = libraryMods.find((m) => matchesPresetMod(m, presetMod));
      // A mod that should exist is missing or is now disabled → modified
      if (!libMod || !libMod.isEnabled) return "modified";
    }

    // Check if any currently-enabled mods for the same characters aren't in the preset
    const presetCharacters = new Set(presetMods.map((m) => m.character));
    for (const libMod of libraryMods) {
      if (!libMod.isEnabled) continue;
      if (!presetCharacters.has(libMod.character)) continue;
      const inPreset = presetMods.some((pm) => matchesPresetMod(libMod, pm));
      if (!inPreset) return "modified";
    }

    return "synced";
  }, [activePreset, activePresetGameId, activePresetId, libraryMods]);

  /**
   * Re-applies the active preset (reverts changes).
   */
  const revertToPreset = useCallback(async (importerPath, applyScope = "scoped") => {
    if (!activePreset) return { success: false };
    const diff = buildPresetDiff(activePreset.mods, libraryMods, applyScope);
    const enableList = diff.willEnable.map((m) => m.originalFolderName);
    const disableList = diff.willDisable.map((m) => m.originalFolderName);

    const result = await window.electronMods.executePresetDiff({
      importerPath,
      enableList,
      disableList,
    });
    if (result.success) {
      await loadMods(true);
    }
    return result;
  }, [activePreset, libraryMods, loadMods]);

  /**
   * Saves current library state over the active preset (updates it).
   */
  const saveCurrentAsPreset = useCallback(async () => {
    if (!activePreset) return { success: false };
    const newPreset = {
      ...activePreset,
      mods: createPresetSnapshotFromLibrary(
        libraryMods,
        getModDisplayCharacter,
        { enabledOnly: true },
      ),
      updatedAt: new Date().toISOString(),
    };
    const result = await window.electronMods.savePreset(newPreset);
    if (result.success) {
      setActivePreset(newPreset);
      setActivePresetData(newPreset);
    }
    return result;
  }, [activePreset, libraryMods, setActivePreset]);

  return {
    activePresetId,
    activePresetName,
    activePreset: activePresetId && activePresetGameId ? activePreset : null,
    loadingPreset: activePresetId && activePresetGameId ? loadingPreset : false,
    status, // "none" | "synced" | "modified"
    clearActivePreset,
    revertToPreset,
    saveCurrentAsPreset,
  };
}
