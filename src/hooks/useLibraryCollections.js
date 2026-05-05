import { useEffect, useMemo, useState } from "react";

import { VISIBLE_GAMES } from "../gameConfig";
import { buildLibraryCollections, filterLibraryCollections } from "../lib/libraryCollections";
import { useLoadGameMods } from "./useLoadGameMods";

function normalizeImporterPath(pathValue) {
  return String(pathValue || "")
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

export function useLibraryCollections({
  gameId,
  isActive = true,
  activeTab = "characters",
  searchQuery = "",
}) {
  const { mods, loadMods } = useLoadGameMods(gameId, isActive);
  const [sharedImporterGames, setSharedImporterGames] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadSharedImporterGames = async () => {
      if (!window.electronConfig?.getConfig) {
        setSharedImporterGames([]);
        return;
      }

      try {
        const config = await window.electronConfig.getConfig();
        if (cancelled) return;

        const currentPath = normalizeImporterPath(config[gameId]);
        if (!currentPath) {
          setSharedImporterGames([]);
          return;
        }

        const sharedGames = VISIBLE_GAMES.filter(
          (candidate) =>
            candidate.id !== gameId &&
            normalizeImporterPath(config[candidate.id]) === currentPath,
        );

        setSharedImporterGames(sharedGames);
      } catch {
        if (!cancelled) {
          setSharedImporterGames([]);
        }
      }
    };

    loadSharedImporterGames();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const collections = useMemo(
    () => buildLibraryCollections(mods, gameId),
    [mods, gameId],
  );

  const displayItems = useMemo(() => {
    let items = [];
    if (activeTab === "characters") {
      items = collections.characters;
    } else if (activeTab === "ui") {
      items = collections.ui;
    } else {
      items = collections.misc;
    }

    return filterLibraryCollections(items, searchQuery);
  }, [collections, activeTab, searchQuery]);

  const totalEnabledMods = useMemo(
    () => mods.filter((mod) => mod.isEnabled).length,
    [mods],
  );

  return {
    mods,
    loadMods,
    collections,
    displayItems,
    counts: collections.counts,
    totalEnabledMods,
    sharedImporterGames,
  };
}
