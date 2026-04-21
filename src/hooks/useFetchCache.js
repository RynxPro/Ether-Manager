import { useCallback } from "react";
import { fetchGbCachedQuery } from "../lib/gbQueryCache";

function normalizeIds(modIds = []) {
  return [...new Set(modIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function normalizeBrowseArgs(args = {}) {
  return {
    gbGameId: Number(args.gbGameId) || 0,
    page: Number(args.page) || 1,
    perPage: Number(args.perPage) || 20,
    sort: String(args.sort || ""),
    context: String(args.context || ""),
    search: String(args.search || ""),
    submitterId: args.submitterId == null ? null : Number(args.submitterId) || null,
    featuredOnly: Boolean(args.featuredOnly),
    characterSkins: Boolean(args.characterSkins),
    hideNsfw: Boolean(args.hideNsfw),
    hydrateZeroDownloadCounts: args.hydrateZeroDownloadCounts !== false,
  };
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

  const browseMods = useCallback(async (args = {}, options = {}) => {
    const normalizedArgs = normalizeBrowseArgs(args);

    try {
      if (!window.electronMods?.browseGbMods) {
        throw new Error("browseGbMods API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-browse", normalizedArgs],
        () => window.electronMods.browseGbMods(normalizedArgs),
        {
          ttlMs: options.ttlMs ?? 45_000,
          force: options.force === true,
        },
      );
    } catch (error) {
      console.error("Failed to browse mods:", error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  const fetchFeaturedMods = useCallback(async (gbGameId, options = {}) => {
    const normalizedGameId = Number(gbGameId);

    try {
      if (!window.electronMods?.fetchGbFeaturedMods) {
        throw new Error("fetchGbFeaturedMods API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-featured", normalizedGameId],
        () => window.electronMods.fetchGbFeaturedMods(normalizedGameId),
        {
          ttlMs: options.ttlMs ?? 120_000,
          force: options.force === true,
        },
      );
    } catch (error) {
      console.error("Failed to fetch featured mods:", error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  const fetchMemberProfile = useCallback(async (memberId, options = {}) => {
    const normalizedMemberId = Number(memberId);

    try {
      if (!window.electronMods?.fetchGbMemberProfile) {
        throw new Error("fetchGbMemberProfile API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-member-profile", normalizedMemberId],
        () => window.electronMods.fetchGbMemberProfile(normalizedMemberId),
        {
          ttlMs: options.ttlMs ?? 90_000,
          force: options.force === true,
        },
      );
    } catch (error) {
      console.error("Failed to fetch member profile:", error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  const searchModSuggestions = useCallback(async (args = {}, options = {}) => {
    const normalizedArgs = {
      query: String(args.query || "").trim(),
      gbGameId: args.gbGameId == null ? null : Number(args.gbGameId) || null,
    };

    if (normalizedArgs.query.length < 2) {
      return { success: true, data: [] };
    }

    try {
      if (!window.electronMods?.searchGbModSuggestions) {
        throw new Error("searchGbModSuggestions API not available");
      }

      return await fetchGbCachedQuery(
        ["gb-suggestions", normalizedArgs.gbGameId, normalizedArgs.query.toLowerCase()],
        () => window.electronMods.searchGbModSuggestions(normalizedArgs),
        {
          ttlMs: options.ttlMs ?? 15_000,
          force: options.force === true,
        },
      );
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
      return {
        success: false,
        error: error.message,
        code: error?.code,
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }, []);

  return {
    fetchMod,
    fetchModsBatch,
    fetchModsSummaries,
    browseMods,
    fetchFeaturedMods,
    fetchMemberProfile,
    searchModSuggestions,
  };
}
