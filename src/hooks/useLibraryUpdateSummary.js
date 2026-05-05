import { useEffect, useMemo, useState } from "react";

import { useFetchCache } from "./useFetchCache";
import { useNetworkStatus } from "./useNetworkStatus";
import { useAppStore } from "../store/useAppStore";
import { getModClassification } from "../lib/modClassification";
import {
  createInstalledFileInfo,
  getInstalledModUpdateState,
  getInstalledModsUpdateSignature,
} from "../lib/modUpdateState";

const UPDATE_CACHE_TTL_MS = 2 * 60 * 1000;

export function useLibraryUpdateSummary({ gameId, mods, isActive = true }) {
  const [updatesMap, setUpdatesMap] = useState({});
  const [apiNotice, setApiNotice] = useState("");
  const updateCheckCache = useAppStore((state) => state.updateCheckCache);
  const setUpdateCheckCache = useAppStore((state) => state.setUpdateCheckCache);
  const { fetchModsBatch } = useFetchCache();
  const isOnline = useNetworkStatus();

  const updateSignature = useMemo(
    () => getInstalledModsUpdateSignature(mods),
    [mods],
  );

  useEffect(() => {
    const checkUpdates = async () => {
      if (!isActive) return;
      if (!isOnline || !mods || mods.length === 0) {
        setApiNotice("");
        setUpdatesMap({});
        return;
      }

      const modsWithId = mods.filter((mod) => mod.gamebananaId);
      const gbIds = [...new Set(modsWithId.map((mod) => mod.gamebananaId))];
      if (gbIds.length === 0) {
        setApiNotice("");
        setUpdatesMap({});
        return;
      }

      const cachedEntry = updateCheckCache[gameId];
      if (
        cachedEntry?.signature === updateSignature &&
        Date.now() - Number(cachedEntry.checkedAt || 0) < UPDATE_CACHE_TTL_MS
      ) {
        setApiNotice("");
        setUpdatesMap(cachedEntry.updatesMap || {});
        return;
      }

      try {
        const result = await fetchModsBatch(gbIds, {
          priority: "low",
          concurrency: 2,
        });

        if (!result.success) {
          if (result.code === "RATE_LIMITED") {
            const retryInSeconds = Math.max(
              1,
              Math.ceil((Number(result.retryAfterMs) || 5000) / 1000),
            );
            setApiNotice(
              `GameBanana update checks are temporarily paused due to rate limits. Retrying in about ${retryInSeconds}s.`,
            );
          }
          return;
        }

        setApiNotice("");
        const nextUpdatesMap = {};
        const latestModsById = {};

        (result.data || []).forEach((gbMod) => {
          if (gbMod?._idRow) {
            latestModsById[String(gbMod._idRow)] = gbMod;
          }
        });

        mods.forEach((mod) => {
          const gbId = mod.gamebananaId ? String(mod.gamebananaId) : null;
          const gbMod = gbId ? latestModsById[gbId] : null;
          if (!gbId || !gbMod) return;

          const installedFileInfo = createInstalledFileInfo(mod);
          if (!getInstalledModUpdateState(gbMod, installedFileInfo).hasUpdate) {
            return;
          }

          const classification = getModClassification(mod);
          nextUpdatesMap[classification.label] = true;

          if (classification.bucket === "ui") {
            nextUpdatesMap.ui = true;
          } else if (classification.bucket === "misc") {
            nextUpdatesMap.misc = true;
          } else {
            nextUpdatesMap.characters = true;
          }
        });

        setUpdatesMap(nextUpdatesMap);
        setUpdateCheckCache(gameId, {
          signature: updateSignature,
          checkedAt: Date.now(),
          updatesMap: nextUpdatesMap,
        });
      } catch (error) {
        console.error("Failed to check library updates:", error);
      }
    };

    checkUpdates();
  }, [
    fetchModsBatch,
    gameId,
    isActive,
    isOnline,
    mods,
    setUpdateCheckCache,
    updateCheckCache,
    updateSignature,
  ]);

  const totalUpdateGroups = useMemo(
    () => Object.keys(updatesMap).length,
    [updatesMap],
  );

  return {
    updatesMap,
    apiNotice,
    totalUpdateGroups,
  };
}
