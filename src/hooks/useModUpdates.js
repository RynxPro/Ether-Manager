import { useState, useEffect, useCallback } from 'react';
import { useFetchCache } from './useFetchCache';

/**
 * Custom hook for detecting mod updates
 * Monitors installed mods for newer versions on GameBanana
 * 
 * @param {Array} mods - Array of installed mods with gamebananaId
 * @param {Object} options - Configuration options
 * @returns {Object} { updates, checking, checkUpdates, dismissUpdate, dismissAll }
 */
export function useModUpdates(
  mods = [],
  options = {
    autoCheck: true,
    checkInterval: 5 * 60 * 1000, // 5 minutes
    timeBuffer: 300, // 5 minutes in seconds
  }
) {
  const [updates, setUpdates] = useState({});
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const { fetchModsBatch } = useFetchCache();

  // Filter mods with GameBanana IDs
  const modsWithId = mods.filter((m) => m.gamebananaId);
  const gbIds = useCallback(
    () => [...new Set(modsWithId.map((m) => m.gamebananaId))],
    [modsWithId],
  );

  // Check for updates
  const checkUpdates = useCallback(async () => {
    if (modsWithId.length === 0) return;

    setChecking(true);

    try {
      const ids = gbIds();
      const result = await fetchModsBatch(ids);

      if (result.success && result.data) {
        const newUpdates = {};
        const latestDates = {};

        // Map latest update dates
        result.data.forEach((gbMod) => {
          if (gbMod._idRow) {
            latestDates[String(gbMod._idRow)] = gbMod._tsDateUpdated;
          }
        });

        // Check each installed mod
        modsWithId.forEach((mod) => {
          const gbId = String(mod.gamebananaId);
          const latestDate = latestDates[gbId];

          if (latestDate && mod.installedAt) {
            const installedDate = new Date(mod.installedAt).getTime() / 1000;
            const timeBuffer = options.timeBuffer || 300;

            // Update available if latest is newer than installed (with buffer)
            if (latestDate > installedDate + timeBuffer) {
              newUpdates[gbId] = {
                modId: mod.id,
                modName: mod.name,
                gamebananaId: mod.gamebananaId,
                installedDate,
                latestDate,
                daysSinceUpdate: Math.floor(
                  (latestDate - installedDate) / 86400
                ),
              };
            }
          }
        });

        setUpdates(newUpdates);
        setLastChecked(new Date());
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setChecking(false);
    }
  }, [modsWithId, fetchModsBatch, gbIds, options.timeBuffer]);

  // Auto-check on mount and periodic intervals
  useEffect(() => {
    if (!options.autoCheck) return;

    // Check immediately
    checkUpdates();

    // Set up interval
    const interval = setInterval(checkUpdates, options.checkInterval);

    return () => clearInterval(interval);
  }, [checkUpdates, options.autoCheck, options.checkInterval]);

  // Dismiss single update
  const dismissUpdate = useCallback((gamebananaId) => {
    setUpdates((prev) => {
      const newUpdates = { ...prev };
      delete newUpdates[String(gamebananaId)];
      return newUpdates;
    });
  }, []);

  // Dismiss all updates
  const dismissAll = useCallback(() => {
    setUpdates({});
  }, []);

  const updateCount = Object.keys(updates).length;

  return {
    updates,
    updateCount,
    checking,
    lastChecked,
    checkUpdates,
    dismissUpdate,
    dismissAll,
  };
}
