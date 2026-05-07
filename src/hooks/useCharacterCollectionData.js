import { useEffect, useMemo, useState } from "react";

import { useFetchCache } from "./useFetchCache";
import { useLoadGameMods } from "./useLoadGameMods";
import { isModInCollection } from "../lib/modClassification";
import { createInstalledFileInfoFromMods } from "../lib/modUpdateState";

function sortCollectionMods(mods) {
  return [...mods].sort((a, b) => {
    if (a.isEnabled === b.isEnabled) {
      return a.name.localeCompare(b.name);
    }
    return a.isEnabled ? -1 : 1;
  });
}

export function useCharacterCollectionData({ gameId, characterName }) {
  const [gbDataMap, setGbDataMap] = useState({});
  const { fetchMod } = useFetchCache();
  const {
    mods: allMods,
    loadMods: reloadAllMods,
    setMods: setAllMods,
  } = useLoadGameMods(gameId, true);

  const mods = useMemo(() => {
    const collectionMods = allMods.filter((mod) =>
      isModInCollection(mod, characterName),
    );
    return sortCollectionMods(collectionMods);
  }, [allMods, characterName]);

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

  return {
    mods,
    gbDataMap,
    installedModsInfo,
    reloadAllMods,
    setAllMods,
  };
}
