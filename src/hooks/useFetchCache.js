import { useCallback } from "react";
import { fetchGbCachedQuery } from "../lib/gbQueryCache";

function normalizeIds(modIds = []) {
  return [...new Set(modIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

/**
 * Thin wrapper hook for GameBanana fetches.
 * The Electron service remains the source of truth for HTTP throttling/cache,
 * while this renderer layer deduplicates/remembers logical queries across
 * remounts and sibling UI surfaces.
 *
 * @see electron/services/gamebanana.js for request orchestration
 */
export function useFetchCache() {
  /**
   * Fetch single mod.
   */
  const fetchMod = useCallback(async (modId, options = {}) => {
    try {
      if (!window.electronMods?.fetchGbMod) {
        throw new Error("fetchGbMod API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-mod", Number(modId)],
        () => window.electronMods.fetchGbMod(modId),
        {
          ttlMs: options.ttlMs ?? 90_000,
          force: options.force === true,
        },
      );
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
   * Fetch multiple mods in a batch.
   */
  const fetchModsBatch = useCallback(async (modIds, options = {}) => {
    const normalizedIds = normalizeIds(modIds);
    if (normalizedIds.length === 0) {
      return { success: true, data: [] };
    }

    try {
      if (!window.electronMods?.fetchGbModsBatch) {
        throw new Error("fetchGbModsBatch API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-mods-batch", normalizedIds],
        () => window.electronMods.fetchGbModsBatch(normalizedIds, options),
        {
          ttlMs: options.ttlMs ?? 60_000,
          force: options.force === true,
        },
      );
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

  const fetchModsSummaries = useCallback(async (modIds, options = {}) => {
    const normalizedIds = normalizeIds(modIds);
    if (normalizedIds.length === 0) {
      return { success: true, data: [] };
    }

    try {
      if (!window.electronMods?.fetchGbModsSummaries) {
        throw new Error("fetchGbModsSummaries API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-mods-summaries", normalizedIds],
        () => window.electronMods.fetchGbModsSummaries(normalizedIds, options),
        {
          ttlMs: options.ttlMs ?? 45_000,
          force: options.force === true,
        },
      );
    } catch (error) {
      console.error("Failed to fetch mod summaries:", error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  return { fetchMod, fetchModsBatch, fetchModsSummaries };
}
