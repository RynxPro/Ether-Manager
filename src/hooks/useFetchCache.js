import { useCallback, useState } from "react";
import {
  getCachedMod,
  setCachedMod,
  getCachedBatch,
  setCachedBatch,
  generateBatchCacheKey,
} from "../lib/fetchCache";

/**
 * Custom hook for caching GameBanana fetch requests
 * Avoids redundant API calls within 5 minute window
 */
export function useFetchCache() {
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheMisses, setCacheMisses] = useState(0);

  /**
   * Fetch single mod with caching
   */
  const fetchMod = useCallback(async (modId) => {
    // Check cache first
    const cached = getCachedMod(modId);
    if (cached) {
      setCacheHits((prev) => prev + 1);
      return { success: true, data: cached, fromCache: true };
    }

    // Fetch from API
    setCacheMisses((prev) => prev + 1);
    try {
      if (!window.electronMods?.fetchGbMod) {
        throw new Error("fetchGbMod API not available");
      }

      const result = await window.electronMods.fetchGbMod(modId);
      if (result.success && result.data) {
        // Store in cache
        setCachedMod(modId, result.data);
      }
      return { ...result, fromCache: false };
    } catch (error) {
      console.error(`Failed to fetch mod ${modId}:`, error);
      return { success: false, error: error.message, fromCache: false };
    }
  }, []);

  /**
   * Fetch multiple mods with caching
   */
  const fetchModsBatch = useCallback(async (modIds) => {
    if (!modIds || modIds.length === 0) {
      return { success: true, data: [], fromCache: false };
    }

    const cacheKey = `batch_${modIds.join("_")}`;
    const cached = getCachedBatch(cacheKey);
    if (cached) {
      setCacheHits((prev) => prev + 1);
      return { success: true, data: cached, fromCache: true };
    }

    setCacheMisses((prev) => prev + 1);
    try {
      if (!window.electronMods?.fetchGbModsBatch) {
        throw new Error("fetchGbModsBatch API not available");
      }

      const result = await window.electronMods.fetchGbModsBatch(modIds);
      if (result.success && result.data) {
        // Store in cache
        setCachedBatch(cacheKey, result.data);
        // Note: We DO NOT cache individual mods here because the batch API 
        // returns a different data shape (_idRow, _aPreviewMedia) than the 
        // single mod API (id, thumbnailUrl, description).
      }
      return { ...result, fromCache: false };
    } catch (error) {
      console.error("Failed to fetch mods batch:", error);
      return { success: false, error: error.message, fromCache: false };
    }
  }, []);

  const getCacheStats = useCallback(() => {
    return { cacheHits, cacheMisses };
  }, [cacheHits, cacheMisses]);

  return { fetchMod, fetchModsBatch, getCacheStats };
}
