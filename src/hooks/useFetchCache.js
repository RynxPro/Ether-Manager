import { useCallback } from "react";

/**
 * Thin wrapper hook for GameBanana fetches.
 * All caching is handled by the Electron service (RAM cache, 20-90s TTL).
 * React-side caching layer removed to consolidate to single source of truth.
 *
 * @see electron/services/gamebanana.js for cache implementation
 */
export function useFetchCache() {
  /**
   * Fetch single mod (cache hits in Electron service)
   */
  const fetchMod = useCallback(async (modId) => {
    try {
      if (!window.electronMods?.fetchGbMod) {
        throw new Error("fetchGbMod API not available");
      }

      return await window.electronMods.fetchGbMod(modId);
    } catch (error) {
      console.error(`Failed to fetch mod ${modId}:`, error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  /**
   * Fetch multiple mods in a batch (cache hits in Electron service)
   * All caching and deduplication happens server-side.
   */
  const fetchModsBatch = useCallback(async (modIds, options = {}) => {
    if (!modIds || modIds.length === 0) {
      return { success: true, data: [] };
    }

    try {
      if (!window.electronMods?.fetchGbModsBatch) {
        throw new Error("fetchGbModsBatch API not available");
      }

      return await window.electronMods.fetchGbModsBatch(modIds, options);
    } catch (error) {
      console.error("Failed to fetch mods batch:", error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  return { fetchMod, fetchModsBatch };
}
